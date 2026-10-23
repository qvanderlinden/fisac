from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, in_use, not_found
from fisac.models import PurchaseLine, SaleLine, VatScheme
from fisac.schemas import to_read
from fisac.schemas.vat_schemes import VatSchemeCreate, VatSchemeRead, VatSchemeUpdate
from fisac.uses import uses_expr

router = APIRouter(tags=["vat-schemes"])

_USES = uses_expr(VatScheme.id, SaleLine.vat_scheme_id, PurchaseLine.vat_scheme_id).label("uses")


async def _get(session: AsyncSession, item_id: int) -> tuple[VatScheme, int]:
    row = (await session.execute(select(VatScheme, _USES).where(VatScheme.id == item_id))).one_or_none()
    if row is None:
        raise not_found("Régime de TVA")
    return row.VatScheme, row.uses


@router.get("/vat-schemes", response_model=list[VatSchemeRead])
async def list_items(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(VatScheme, _USES).order_by(VatScheme.label, VatScheme.id))
    return [to_read(VatSchemeRead, row.VatScheme, uses=row.uses) for row in rows]


@router.get("/vat-schemes/{item_id}", response_model=VatSchemeRead)
async def read_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    return to_read(VatSchemeRead, item, uses=uses)


@router.post("/vat-schemes", response_model=VatSchemeRead, status_code=201)
async def create_item(body: VatSchemeCreate, session: AsyncSession = Depends(get_session)):
    item = VatScheme(**body.model_dump())
    session.add(item)
    await commit(session)
    await session.refresh(item)
    return to_read(VatSchemeRead, item, uses=0)


@router.patch("/vat-schemes/{item_id}", response_model=VatSchemeRead)
async def update_item(
    item_id: int, body: VatSchemeUpdate, session: AsyncSession = Depends(get_session)
):
    item, uses = await _get(session, item_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        # Only the recoverable share can be cleared by a null.
        if value is None and field != "recoverable_rate":
            continue
        setattr(item, field, value)
    await commit(session)
    await session.refresh(item)
    return to_read(VatSchemeRead, item, uses=uses)


@router.delete("/vat-schemes/{item_id}", status_code=204)
async def delete_item(item_id: int, session: AsyncSession = Depends(get_session)):
    item, uses = await _get(session, item_id)
    if uses > 0:
        raise in_use(uses)
    await session.delete(item)
    await commit(session)
    return Response(status_code=204)
