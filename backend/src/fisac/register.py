"""The fixed-asset register: an asset's value and its stored depreciation schedule."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.books.amounts import line_amounts
from fisac.books.depreciation import schedule
from fisac.models import (
    DepreciationModel,
    FixedAsset,
    FixedAssetDepreciation,
    Purchase,
    PurchaseLine,
    VatScheme,
)
from fisac.routers.company import get_or_create


def asset_value(line: PurchaseLine, scheme: VatScheme) -> Decimal:
    """What an asset is worth: its line's charge (net plus the VAT not recovered)."""
    return line_amounts(line.unit_price, line.quantity, scheme.rate, scheme.recoverable_rate).charge


async def source(session: AsyncSession, asset: FixedAsset) -> tuple[PurchaseLine, Purchase, Decimal, date]:
    """The asset's line, its purchase, its value and its acquisition date."""
    line = await session.get(PurchaseLine, asset.purchase_line_id)
    purchase = await session.get(Purchase, line.purchase_id)
    scheme = await session.get(VatScheme, line.vat_scheme_id)
    return line, purchase, asset_value(line, scheme), pieces.effective_date(purchase)


async def refresh_schedule(session: AsyncSession, asset: FixedAsset, *, reset: bool = False) -> None:
    """Rewrite the asset's schedule from its model, line and purchase date.

    Rows typed over (`edited`) are kept as they are, years included; the others
    are rewritten, and dropped when their year is no longer in the schedule.
    `reset` rewrites every row and clears `edited`. Flushes; the caller commits.
    """
    await session.refresh(asset)  # a commit since it was loaded expired it
    _, _, value, acquired = await source(session, asset)
    model = await session.get(DepreciationModel, asset.depreciation_model_id)
    company = await get_or_create(session)
    rows = schedule(value, acquired, model.years, model.method, model.first_year, company.fiscal_year_start_month)
    existing = {
        row.year: row
        for row in await session.scalars(
            select(FixedAssetDepreciation).where(FixedAssetDepreciation.fixed_asset_id == asset.id)
        )
    }
    wanted = dict(rows)
    for year, amount in wanted.items():
        row = existing.get(year)
        if row is None:
            session.add(FixedAssetDepreciation(fixed_asset_id=asset.id, year=year, amount=amount))
        elif reset or not row.edited:
            row.amount, row.edited = amount, False
    for year, row in existing.items():
        if year not in wanted and (reset or not row.edited):
            await session.delete(row)
    await session.flush()
