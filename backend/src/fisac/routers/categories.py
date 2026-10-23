from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, conflict, in_use, not_found
from fisac.models import Category, MiscEntry, PurchaseLine, SaleLine
from fisac.schemas import to_read
from fisac.schemas.categories import CategoryCreate, CategoryRead, CategoryUpdate
from fisac.uses import uses_expr

router = APIRouter(tags=["categories"])

_USES = uses_expr(
    Category.id, SaleLine.category_id, PurchaseLine.category_id, MiscEntry.category_id
).label("uses")

# These keep their null: a null only clears them.
_CLEARABLE = {"settlement", "default_vat_scheme_id", "default_isoc_scheme_id"}


async def _get(session: AsyncSession, item_id: int) -> tuple[Category, int]:
    row = (await session.execute(select(Category, _USES).where(Category.id == item_id))).one_or_none()
    if row is None:
        raise not_found("Catégorie")
    return row.Category, row.uses


@router.get("/categories", response_model=list[CategoryRead])
async def list_items(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(Category, _USES).order_by(Category.label, Category.id))
    return [to_read(CategoryRead, row.Category, uses=row.uses) for row in rows]


@router.get("/categories/{item_id}", response_model=CategoryRead)
async def read_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    return to_read(CategoryRead, item, uses=uses)


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_item(body: CategoryCreate, session: AsyncSession = Depends(get_session)):
    item = Category(**body.model_dump())
    session.add(item)
    await commit(session)
    await session.refresh(item)
    return to_read(CategoryRead, item, uses=0)


@router.patch("/categories/{item_id}", response_model=CategoryRead)
async def update_item(
    item_id: int, body: CategoryUpdate, session: AsyncSession = Depends(get_session)
):
    item, uses = await _get(session, item_id)
    changes = body.model_dump(exclude_unset=True)
    if item.role is not None and (
        changes.get("archived") is True or changes.get("kind", item.kind) != item.kind
    ):
        raise conflict(
            "system", "Une catégorie utilisée par un écran ne s'archive pas et garde son type"
        )
    for field, value in changes.items():
        if value is None and field not in _CLEARABLE:
            continue
        setattr(item, field, value)
    await commit(session)
    await session.refresh(item)
    return to_read(CategoryRead, item, uses=uses)


@router.delete("/categories/{item_id}", status_code=204)
async def delete_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    if item.role is not None:
        raise conflict("system", "Une catégorie utilisée par un écran ne se supprime pas")
    if uses > 0:
        raise in_use(uses)
    await session.delete(item)
    await commit(session)
    return Response(status_code=204)
