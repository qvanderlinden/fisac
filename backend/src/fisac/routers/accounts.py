from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account
from fisac.ordering import move_sort_key, next_sort_key
from fisac.schemas import AccountCreate, AccountRead, AccountUpdate, MoveRequest

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountRead])
async def list_accounts(session: AsyncSession = Depends(get_session)) -> list[Account]:
    result = await session.execute(select(Account).order_by(Account.sort_key))
    return list(result.scalars().all())


@router.post("", response_model=AccountRead, status_code=201)
async def create_account(
    payload: AccountCreate,
    session: AsyncSession = Depends(get_session),
) -> Account:
    sort_key = await next_sort_key(session, Account)
    account = Account(**payload.model_dump(), sort_key=sort_key)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountRead)
async def update_account(
    payload: AccountUpdate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> Account:
    if payload.name is not None:
        account.name = payload.name
    if payload.current_balance is not None:
        account.current_balance = payload.current_balance
    if payload.is_company is not None:
        account.is_company = payload.is_company
    if payload.vat_applicable is not None:
        account.vat_applicable = payload.vat_applicable
    if payload.visa_payment_day is not None:
        account.visa_payment_day = payload.visa_payment_day
    if not account.is_company:
        account.vat_applicable = False
    await session.commit()
    await session.refresh(account)
    return account


@router.patch("/{account_id}/move", response_model=AccountRead)
async def move_account(
    payload: MoveRequest,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> Account:
    account.sort_key = await move_sort_key(session, Account, payload.after_id, payload.before_id)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(account)
    await session.commit()
