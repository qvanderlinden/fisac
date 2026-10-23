from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import fiscal_years
from fisac.db import get_session
from fisac.errors import commit, not_found
from fisac.models import EquityLine, FiscalYear
from fisac.routers.company import get_or_create
from fisac.schemas import to_read
from fisac.schemas.fiscal_years import (
    EquityLineRead,
    FiscalYearRead,
    FiscalYearUpdate,
    NextPeriod,
)

router = APIRouter(tags=["fiscal years"])

# Serialises the POSTs that open a year (transaction-scoped advisory lock).
_OPEN_LOCK = 7_301_001


async def _get(session: AsyncSession, year_id: int) -> FiscalYear:
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    return year


async def _next_period(session: AsyncSession):
    company = await get_or_create(session)
    latest_end = await session.scalar(select(func.max(FiscalYear.end_date)))
    return fiscal_years.next_period(
        company.fiscal_year_start_month, latest_end, fiscal_years.today()
    )


@router.get("/fiscal-years", response_model=list[FiscalYearRead])
async def list_fiscal_years(session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(FiscalYear).order_by(FiscalYear.start_date.desc()))
    return [to_read(FiscalYearRead, row) for row in rows]


@router.get("/fiscal-years/next", response_model=NextPeriod)
async def read_next_period(session: AsyncSession = Depends(get_session)):
    start, end = await _next_period(session)
    return NextPeriod(start_date=start, end_date=end)


@router.post("/fiscal-years", response_model=FiscalYearRead, status_code=201)
async def open_fiscal_year(session: AsyncSession = Depends(get_session)):
    await get_or_create(session)  # commits, so it comes before the lock
    # Held until the commit below: a concurrent POST waits here, then reads the
    # year this one inserted and opens the one after it.
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _OPEN_LOCK})
    start, end = await _next_period(session)
    year = FiscalYear(start_date=start, end_date=end)
    session.add(year)
    await commit(session)
    await session.refresh(year)
    return to_read(FiscalYearRead, year)


@router.patch("/fiscal-years/{year_id}", response_model=FiscalYearRead)
async def update_fiscal_year(
    year_id: int, body: FiscalYearUpdate, session: AsyncSession = Depends(get_session)
):
    year = await _get(session, year_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(year, field, value)
    await commit(session)
    await session.refresh(year)
    return to_read(FiscalYearRead, year)


@router.get("/fiscal-years/{year_id}/equity-lines", response_model=list[EquityLineRead])
async def list_equity_lines(year_id: int, session: AsyncSession = Depends(get_session)):
    await _get(session, year_id)
    rows = await session.scalars(
        select(EquityLine).where(EquityLine.fiscal_year_id == year_id).order_by(EquityLine.sort_key)
    )
    return [to_read(EquityLineRead, row) for row in rows]
