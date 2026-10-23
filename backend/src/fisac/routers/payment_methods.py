from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, field_error, in_use, not_found
from fisac.models import (
    FinancialAccount,
    FinancialAccountKind,
    IsocPrepayment,
    MiscEntry,
    PaymentMethod,
    PaymentMethodType,
    PaySchedule,
    Purchase,
    Sale,
)
from fisac.schemas import to_read
from fisac.schemas.payment_methods import (
    PaymentMethodCreate,
    PaymentMethodRead,
    PaymentMethodUpdate,
)
from fisac.uses import uses_expr

router = APIRouter(tags=["payment-methods"])

_USES = uses_expr(
    PaymentMethod.id,
    Sale.payment_method_id,
    Purchase.payment_method_id,
    MiscEntry.payment_method_id,
    PaySchedule.payment_method_id,
    IsocPrepayment.payment_method_id,
).label("uses")
_ACCOUNT_NAME = FinancialAccount.name.label("financial_account_name")
_ACCOUNT_CODE_LENGTH = 8


def card_account_code(name: str, taken: set[str]) -> str:
    """The journal code of a card's account: the name's initials, then 2, 3... until free."""
    initials = "".join(word[0] for word in name.split()).upper()[:_ACCOUNT_CODE_LENGTH] or "C"
    code, n = initials, 1
    while code in taken:
        n += 1
        suffix = str(n)
        code = initials[: _ACCOUNT_CODE_LENGTH - len(suffix)] + suffix
    return code


def _query():
    return select(PaymentMethod, _USES, _ACCOUNT_NAME).join(
        FinancialAccount, FinancialAccount.id == PaymentMethod.financial_account_id
    )


def _read(row) -> PaymentMethodRead:
    return to_read(
        PaymentMethodRead,
        row.PaymentMethod,
        uses=row.uses,
        financial_account_name=row.financial_account_name,
    )


async def _get_row(session: AsyncSession, item_id: int):
    row = (await session.execute(_query().where(PaymentMethod.id == item_id))).one_or_none()
    if row is None:
        raise not_found("Moyen de paiement")
    return row


@router.get("/payment-methods", response_model=list[PaymentMethodRead])
async def list_items(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(_query().order_by(PaymentMethod.name, PaymentMethod.id))
    return [_read(row) for row in rows]


@router.get("/payment-methods/{item_id}", response_model=PaymentMethodRead)
async def read_item(item_id: int, session: AsyncSession = Depends(get_session)):
    return _read(await _get_row(session, item_id))


@router.post("/payment-methods", response_model=PaymentMethodRead, status_code=201)
async def create_item(body: PaymentMethodCreate, session: AsyncSession = Depends(get_session)):
    values = body.model_dump()
    if body.financial_account_id is not None:
        if await session.get(FinancialAccount, body.financial_account_id) is None:
            raise field_error("financial_account_id", "Compte financier introuvable")
    elif body.type == PaymentMethodType.CARD:
        # The card brings its own account, paid by the first bank account.
        bank_id = await session.scalar(
            select(FinancialAccount.id)
            .where(FinancialAccount.kind == FinancialAccountKind.BANK)
            .order_by(FinancialAccount.id)
            .limit(1)
        )
        if bank_id is None:
            raise field_error("type", "Aucun compte bancaire pour régler la carte")
        taken = set(await session.scalars(select(FinancialAccount.code)))
        account = FinancialAccount(
            kind=FinancialAccountKind.CARD,
            name=body.name,
            code=card_account_code(body.name, taken),
        )
        session.add(account)
        await session.flush()
        values["financial_account_id"] = account.id
        values["settlement_account_id"] = bank_id
    else:
        raise field_error("financial_account_id", "Choisissez le compte financier")
    item = PaymentMethod(**values)
    session.add(item)
    await commit(session)
    return _read(await _get_row(session, item.id))


@router.patch("/payment-methods/{item_id}", response_model=PaymentMethodRead)
async def update_item(
    item_id: int, body: PaymentMethodUpdate, session: AsyncSession = Depends(get_session)
):
    item = (await _get_row(session, item_id)).PaymentMethod
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field == "name":
            continue
        setattr(item, field, value)
    await commit(session)
    session.expire_all()
    return _read(await _get_row(session, item_id))


@router.delete("/payment-methods/{item_id}", status_code=204)
async def delete_item(item_id: int, session: AsyncSession = Depends(get_session)):
    row = await _get_row(session, item_id)
    if row.uses > 0:
        raise in_use(row.uses)
    # The financial account stays: other data may point at it.
    await session.delete(row.PaymentMethod)
    await commit(session)
    return Response(status_code=204)
