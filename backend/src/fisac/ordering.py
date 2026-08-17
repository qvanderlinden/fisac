"""Helpers for fractional-index (`sort_key`) ordering across the routers."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.fractional_index import key_between


async def next_sort_key(session: AsyncSession, model: Any, *scope: Any) -> str:
    """A sort key that appends a new row at the end of its scope."""
    query = (
        select(model.sort_key)
        .where(*scope)
        .order_by(model.sort_key.desc())
        .limit(1)
    )
    last = (await session.execute(query)).scalar_one_or_none()
    return key_between(last, None)


async def move_sort_key(
    session: AsyncSession,
    model: Any,
    after_id: int | None,
    before_id: int | None,
) -> str:
    """A sort key placing a row strictly between the two neighbor rows.

    `after_id`/`before_id` are the rows the moved row should land after/before;
    None means the start/end of the list.
    """
    after_key = None
    before_key = None
    if after_id is not None:
        after = await session.get(model, after_id)
        if after is not None:
            after_key = after.sort_key
    if before_id is not None:
        before = await session.get(model, before_id)
        if before is not None:
            before_key = before.sort_key
    return key_between(after_key, before_key)
