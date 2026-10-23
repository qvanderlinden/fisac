from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from fisac.models import VatRegime


class VatPieceRead(BaseModel):
    kind: Literal["sale", "purchase"]
    piece_id: int
    number: str
    date: date
    third_party: str | None
    net: Decimal
    vat: Decimal
    recovered: Decimal


class VatPeriodRead(BaseModel):
    id: int
    start: date
    end: date
    due: date
    filed_on: date | None
    status: Literal["current", "to_file", "filed"]
    sales_net: Decimal
    sales_vat: Decimal
    purchases_net: Decimal
    purchases_vat_recovered: Decimal
    balance: Decimal
    pieces: list[VatPieceRead]


class VatPeriodsRead(BaseModel):
    regime: VatRegime
    periods: list[VatPeriodRead]


class VatPeriodUpdate(BaseModel):
    filed_on: date | None
