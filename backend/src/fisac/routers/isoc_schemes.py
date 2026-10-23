from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, in_use, not_found
from fisac.models import IsocScheme, PurchaseLine
from fisac.schemas import to_read
from fisac.schemas.isoc_schemes import IsocSchemeCreate, IsocSchemeRead, IsocSchemeUpdate
from fisac.uses import uses_expr

router = APIRouter(tags=["isoc-schemes"])

_USES = uses_expr(IsocScheme.id, PurchaseLine.isoc_scheme_id).label("uses")


async def _get(session: AsyncSession, item_id: int) -> tuple[IsocScheme, int]:
    row = (await session.execute(select(IsocScheme, _USES).where(IsocScheme.id == item_id))).one_or_none()
    if row is None:
        raise not_found("Régime ISOC")
    return row.IsocScheme, row.uses


@router.get("/isoc-schemes", response_model=list[IsocSchemeRead])
async def list_items(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(IsocScheme, _USES).order_by(IsocScheme.label, IsocScheme.id))
    return [to_read(IsocSchemeRead, row.IsocScheme, uses=row.uses) for row in rows]


@router.get("/isoc-schemes/{item_id}", response_model=IsocSchemeRead)
async def read_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    return to_read(IsocSchemeRead, item, uses=uses)


@router.post("/isoc-schemes", response_model=IsocSchemeRead, status_code=201)
async def create_item(body: IsocSchemeCreate, session: AsyncSession = Depends(get_session)):
    item = IsocScheme(**body.model_dump())
    session.add(item)
    await commit(session)
    await session.refresh(item)
    return to_read(IsocSchemeRead, item, uses=0)


@router.patch("/isoc-schemes/{item_id}", response_model=IsocSchemeRead)
async def update_item(
    item_id: int, body: IsocSchemeUpdate, session: AsyncSession = Depends(get_session)
):
    item, uses = await _get(session, item_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        # An explicit null leaves the column alone.
        if value is None:
            continue
        setattr(item, field, value)
    await commit(session)
    await session.refresh(item)
    return to_read(IsocSchemeRead, item, uses=uses)


@router.delete("/isoc-schemes/{item_id}", status_code=204)
async def delete_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    if uses > 0:
        raise in_use(uses)
    await session.delete(item)
    await commit(session)
    return Response(status_code=204)
