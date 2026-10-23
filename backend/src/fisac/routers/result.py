from dataclasses import asdict
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.books import result
from fisac.books.amounts import sign
from fisac.db import get_session
from fisac.errors import not_found
from fisac.models import Category, FiscalYear, FixedAsset, FixedAssetDepreciation
from fisac.schemas.result import ResultRead

router = APIRouter(tags=["result"])

_ZERO = Decimal("0.00")  # adding it turns the -0.00 of a credit note on nothing into 0.00


@router.get("/fiscal-years/{year_id}/result", response_model=ResultRead)
async def read_result(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    depreciation_year = year.end_date.year  # read_pieces expires the session's objects
    labels = {c.id: c.label for c in await session.scalars(select(Category))}
    built: dict[str, list[result.ResultLine]] = {"sales": [], "purchases": []}
    for spec, prefix, key in ((pieces.SALES, "S", "sales"), (pieces.PURCHASES, "A", "purchases")):
        for read in await pieces.read_pieces(session, spec, spec.piece.fiscal_year_id == year_id):
            s = sign(read["kind"])  # reads are unsigned: the kind carries the sign, applied once here
            for line in read["lines"]:
                if spec.purchase and line["fixed_asset_id"] is not None:
                    continue  # the asset's depreciation counts instead
                amount = line["charge"] if spec.purchase else line["net"]
                built[key].append(result.ResultLine(
                    line["category_id"], labels[line["category_id"]], read["id"],
                    pieces.reference(prefix, read["number"], 4), read["booking_date"],
                    read["third_party_name"], s * amount + _ZERO,
                ))
    rows = await session.execute(
        select(FixedAsset.id, FixedAsset.number, FixedAsset.description, FixedAssetDepreciation.amount)
        .join(FixedAssetDepreciation, FixedAssetDepreciation.fixed_asset_id == FixedAsset.id)
        .where(FixedAssetDepreciation.year == depreciation_year)
    )
    depreciation = [
        result.AssetDepreciation(asset_id, pieces.reference("I", number, 3), description, amount)
        for asset_id, number, description, amount in rows
    ]
    return asdict(result.compute(built["sales"], built["purchases"], depreciation))
