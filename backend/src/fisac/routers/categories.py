from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Category
from fisac.ordering import move_sort_key, next_sort_key
from fisac.schemas import CategoryCreate, CategoryRead, CategoryUpdate, MoveRequest

router = APIRouter(prefix="/api/accounts/{account_id}/categories", tags=["categories"])


async def _get_category(
    category_id: int,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> Category:
    category = await session.get(Category, category_id)
    if category is None or category.account_id != account.id:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.get("", response_model=list[CategoryRead])
async def list_categories(
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    result = await session.execute(
        select(Category).where(Category.account_id == account.id).order_by(Category.sort_key)
    )
    return list(result.scalars().all())


@router.post("", response_model=CategoryRead, status_code=201)
async def create_category(
    payload: CategoryCreate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> Category:
    sort_key = await next_sort_key(session, Category, Category.account_id == account.id)
    category = Category(account_id=account.id, sort_key=sort_key, **payload.model_dump())
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    payload: CategoryUpdate,
    category: Category = Depends(_get_category),
    session: AsyncSession = Depends(get_session),
) -> Category:
    if payload.name is not None:
        category.name = payload.name
    if payload.tax_deduction_rate is not None:
        category.tax_deduction_rate = payload.tax_deduction_rate
    if payload.vat_deduction_rate is not None:
        category.vat_deduction_rate = payload.vat_deduction_rate
    await session.commit()
    await session.refresh(category)
    return category


@router.patch("/{category_id}/move", response_model=CategoryRead)
async def move_category(
    payload: MoveRequest,
    category: Category = Depends(_get_category),
    session: AsyncSession = Depends(get_session),
) -> Category:
    category.sort_key = await move_sort_key(session, Category, payload.after_id, payload.before_id)
    await session.commit()
    await session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category: Category = Depends(_get_category),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(category)
    await session.commit()
