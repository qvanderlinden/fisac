from dataclasses import asdict
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.books import vat
from fisac.books.amounts import sign
from fisac.db import get_session
from fisac.errors import commit, not_found
from fisac.models import FiscalYear, VatReturn
from fisac.routers.company import get_or_create
from fisac.schemas.vat_periods import VatPeriodRead, VatPeriodsRead, VatPeriodUpdate

router = APIRouter(tags=["vat"])


async def _returns(
    session: AsyncSession, year: FiscalYear, spans: list[tuple]
) -> dict[tuple, VatReturn]:
    """The stored row of each period, created when missing.

    A row left by another regime is not touched unless it starts like a current
    period (period_start is unique): it then takes that period's end and loses
    its filing date, which was for a different period.
    """
    starts = [s for s, _ in spans]
    existing = {
        r.period_start: r
        for r in await session.scalars(select(VatReturn).where(VatReturn.period_start.in_(starts)))
    }
    rows = {}
    for start, end in spans:
        row = existing.get(start)
        if row is None:
            row = VatReturn(fiscal_year_id=year.id, period_start=start, period_end=end)
            session.add(row)
        elif row.period_end != end:
            row.period_end, row.filed_on = end, None
        rows[(start, end)] = row
    await commit(session)
    return rows


@router.get("/fiscal-years/{year_id}/vat-periods", response_model=VatPeriodsRead)
async def read_vat_periods(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    regime = (await get_or_create(session)).vat_regime
    spans = vat.periods(year.start_date, year.end_date, regime)
    if not spans:
        return {"regime": regime, "periods": []}
    rows = await _returns(session, year, spans)
    returns = {k: (r.id, r.filed_on) for k, r in rows.items()}

    entries = []  # (booking date, line, piece fields)
    for spec, side, prefix in ((pieces.SALES, "sale", "S"), (pieces.PURCHASES, "purchase", "A")):
        reads = await pieces.read_pieces(session, spec, spec.piece.fiscal_year_id == year_id)
        for read in reads:
            # reads are unsigned: the kind carries the sign, applied once here
            s = sign(read["kind"])
            zero = Decimal("0.00")  # adding it turns the -0.00 of a credit note on nothing into 0.00
            net, vat_ = s * read["net"] + zero, s * read["vat"] + zero
            recovered = s * read.get("recovered", zero) + zero
            line = vat.VatLine(read["booking_date"], net, vat_, recovered, side)
            entries.append((line, {
                "kind": side,
                "piece_id": read["id"],
                "number": pieces.reference(prefix, read["number"], 4),
                "date": read["booking_date"],
                "third_party": read["third_party_name"],
                "net": net,
                "vat": vat_,
                "recovered": line.recovered,
            }))
    today = pieces.today()
    result = []
    for (start, end), (row_id, filed_on) in returns.items():
        mine = [(line, fields) for line, fields in entries if start <= line.booking_date <= end]
        mine.sort(key=lambda e: (e[1]["date"], e[1]["number"]))
        summary = vat.summarize([line for line, _ in mine])
        result.append({
            "id": row_id, "start": start, "end": end, "due": vat.due_date(end),
            "filed_on": filed_on, "status": vat.status(end, filed_on, today),
            **asdict(summary),
            "pieces": [fields for _, fields in mine],
        })
    return {"regime": regime, "periods": result}


@router.patch("/vat-periods/{period_id}", response_model=VatPeriodRead)
async def update_vat_period(
    period_id: int, body: VatPeriodUpdate, session: AsyncSession = Depends(get_session)
):
    row = await session.get(VatReturn, period_id)
    if row is None:
        raise not_found("Période de TVA")
    year_id = row.fiscal_year_id
    year = await session.get(FiscalYear, year_id)
    regime = (await get_or_create(session)).vat_regime
    current = vat.periods(year.start_date, year.end_date, regime)
    if (row.period_start, row.period_end) not in current:
        raise not_found("Période de TVA")  # left over from another regime
    row.filed_on = body.filed_on
    await commit(session)
    periods = await read_vat_periods(year_id, session)
    for period in periods["periods"]:
        if period["id"] == period_id:
            return period
    raise not_found("Période de TVA")  # left over from another regime
