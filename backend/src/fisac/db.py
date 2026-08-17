from collections.abc import AsyncGenerator

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from fisac.config import settings

# Tables are always qualified with this schema regardless of the connection's
# search_path, so the app never depends on server-side search_path config.
metadata = MetaData(schema="fisac")


class Base(DeclarativeBase):
    metadata = metadata


engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
