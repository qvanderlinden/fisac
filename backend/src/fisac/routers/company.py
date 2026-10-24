from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.errors import commit
from fisac.models import Company
from fisac.schemas import to_read
from fisac.schemas.company import CompanyRead, CompanyUpdate

router = APIRouter(tags=["company"])

# Nullable columns; every other field rejects an explicit null.
_NULLABLE = {"bce_number", "registered_office", "iban", "manager_name", "manager_since", "incorporated_on"}


async def get_or_create(session: AsyncSession) -> Company:
    """The single company row (id 1), created with its defaults on first use."""
    company = await session.get(Company, 1)
    if company is None:
        # Concurrent first requests all get here; the losers insert nothing.
        await session.execute(pg_insert(Company).values(id=1).on_conflict_do_nothing())
        await session.commit()
        company = await session.get(Company, 1)
    return company


@router.get("/company", response_model=CompanyRead)
async def read_company(session: AsyncSession = Depends(get_session)):
    return to_read(CompanyRead, await get_or_create(session))


@router.patch("/company", response_model=CompanyRead)
async def update_company(body: CompanyUpdate, session: AsyncSession = Depends(get_session)):
    company = await get_or_create(session)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field not in _NULLABLE:
            continue
        setattr(company, field, value)
    await commit(session)
    await session.refresh(company)
    return to_read(CompanyRead, company)
