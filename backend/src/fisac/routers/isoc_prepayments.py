from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.books import isoc_params
from fisac.db import get_session
from fisac.errors import commit, field_error, not_found
from fisac.models import FiscalYear, IsocPrepayment, PaymentMethod, PaymentMethodType
from fisac.schemas.isoc_prepayments import IsocPrepaymentRead, IsocPrepaymentUpdate

router = APIRouter(tags=["isoc"])

_CARD = "Un versement anticipé ne se paie pas par carte"


async def _rows(session: AsyncSession, year_id: int) -> list[IsocPrepayment]:
    query = (
        select(IsocPrepayment)
        .where(IsocPrepayment.fiscal_year_id == year_id)
        .order_by(IsocPrepayment.number)
    )
    return list(await session.scalars(query))


async def ensure_prepayments(session: AsyncSession, year: FiscalYear) -> list[IsocPrepayment]:
    """The year's four advance payments, created on first read (due dates of the
    rule, amount 0, the first non-card method, unpaid)."""
    year_id, start = year.id, year.start_date
    rows = await _rows(session, year_id)
    if len(rows) < 4:
        method = await session.scalar(
            select(PaymentMethod.id)
            .where(PaymentMethod.type != PaymentMethodType.CARD)
            .order_by(PaymentMethod.id)
            .limit(1)
        )
        if method is None:
            raise field_error(
                "payment_method_id",
                "Aucun moyen de paiement autre que la carte : ajoutez-en un pour les versements anticipés",
            )
        dates = isoc_params.due_dates(start)
        # ON CONFLICT DO NOTHING: two first reads at once both answer
        await session.execute(
            pg_insert(IsocPrepayment)
            .values([
                {"fiscal_year_id": year_id, "number": n, "due_date": d, "payment_method_id": method}
                for n, d in enumerate(dates, start=1)
            ])
            .on_conflict_do_nothing(index_elements=["fiscal_year_id", "number"])
        )
        await commit(session)
        rows = await _rows(session, year_id)
    return rows


@router.get("/fiscal-years/{year_id}/isoc-prepayments", response_model=list[IsocPrepaymentRead])
async def read_isoc_prepayments(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    return await ensure_prepayments(session, year)


@router.patch("/isoc-prepayments/{prepayment_id}", response_model=IsocPrepaymentRead)
async def update_isoc_prepayment(
    prepayment_id: int, body: IsocPrepaymentUpdate, session: AsyncSession = Depends(get_session)
):
    row = await session.get(IsocPrepayment, prepayment_id)
    if row is None:
        raise not_found("Versement anticipé")
    sent = body.model_fields_set
    if "payment_method_id" in sent:
        if body.payment_method_id is None:
            raise field_error("payment_method_id", "Un moyen de paiement est requis")
        method = await session.get(PaymentMethod, body.payment_method_id)
        if method is None:
            raise field_error("payment_method_id", "Moyen de paiement introuvable")
        if method.type == PaymentMethodType.CARD:
            raise field_error("payment_method_id", _CARD)
        row.payment_method_id = method.id
    if "amount" in sent:
        if body.amount is None:
            raise field_error("amount", "Un montant est requis")
        row.amount = body.amount
    if "paid" in sent:
        if body.paid is None:
            raise field_error("paid", "Payé ou non")
        row.paid = body.paid
    if "payment_date" in sent:
        row.payment_date = body.payment_date  # kept as sent when paid goes back to false
    await commit(session)
    await session.refresh(row)
    return row
