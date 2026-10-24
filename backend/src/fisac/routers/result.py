from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import isoc_inputs
from fisac.db import get_session
from fisac.errors import not_found
from fisac.models import FiscalYear
from fisac.schemas.result import ResultRead

router = APIRouter(tags=["result"])


@router.get("/fiscal-years/{year_id}/result", response_model=ResultRead)
async def read_result(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    loaded = await isoc_inputs.load(session, year)  # the same reading as the ISOC screen's
    return {
        **asdict(loaded.book),
        "estimated_tax": loaded.isoc.estimated_tax,
        "majoration": loaded.isoc.majoration,
        "after_tax": loaded.isoc.after_tax,
    }
