from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, conflict, not_found
from fisac.models import Partner
from fisac.ordering import next_sort_key
from fisac.schemas import to_read
from fisac.schemas.partners import PartnerCreate, PartnerRead, PartnerUpdate

router = APIRouter(tags=["partners"])


async def _get(session: AsyncSession, partner_id: int) -> Partner:
    partner = await session.get(Partner, partner_id)
    if partner is None:
        raise not_found("Associé")
    return partner


@router.get("/partners", response_model=list[PartnerRead])
async def list_partners(session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(Partner).order_by(Partner.sort_key))
    return [to_read(PartnerRead, row) for row in rows]


@router.post("/partners", response_model=PartnerRead, status_code=201)
async def create_partner(body: PartnerCreate, session: AsyncSession = Depends(get_session)):
    partner = Partner(**body.model_dump(), sort_key=await next_sort_key(session, Partner))
    session.add(partner)
    await commit(session)
    await session.refresh(partner)
    return to_read(PartnerRead, partner)


@router.patch("/partners/{partner_id}", response_model=PartnerRead)
async def update_partner(
    partner_id: int, body: PartnerUpdate, session: AsyncSession = Depends(get_session)
):
    partner = await _get(session, partner_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(partner, field, value)
    await commit(session)
    await session.refresh(partner)
    return to_read(PartnerRead, partner)


@router.delete("/partners/{partner_id}", status_code=204)
async def delete_partner(partner_id: int, session: AsyncSession = Depends(get_session)):
    partner = await _get(session, partner_id)
    if await session.scalar(select(func.count()).select_from(Partner)) <= 1:
        raise conflict("last_partner", "Il faut au moins un associé")
    await session.delete(partner)
    await commit(session)
    return Response(status_code=204)
