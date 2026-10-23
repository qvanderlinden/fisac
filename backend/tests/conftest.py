import asyncio
import os
from datetime import date
from pathlib import Path

# Before any fisac import: the engine reads DATABASE_URL at import time.
TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://fisac:fisac@localhost:5432/fisac_test"
)
os.environ["DATABASE_URL"] = TEST_URL

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import make_url, select, text  # noqa: E402

import fisac.models  # noqa: E402, F401
from fisac import db  # noqa: E402
from fisac.db import Base  # noqa: E402
from fisac.main import app  # noqa: E402
from fisac.models import FiscalYear, Purchase, PurchaseLine, Sale  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
SEEDED = (
    "vat_schemes",
    "isoc_schemes",
    "depreciation_models",
    "financial_accounts",
    "payment_methods",
    "categories",
)
_snapshot: dict[str, list[dict]] = {}


async def _recreate_database() -> None:
    url = make_url(TEST_URL)
    conn = await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
        database="postgres",
    )
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{url.database}"')
        await conn.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await conn.close()


async def _take_snapshot() -> None:
    async with db.engine.connect() as conn:
        for name in SEEDED:
            table = Base.metadata.tables[f"fisac.{name}"]
            rows = await conn.execute(select(table))
            _snapshot[name] = [dict(r._mapping) for r in rows]
    await db.engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def database():
    asyncio.run(_recreate_database())
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.set_main_option("path_separator", "os")
    command.upgrade(cfg, "head")
    asyncio.run(_take_snapshot())


@pytest_asyncio.fixture(autouse=True)
async def reset_database():
    yield
    tables = Base.metadata.sorted_tables
    async with db.engine.begin() as conn:
        names = ", ".join(f'"{t.schema}"."{t.name}"' for t in tables)
        await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        for table in tables:
            rows = _snapshot.get(table.name)
            if not rows:
                continue
            await conn.execute(table.insert(), rows)
            if "id" in table.c and table.c.id.autoincrement:
                await conn.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence('\"{table.schema}\".\"{table.name}\"', 'id'),"
                        f' (SELECT max(id) FROM "{table.schema}"."{table.name}"))'
                    )
                )
    await db.engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def session():
    async with db.async_session() as s:
        yield s


async def _fiscal_year(session, year: int = 2026) -> FiscalYear:
    fiscal_year = await session.scalar(
        select(FiscalYear).where(FiscalYear.start_date == date(year, 1, 1))
    )
    if fiscal_year is None:
        fiscal_year = FiscalYear(start_date=date(year, 1, 1), end_date=date(year, 12, 31))
        session.add(fiscal_year)
        await session.flush()
    return fiscal_year


async def add_sale(session, **kw) -> Sale:
    """A sale (fiscal year 2026 created when missing); `kw` overrides its columns."""
    fiscal_year = await _fiscal_year(session)
    values = {
        "fiscal_year_id": fiscal_year.id,
        "number": 1,
        "document_date": date(2026, 3, 1),
        "payment_method_id": 1,
    }
    sale = Sale(**{**values, **kw})
    session.add(sale)
    await session.commit()
    return sale


async def add_purchase_line(session, **kw) -> PurchaseLine:
    """A purchase with one line (category 6 Honoraires, VAT scheme 4, ISOC scheme 1).

    `kw` overrides the line's columns; the purchase's go in `purchase={...}`.
    """
    fiscal_year = await _fiscal_year(session)
    values = {
        "fiscal_year_id": fiscal_year.id,
        "number": 1,
        "document_date": date(2026, 3, 1),
        "payment_method_id": 1,
        **kw.pop("purchase", {}),
    }
    purchase = Purchase(**values)
    session.add(purchase)
    await session.flush()
    line = PurchaseLine(
        **{
            "purchase_id": purchase.id,
            "unit_price": 100,
            "category_id": 6,
            "vat_scheme_id": 4,
            "isoc_scheme_id": 1,
            "sort_key": "a0",
            **kw,
        }
    )
    session.add(line)
    await session.commit()
    return line
