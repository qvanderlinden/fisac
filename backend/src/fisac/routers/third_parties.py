from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit, in_use, not_found
from fisac.models import Purchase, Sale, ThirdParty
from fisac.schemas import to_read
from fisac.schemas.third_parties import ThirdPartyCreate, ThirdPartyRead, ThirdPartyUpdate
from fisac.uses import uses_expr

router = APIRouter(tags=["third-parties"])

_USES = uses_expr(ThirdParty.id, Sale.third_party_id, Purchase.third_party_id).label("uses")


async def _get(session: AsyncSession, third_party_id: int) -> tuple[ThirdParty, int]:
    row = (
        await session.execute(
            select(ThirdParty, _USES).where(ThirdParty.id == third_party_id)
        )
    ).one_or_none()
    if row is None:
        raise not_found("Tiers")
    return row.ThirdParty, row.uses


@router.get("/third-parties", response_model=list[ThirdPartyRead])
async def list_third_parties(session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(ThirdParty, _USES).order_by(ThirdParty.name, ThirdParty.id))
    return [to_read(ThirdPartyRead, row.ThirdParty, uses=row.uses) for row in rows]


@router.get("/third-parties/{third_party_id}", response_model=ThirdPartyRead)
async def read_third_party(third_party_id: int, session: AsyncSession = Depends(get_session)):
    third_party, uses = await _get(session, third_party_id)
    return to_read(ThirdPartyRead, third_party, uses=uses)


@router.post("/third-parties", response_model=ThirdPartyRead, status_code=201)
async def create_third_party(
    body: ThirdPartyCreate, session: AsyncSession = Depends(get_session)
):
    third_party = ThirdParty(**body.model_dump())
    session.add(third_party)
    await commit(session)
    await session.refresh(third_party)
    return to_read(ThirdPartyRead, third_party, uses=0)


@router.patch("/third-parties/{third_party_id}", response_model=ThirdPartyRead)
async def update_third_party(
    third_party_id: int, body: ThirdPartyUpdate, session: AsyncSession = Depends(get_session)
):
    third_party, uses = await _get(session, third_party_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        # The name rejects an explicit null; the IBAN is cleared by it.
        if value is None and field != "iban":
            continue
        setattr(third_party, field, value)
    await commit(session)
    await session.refresh(third_party)
    return to_read(ThirdPartyRead, third_party, uses=uses)


@router.delete("/third-parties/{third_party_id}", status_code=204)
async def delete_third_party(third_party_id: int, session: AsyncSession = Depends(get_session)):
    third_party, uses = await _get(session, third_party_id)
    if uses > 0:
        raise in_use(uses)
    await session.delete(third_party)
    await commit(session)
    return Response(status_code=204)
