from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, in_use, not_found
from fisac.models import DepreciationModel, FixedAsset
from fisac.schemas import to_read
from fisac.schemas.depreciation_models import DepreciationModelCreate, DepreciationModelRead, DepreciationModelUpdate
from fisac.uses import uses_expr

router = APIRouter(tags=["depreciation-models"])

_USES = uses_expr(DepreciationModel.id, FixedAsset.depreciation_model_id).label("uses")


async def _get(session: AsyncSession, item_id: int) -> tuple[DepreciationModel, int]:
    row = (await session.execute(select(DepreciationModel, _USES).where(DepreciationModel.id == item_id))).one_or_none()
    if row is None:
        raise not_found("Modèle d'amortissement")
    return row.DepreciationModel, row.uses


@router.get("/depreciation-models", response_model=list[DepreciationModelRead])
async def list_items(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(DepreciationModel, _USES).order_by(DepreciationModel.label, DepreciationModel.id))
    return [to_read(DepreciationModelRead, row.DepreciationModel, uses=row.uses) for row in rows]


@router.get("/depreciation-models/{item_id}", response_model=DepreciationModelRead)
async def read_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    return to_read(DepreciationModelRead, item, uses=uses)


@router.post("/depreciation-models", response_model=DepreciationModelRead, status_code=201)
async def create_item(body: DepreciationModelCreate, session: AsyncSession = Depends(get_session)):
    item = DepreciationModel(**body.model_dump())
    session.add(item)
    await commit(session)
    await session.refresh(item)
    return to_read(DepreciationModelRead, item, uses=0)


@router.patch("/depreciation-models/{item_id}", response_model=DepreciationModelRead)
async def update_item(
    item_id: int, body: DepreciationModelUpdate, session: AsyncSession = Depends(get_session)
):
    item, uses = await _get(session, item_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        # An explicit null leaves the column alone.
        if value is None:
            continue
        setattr(item, field, value)
    await commit(session)
    await session.refresh(item)
    return to_read(DepreciationModelRead, item, uses=uses)


@router.delete("/depreciation-models/{item_id}", status_code=204)
async def delete_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    if uses > 0:
        raise in_use(uses)
    await session.delete(item)
    await commit(session)
    return Response(status_code=204)
