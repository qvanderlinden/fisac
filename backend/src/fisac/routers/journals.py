from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.books import journals
from fisac.books.amounts import sign
from fisac.db import get_session
from fisac.errors import not_found
from fisac.models import FinancialAccount, FiscalYear, PaymentMethod, PaymentMethodType
from fisac.schemas.journals import JournalRead

router = APIRouter(tags=["journals"])

# A card purchase paid this far before the year can have its statement paid within it.
_LOOKBACK = timedelta(days=65)


@router.get("/fiscal-years/{year_id}/journals", response_model=list[JournalRead])
async def read_journals(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    start, end = year.start_date, year.end_date
    methods = list(await session.scalars(select(PaymentMethod)))
    # plain values: reading the pieces expires every loaded row
    account_of = {m.id: m.financial_account_id for m in methods}
    is_card = {m.id for m in methods if m.type == PaymentMethodType.CARD}
    used = set(account_of.values()) | {
        m.settlement_account_id for m in methods if m.settlement_account_id
    }
    rows = await session.scalars(
        select(FinancialAccount).where(FinancialAccount.id.in_(used)).order_by(FinancialAccount.code)
    )
    accounts = [journals.Account(a.id, a.code, a.name, a.kind) for a in rows]
    cards = [
        journals.Card(
            m.id, m.name, m.financial_account_id, m.settlement_account_id,
            m.statement_closing_day, m.statement_payment_day,
        )
        for m in methods
        if m.type == PaymentMethodType.CARD
    ]

    cash = []
    for spec, kind, prefix in ((pieces.SALES, "sale", "S"), (pieces.PURCHASES, "purchase", "A")):
        reads = await pieces.read_pieces(
            session, spec,
            spec.piece.payment_date >= start - _LOOKBACK,
            spec.piece.payment_date <= end,
        )
        for read in reads:
            method_id = read["payment_method_id"]
            # reads are unsigned: the kind carries the sign, applied once here
            sale_sign = 1 if kind == "sale" else -1
            amount = read["total"] * sign(read["kind"]) * sale_sign
            cash.append(journals.CashPiece(
                read["payment_date"], kind, read["id"],
                pieces.reference(prefix, read["number"], 4),
                read["third_party_name"] or read["description"],
                amount, account_of[method_id], read["paid"],
                method_id if method_id in is_card else None,
            ))
    built = journals.build(accounts, cash, cards, start, end, pieces.today())
    return [
        {
            "account": j.account.__dict__,
            "opening": j.opening, "receipts": j.receipts, "payments": j.payments,
            "closing": j.closing, "movements": j.movements,
        }
        for j in built
    ]
