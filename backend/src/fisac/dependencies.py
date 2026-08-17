from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.models import Account


async def get_account(
    account_id: int,
    session: AsyncSession = Depends(get_session),
) -> Account:
    account = await session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account
