from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.models import FinancialAccount
from fisac.schemas import to_read
from fisac.schemas.financial_accounts import FinancialAccountRead

router = APIRouter(tags=["financial-accounts"])


@router.get("/financial-accounts", response_model=list[FinancialAccountRead])
async def list_financial_accounts(session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(FinancialAccount).order_by(FinancialAccount.code))
    return [to_read(FinancialAccountRead, row) for row in rows]
