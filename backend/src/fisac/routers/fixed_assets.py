from decimal import Decimal

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import register
from fisac.db import get_session
from fisac.errors import commit, field_error, not_found
from fisac.models import (
    DepreciationModel,
    FiscalYear,
    FixedAsset,
    FixedAssetDepreciation,
    PieceKind,
    Purchase,
    PurchaseLine,
)
from fisac.schemas.fixed_assets import (
    DepreciationWrite,
    FixedAssetCreate,
    FixedAssetRead,
    FixedAssetUpdate,
    RegisterRow,
)

router = APIRouter(tags=["fixed-assets"])

# First key of the two-int advisory lock taken while numbering (the second is 0:
# numbers run across years); distinct from the pieces' keys and the fiscal-year lock.
_NUMBER_LOCK = 7_301_004

_ZERO = Decimal("0.00")


async def _get(session: AsyncSession, asset_id: int) -> FixedAsset:
    asset = await session.get(FixedAsset, asset_id)
    if asset is None:
        raise not_found("Immobilisation")
    return asset


async def _check_model(session: AsyncSession, model_id: int) -> None:
    if await session.get(DepreciationModel, model_id) is None:
        raise field_error("depreciation_model_id", "Modèle d'amortissement introuvable")


async def _rows(session: AsyncSession, asset_id: int) -> list[FixedAssetDepreciation]:
    return list(
        await session.scalars(
            select(FixedAssetDepreciation)
            .where(FixedAssetDepreciation.fixed_asset_id == asset_id)
            .order_by(FixedAssetDepreciation.year)
        )
    )


async def _base(session: AsyncSession, asset: FixedAsset) -> dict:
    _, purchase, value, acquired = await register.source(session, asset)
    return {
        "id": asset.id,
        "number": asset.number,
        "description": asset.description,
        "purchase_line_id": asset.purchase_line_id,
        "purchase_id": purchase.id,
        "purchase_number": purchase.number,
        "depreciation_model_id": asset.depreciation_model_id,
        "value": value,
        "acquired_on": acquired,
    }


async def _read(session: AsyncSession, asset_id: int) -> dict:
    session.expire_all()
    asset = await _get(session, asset_id)
    rows = await _rows(session, asset.id)
    return await _base(session, asset) | {
        "schedule": [{"year": r.year, "amount": r.amount, "edited": r.edited} for r in rows]
    }


@router.get("/fiscal-years/{year_id}/fixed-assets", response_model=list[RegisterRow])
async def register_for_year(year_id: int, session: AsyncSession = Depends(get_session)):
    """The register as of a fiscal year: the assets acquired by its end."""
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    out = []
    for asset in await session.scalars(select(FixedAsset).order_by(FixedAsset.number)):
        base = await _base(session, asset)
        if base["acquired_on"] > year.end_date:
            continue
        rows = await _rows(session, asset.id)
        before = sum((r.amount for r in rows if r.year < year.end_date.year), _ZERO)
        current = sum((r.amount for r in rows if r.year == year.end_date.year), _ZERO)
        remaining = base["value"] - before - current
        out.append(
            base
            | {
                "depreciated_before": before,
                "depreciation": current,
                "remaining": remaining,
                "status": "depreciated" if remaining <= 0 else "in_service",
                "schedule_balanced": sum((r.amount for r in rows), _ZERO) == base["value"],
            }
        )
    return out


@router.post("/fixed-assets", response_model=FixedAssetRead, status_code=201)
async def create_asset(body: FixedAssetCreate, session: AsyncSession = Depends(get_session)):
    line = await session.get(PurchaseLine, body.purchase_line_id)
    if line is None:
        raise field_error("purchase_line_id", "Ligne d'achat introuvable")
    purchase = await session.get(Purchase, line.purchase_id)
    if purchase.kind != PieceKind.INVOICE:
        raise field_error("purchase_line_id", "Seule une ligne de facture peut être reprise")
    taken = await session.scalar(select(FixedAsset.id).where(FixedAsset.purchase_line_id == line.id))
    if taken is not None:
        raise field_error("purchase_line_id", "Cette ligne est déjà au registre")
    await _check_model(session, body.depreciation_model_id)
    await session.execute(text("SELECT pg_advisory_xact_lock(:k1, 0)"), {"k1": _NUMBER_LOCK})
    last = await session.scalar(select(func.max(FixedAsset.number)))
    asset = FixedAsset(number=(last or 0) + 1, **body.model_dump())
    session.add(asset)
    await session.flush()
    await register.refresh_schedule(session, asset)
    await commit(session)
    return await _read(session, asset.id)


@router.get("/fixed-assets/{asset_id}", response_model=FixedAssetRead)
async def read_asset(asset_id: int, session: AsyncSession = Depends(get_session)):
    return await _read(session, asset_id)


@router.patch("/fixed-assets/{asset_id}", response_model=FixedAssetRead)
async def update_asset(
    asset_id: int, body: FixedAssetUpdate, session: AsyncSession = Depends(get_session)
):
    asset = await _get(session, asset_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("description") is not None:
        asset.description = changes["description"]
    model_id = changes.get("depreciation_model_id")
    if model_id is not None and model_id != asset.depreciation_model_id:
        await _check_model(session, model_id)
        asset.depreciation_model_id = model_id
        await session.flush()
        await register.refresh_schedule(session, asset)
    await commit(session)
    return await _read(session, asset_id)


@router.delete("/fixed-assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, session: AsyncSession = Depends(get_session)):
    await session.delete(await _get(session, asset_id))  # its schedule goes with it
    await commit(session)
    return Response(status_code=204)


@router.put("/fixed-assets/{asset_id}/depreciations/{year}", response_model=FixedAssetRead)
async def type_depreciation(
    asset_id: int, year: int, body: DepreciationWrite, session: AsyncSession = Depends(get_session)
):
    await _get(session, asset_id)
    if not 1900 <= year <= 2200:
        raise not_found("Année")
    row = await session.get(FixedAssetDepreciation, (asset_id, year))
    if row is None:
        session.add(
            FixedAssetDepreciation(fixed_asset_id=asset_id, year=year, amount=body.amount, edited=True)
        )
    else:
        row.amount, row.edited = body.amount, True
    await commit(session)
    return await _read(session, asset_id)


@router.post("/fixed-assets/{asset_id}/recompute", response_model=FixedAssetRead)
async def recompute(asset_id: int, session: AsyncSession = Depends(get_session)):
    await register.refresh_schedule(session, await _get(session, asset_id), reset=True)
    await commit(session)
    return await _read(session, asset_id)
