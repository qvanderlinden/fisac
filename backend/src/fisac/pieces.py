"""What sales and purchases share: numbering, status and building their reads."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.books.amounts import line_amounts
from fisac.errors import commit, field_error, not_found
from fisac.models import (
    Category,
    CategoryDirection,
    FiscalYear,
    FixedAsset,
    PaymentMethod,
    PaymentMethodType,
    Purchase,
    PurchaseLine,
    Sale,
    SaleLine,
    ThirdParty,
    VatScheme,
)
from fisac.ordering import next_sort_key

# First key of the two-int advisory lock taken while numbering; the second is the
# fiscal year. Apart from the single-key lock that opens a fiscal year.
_SALES_LOCK = 7_301_002
_PURCHASES_LOCK = 7_301_003

_ZERO = Decimal("0.00")


def today() -> date:
    return date.today()


@dataclass(frozen=True)
class Spec:
    """What differs between sales and purchases."""

    piece: Any
    line: Any
    fk: Any  # the line's column pointing at its piece
    lock: int
    direction: CategoryDirection
    wrong_direction: str
    name: str  # for 404s
    purchase: bool


SALES = Spec(
    Sale, SaleLine, SaleLine.sale_id, _SALES_LOCK, CategoryDirection.SALES,
    "Choisissez une catégorie de vente", "Vente", False,
)
PURCHASES = Spec(
    Purchase, PurchaseLine, PurchaseLine.purchase_id, _PURCHASES_LOCK, CategoryDirection.PURCHASES,
    "Choisissez une catégorie d'achat", "Achat", True,
)


def reference(prefix: str, number: int, width: int) -> str:
    return f"{prefix}-{number:0{width}d}"


def status(paid: bool, payment_date: date, today: date) -> Literal["paid", "planned", "late"]:
    if paid:
        return "paid"
    return "planned" if payment_date >= today else "late"


async def fiscal_year_for(session: AsyncSession, day: date, field: str = "document_date") -> FiscalYear:
    year = await session.scalar(
        select(FiscalYear).where(FiscalYear.start_date <= day, FiscalYear.end_date >= day)
    )
    if year is None:
        raise field_error(field, "Aucun exercice ne couvre cette date")
    return year


async def next_number(session: AsyncSession, model: Any, fiscal_year_id: int) -> int:
    """The next number of the year; the lock holds until the caller commits."""
    key = _SALES_LOCK if model is Sale else _PURCHASES_LOCK
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:k1, :k2)"), {"k1": key, "k2": fiscal_year_id}
    )
    last = await session.scalar(
        select(func.max(model.number)).where(model.fiscal_year_id == fiscal_year_id)
    )
    return (last or 0) + 1


def effective_date(piece) -> date:
    return piece.booking_date or piece.document_date


# --- reads -------------------------------------------------------------------


async def _lines(session: AsyncSession, spec: Spec, ids: list[int]) -> dict[int, list[dict]]:
    columns = [spec.line, VatScheme.rate, VatScheme.recoverable_rate]
    query = select(*columns).join(VatScheme, VatScheme.id == spec.line.vat_scheme_id)
    if spec.purchase:
        query = query.add_columns(FixedAsset.id.label("asset_id"), FixedAsset.number.label("asset_number"))
        query = query.join(FixedAsset, FixedAsset.purchase_line_id == PurchaseLine.id, isouter=True)
    query = query.where(spec.fk.in_(ids)).order_by(spec.line.sort_key, spec.line.id)
    by_piece: dict[int, list[dict]] = {i: [] for i in ids}
    for row in await session.execute(query):
        line = row[0]
        amounts = line_amounts(line.unit_price, line.quantity, row.rate, row.recoverable_rate)
        data = {
            "id": line.id,
            "description": line.description,
            "unit_price": line.unit_price,
            "quantity": line.quantity,
            "category_id": line.category_id,
            "vat_scheme_id": line.vat_scheme_id,
            "net": amounts.net,
            "vat": amounts.vat,
        }
        if spec.purchase:
            data |= {
                "recovered": amounts.recovered,
                "charge": amounts.charge,
                "fixed_asset_id": row.asset_id,
                "fixed_asset_number": row.asset_number,
            }
        by_piece[getattr(line, spec.fk.key)].append(data)
    return by_piece


def _total(lines: list[dict], key: str) -> Decimal:
    return sum((line[key] for line in lines), _ZERO)


async def read_pieces(session: AsyncSession, spec: Spec, *where) -> list[dict]:
    """The reads of the pieces matching `where`, by number, lines included."""
    session.expire_all()
    rows = (
        await session.execute(
            select(spec.piece, ThirdParty.name)
            .join(ThirdParty, ThirdParty.id == spec.piece.third_party_id, isouter=True)
            .where(*where)
            .order_by(spec.piece.fiscal_year_id, spec.piece.number)
        )
    ).all()
    lines = await _lines(session, spec, [piece.id for piece, _ in rows])
    now = today()
    reads = []
    for piece, third_party_name in rows:
        mine = lines[piece.id]
        net, vat = _total(mine, "net"), _total(mine, "vat")
        read = {
            "id": piece.id,
            "fiscal_year_id": piece.fiscal_year_id,
            "number": piece.number,
            "kind": piece.kind,
            "third_party_id": piece.third_party_id,
            "third_party_name": third_party_name,
            "description": piece.description,
            "document_date": piece.document_date,
            "booking_date": effective_date(piece),
            "payment_method_id": piece.payment_method_id,
            "payment_date": piece.payment_date,
            "paid": piece.paid,
            "status": status(piece.paid, piece.payment_date, now),
            "net": net,
            "vat": vat,
            "total": net + vat,
            "lines": mine,
        }
        if spec.purchase:
            read |= {"recovered": _total(mine, "recovered"), "charge": _total(mine, "charge")}
        reads.append(read)
    return reads


async def read_piece(session: AsyncSession, spec: Spec, piece_id: int) -> dict:
    reads = await read_pieces(session, spec, spec.piece.id == piece_id)
    if not reads:
        raise not_found(spec.name)
    return reads[0]


# --- writes ------------------------------------------------------------------


async def _get(session: AsyncSession, model: Any, item_id: int, name: str):
    item = await session.get(model, item_id)
    if item is None:
        raise not_found(name)
    return item


async def _check_payment_method(session: AsyncSession, spec: Spec, method_id: int) -> None:
    method = await session.get(PaymentMethod, method_id)
    if method is None:
        raise field_error("payment_method_id", "Moyen de paiement introuvable")
    if spec is SALES and method.type == PaymentMethodType.CARD:
        raise field_error("payment_method_id", "Une vente ne se paie pas par carte")


async def _check_third_party(session: AsyncSession, third_party_id: int | None) -> None:
    if third_party_id is not None and await session.get(ThirdParty, third_party_id) is None:
        raise field_error("third_party_id", "Tiers introuvable")


def _normalise_booking_date(piece) -> None:
    """A booking date equal to the document date is the same as none."""
    if piece.booking_date == piece.document_date:
        piece.booking_date = None


async def create_piece(session: AsyncSession, spec: Spec, body) -> dict:
    await _check_payment_method(session, spec, body.payment_method_id)
    await _check_third_party(session, body.third_party_id)
    values = body.model_dump()
    piece = spec.piece(**values)
    _normalise_booking_date(piece)
    field = "booking_date" if piece.booking_date else "document_date"
    year = await fiscal_year_for(session, effective_date(piece), field)
    piece.fiscal_year_id = year.id
    piece.number = await next_number(session, spec.piece, year.id)
    session.add(piece)
    await commit(session)
    return await read_piece(session, spec, piece.id)


async def update_piece(
    session: AsyncSession, spec: Spec, piece_id: int, body, *, commit_now: bool = True
) -> dict | None:
    """Apply the changes; with `commit_now=False` leave them pending (None) for the caller to commit."""
    piece = await _get(session, spec.piece, piece_id, spec.name)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("payment_method_id") is not None:
        await _check_payment_method(session, spec, changes["payment_method_id"])
    if changes.get("third_party_id") is not None:
        await _check_third_party(session, changes["third_party_id"])
    for field, value in changes.items():
        if value is None and field not in ("third_party_id", "booking_date", "description"):
            continue
        setattr(piece, field, "" if value is None and field == "description" else value)
    _normalise_booking_date(piece)
    if "document_date" in changes or "booking_date" in changes:
        field = "booking_date" if piece.booking_date else "document_date"
        year = await fiscal_year_for(session, effective_date(piece), field)
        if year.id != piece.fiscal_year_id:
            piece.number = await next_number(session, spec.piece, year.id)
            piece.fiscal_year_id = year.id
    if not commit_now:
        return None
    await commit(session)
    return await read_piece(session, spec, piece_id)


async def delete_piece(session: AsyncSession, spec: Spec, piece_id: int) -> None:
    piece = await _get(session, spec.piece, piece_id, spec.name)
    await session.delete(piece)  # its lines go with it (ON DELETE CASCADE)
    await commit(session)


async def _check_line(session: AsyncSession, spec: Spec, changes: dict) -> None:
    if changes.get("category_id") is not None:
        category = await session.get(Category, changes["category_id"])
        if category is None:
            raise field_error("category_id", "Catégorie introuvable")
        if category.direction != spec.direction:
            raise field_error("category_id", spec.wrong_direction)
    if changes.get("vat_scheme_id") is not None:
        if await session.get(VatScheme, changes["vat_scheme_id"]) is None:
            raise field_error("vat_scheme_id", "Régime de TVA introuvable")


async def add_line(session: AsyncSession, spec: Spec, piece_id: int, body) -> dict:
    await _get(session, spec.piece, piece_id, spec.name)
    values = body.model_dump()
    await _check_line(session, spec, values)
    sort_key = await next_sort_key(session, spec.line, spec.fk == piece_id)
    session.add(spec.line(**{spec.fk.key: piece_id}, sort_key=sort_key, **values))
    await commit(session)
    return await read_piece(session, spec, piece_id)


async def update_line(
    session: AsyncSession, spec: Spec, line_id: int, body, *, commit_now: bool = True
) -> dict | None:
    """Apply the changes; with `commit_now=False` leave them pending (None) for the caller to commit."""
    line = await _get(session, spec.line, line_id, "Ligne")
    changes = body.model_dump(exclude_unset=True)
    await _check_line(session, spec, changes)
    for field, value in changes.items():
        if value is None and field != "description":
            continue
        setattr(line, field, "" if value is None else value)
    if not commit_now:
        return None
    await commit(session)
    return await read_piece(session, spec, getattr(line, spec.fk.key))


async def delete_line(session: AsyncSession, spec: Spec, line_id: int) -> dict:
    line = await _get(session, spec.line, line_id, "Ligne")
    piece_id = getattr(line, spec.fk.key)
    await session.delete(line)
    await commit(session)
    return await read_piece(session, spec, piece_id)
