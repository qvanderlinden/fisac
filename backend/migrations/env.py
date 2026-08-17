import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from fisac.config import settings
from fisac.db import Base
from fisac.models import (  # noqa: F401 - registers the tables with Base.metadata
    Account,
    Category,
    Flow,
    FlowLine,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Tables live in a dedicated schema rather than public - read off the
# MetaData itself (db.py's single source of truth) rather than repeating the
# literal here, so this can't drift out of sync with it. Scoping autogenerate
# to it keeps the diff from picking up anything else in the database, and
# alembic's own bookkeeping table is excluded explicitly.
SCHEMA = target_metadata.schema


def include_name(name, type_, parent_names):
    if type_ == "schema":
        # fisac is this role's default schema, so Alembic represents it
        # internally as None (the "default" schema) rather than by name.
        return name in (None, SCHEMA)
    if type_ == "table":
        return name != "alembic_version"
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    # Alembic creates its own version-tracking table in this schema before
    # running any migration's upgrade() - the schema has to exist before that
    # happens, so a fresh database needs this ahead of context.configure().
    # Committed on its own so it isn't left inside whatever transaction
    # context.begin_transaction() opens next.
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
    connection.commit()

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable: AsyncEngine = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
