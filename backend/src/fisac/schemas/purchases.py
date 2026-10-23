from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from fisac.schemas.pieces import (
    LineCreate,
    LineRead,
    LineUpdate,
    PieceCreate,
    PieceRead,
    PieceUpdate,
)

PurchaseCreate = PieceCreate
PurchaseUpdate = PieceUpdate
PurchaseLineCreate = LineCreate
PurchaseLineUpdate = LineUpdate


class PurchaseLineRead(LineRead):
    recovered: Decimal
    charge: Decimal
    # The register entry that takes the line over, when there is one.
    fixed_asset_id: int | None
    fixed_asset_number: int | None


class PurchaseRead(PieceRead):
    recovered: Decimal
    charge: Decimal
    lines: list[PurchaseLineRead]


class AvailableLine(BaseModel):
    id: int
    purchase_id: int
    purchase_number: int
    fiscal_year: int
    third_party_name: str | None
    description: str
    net: Decimal
    charge: Decimal
    booking_date: date
