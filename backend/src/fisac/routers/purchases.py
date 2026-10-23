from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces, register
from fisac.books.amounts import line_amounts
from fisac.db import get_session
from fisac.errors import commit, field_error, in_use
from fisac.models import (
    FiscalYear,
    FixedAsset,
    PieceKind,
    Purchase,
    PurchaseLine,
    ThirdParty,
    VatScheme,
)
from fisac.schemas.purchases import (
    AvailableLine,
    PurchaseCreate,
    PurchaseLineCreate,
    PurchaseLineUpdate,
    PurchaseRead,
    PurchaseUpdate,
)

router = APIRouter(tags=["purchases"])

_SPEC = pieces.PURCHASES


async def _assets(session: AsyncSession, *where) -> list[FixedAsset]:
    """The fixed assets taking over the purchase lines matching `where`."""
    query = (
        select(FixedAsset)
        .join(PurchaseLine, PurchaseLine.id == FixedAsset.purchase_line_id)
        .where(*where)
        .order_by(FixedAsset.number)
    )
    return list(await session.scalars(query))


def _held(assets: list[FixedAsset]):
    first = assets[0]
    return in_use(len(assets), f"Reprise par l'immobilisation {pieces.reference('I', first.number, 3)}")


async def _refresh(session: AsyncSession, assets: list[FixedAsset]) -> None:
    for asset in assets:
        await register.refresh_schedule(session, asset)
    if assets:
        await commit(session)


@router.get("/fiscal-years/{year_id}/purchases", response_model=list[PurchaseRead])
async def list_purchases(year_id: int, session: AsyncSession = Depends(get_session)):
    return await pieces.read_pieces(session, _SPEC, Purchase.fiscal_year_id == year_id)


@router.get("/purchase-lines/available", response_model=list[AvailableLine])
async def available_lines(q: str = "", session: AsyncSession = Depends(get_session)):
    """The invoice lines no fixed asset takes over, newest first, matching `q`."""
    booking = func.coalesce(Purchase.booking_date, Purchase.document_date)
    rows = await session.execute(
        select(
            PurchaseLine,
            Purchase,
            ThirdParty.name,
            FiscalYear.end_date,
            VatScheme.rate,
            VatScheme.recoverable_rate,
        )
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .join(FiscalYear, FiscalYear.id == Purchase.fiscal_year_id)
        .join(VatScheme, VatScheme.id == PurchaseLine.vat_scheme_id)
        .join(ThirdParty, ThirdParty.id == Purchase.third_party_id, isouter=True)
        .join(FixedAsset, FixedAsset.purchase_line_id == PurchaseLine.id, isouter=True)
        .where(Purchase.kind == PieceKind.INVOICE, FixedAsset.id.is_(None))
        .order_by(booking.desc(), Purchase.number.desc(), PurchaseLine.sort_key)
    )
    needle = q.strip().lower()
    found = []
    for line, purchase, third_party_name, year_end, rate, recoverable in rows:
        amounts = line_amounts(line.unit_price, line.quantity, rate, recoverable)
        item = AvailableLine(
            id=line.id,
            purchase_id=purchase.id,
            purchase_number=purchase.number,
            fiscal_year=year_end.year,
            third_party_name=third_party_name,
            description=line.description,
            net=amounts.net,
            charge=amounts.charge,
            booking_date=pieces.effective_date(purchase),
        )
        haystack = " ".join(
            [
                pieces.reference("A", purchase.number, 4),
                third_party_name or "",
                line.description,
                purchase.description,
                str(amounts.net),
                str(amounts.charge),
            ]
        ).lower()
        if needle in haystack:
            found.append(item)
    return found


@router.post("/purchases", response_model=PurchaseRead, status_code=201)
async def create_purchase(body: PurchaseCreate, session: AsyncSession = Depends(get_session)):
    return await pieces.create_piece(session, _SPEC, body)


@router.get("/purchases/{purchase_id}", response_model=PurchaseRead)
async def read_purchase(purchase_id: int, session: AsyncSession = Depends(get_session)):
    return await pieces.read_piece(session, _SPEC, purchase_id)


@router.patch("/purchases/{purchase_id}", response_model=PurchaseRead)
async def update_purchase(
    purchase_id: int, body: PurchaseUpdate, session: AsyncSession = Depends(get_session)
):
    assets = await _assets(session, PurchaseLine.purchase_id == purchase_id)
    if assets and body.kind == PieceKind.CREDIT_NOTE:
        raise field_error("kind", "Une ligne de cet achat est au registre")
    read = await pieces.update_piece(session, _SPEC, purchase_id, body)
    if "document_date" in body.model_fields_set or "booking_date" in body.model_fields_set:
        await _refresh(session, assets)
        read = await pieces.read_piece(session, _SPEC, purchase_id)
    return read


@router.delete("/purchases/{purchase_id}", status_code=204)
async def delete_purchase(purchase_id: int, session: AsyncSession = Depends(get_session)):
    held = await _assets(session, PurchaseLine.purchase_id == purchase_id)
    if held:
        raise _held(held)
    await pieces.delete_piece(session, _SPEC, purchase_id)
    return Response(status_code=204)


@router.post("/purchases/{purchase_id}/lines", response_model=PurchaseRead, status_code=201)
async def add_line(
    purchase_id: int, body: PurchaseLineCreate, session: AsyncSession = Depends(get_session)
):
    return await pieces.add_line(session, _SPEC, purchase_id, body)


@router.patch("/purchase-lines/{line_id}", response_model=PurchaseRead)
async def update_line(
    line_id: int, body: PurchaseLineUpdate, session: AsyncSession = Depends(get_session)
):
    read = await pieces.update_line(session, _SPEC, line_id, body)
    if body.model_fields_set & {"unit_price", "quantity", "vat_scheme_id"}:
        await _refresh(session, await _assets(session, PurchaseLine.id == line_id))
        read = await pieces.read_piece(session, _SPEC, read["id"])
    return read


@router.delete("/purchase-lines/{line_id}", response_model=PurchaseRead)
async def delete_line(line_id: int, session: AsyncSession = Depends(get_session)):
    held = await _assets(session, PurchaseLine.id == line_id)
    if held:
        raise _held(held)
    return await pieces.delete_line(session, _SPEC, line_id)
