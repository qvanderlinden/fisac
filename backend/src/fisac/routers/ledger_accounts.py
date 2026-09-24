from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, LedgerAccount
from fisac.schemas import LedgerAccountCreate, LedgerAccountRead, LedgerAccountUpdate

router = APIRouter(
    prefix="/api/accounts/{account_id}/ledger-accounts", tags=["ledger-accounts"]
)


async def _get_ledger_account(
    ledger_account_id: int,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    ledger_account = await session.get(LedgerAccount, ledger_account_id)
    if ledger_account is None or ledger_account.account_id != account.id:
        raise HTTPException(status_code=404, detail="Ledger account not found")
    return ledger_account


@router.get("", response_model=list[LedgerAccountRead])
async def list_ledger_accounts(
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[LedgerAccount]:
    # Ordered by code, not by a sort_key: the chart's natural order is the code
    # and this table deliberately has no fractional index.
    result = await session.execute(
        select(LedgerAccount)
        .where(LedgerAccount.account_id == account.id)
        .order_by(LedgerAccount.code)
    )
    return list(result.scalars().all())


@router.post("", response_model=LedgerAccountRead, status_code=201)
async def create_ledger_account(
    payload: LedgerAccountCreate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    ledger_account = LedgerAccount(
        account_id=account.id,
        code=payload.code,
        name=payload.name,
        pcmn_class=int(payload.code[0]),
    )
    session.add(ledger_account)
    try:
        await session.commit()
    except IntegrityError:
        # uq_ledger_accounts_account_code - a duplicate code is a client
        # mistake, not a server error.
        #
        # This catches ANY IntegrityError on the insert, not just that unique
        # constraint, and always reports it as a duplicate code. That is safe
        # today only because the other two constraints on this table
        # (ck_ledger_accounts_code_digits, ck_ledger_accounts_class_range) are
        # already unreachable here: LedgerAccountCreate.code's Pydantic
        # pattern (_LEDGER_CODE) enforces digits-only and a leading class 1-7
        # before this ever reaches the database, and pcmn_class is always
        # derived from that same validated code, never client-supplied. If a
        # constraint is ever added to this table that Pydantic doesn't
        # already guarantee, this message would misreport it as a duplicate
        # code - narrow the except clause (e.g. inspect the constraint name)
        # at that point.
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Code {payload.code} already exists on this account",
        ) from None
    await session.refresh(ledger_account)
    return ledger_account


@router.patch("/{ledger_account_id}", response_model=LedgerAccountRead)
async def update_ledger_account(
    payload: LedgerAccountUpdate,
    ledger_account: LedgerAccount = Depends(_get_ledger_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    if payload.code is not None:
        ledger_account.code = payload.code
        ledger_account.pcmn_class = int(payload.code[0])
    if payload.name is not None:
        ledger_account.name = payload.name
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Code already exists on this account"
        ) from None
    await session.refresh(ledger_account)
    return ledger_account


@router.delete("/{ledger_account_id}", status_code=204)
async def delete_ledger_account(
    ledger_account: LedgerAccount = Depends(_get_ledger_account),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Lines booked here survive with a NULL ledger_account_id
    # (ON DELETE SET NULL) - they become part of the unassigned bucket.
    await session.delete(ledger_account)
    await session.commit()
