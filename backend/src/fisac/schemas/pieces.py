"""What sales and purchases share: the bodies and the read fields."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fisac.models import PieceKind


class PieceCreate(BaseModel):
    kind: PieceKind
    document_date: date
    payment_method_id: int
    payment_date: date
    third_party_id: int | None = None
    description: str = Field(default="", max_length=200)
    booking_date: date | None = None
    paid: bool = False


class PieceUpdate(BaseModel):
    """Only the fields sent are changed; a null clears the tiers or the booking date."""

    model_config = ConfigDict(extra="forbid")

    kind: PieceKind | None = None
    document_date: date | None = None
    payment_method_id: int | None = None
    payment_date: date | None = None
    third_party_id: int | None = None
    description: str | None = Field(default=None, max_length=200)
    booking_date: date | None = None
    paid: bool | None = None


class LineCreate(BaseModel):
    description: str = Field(default="", max_length=200)
    unit_price: Decimal = Field(max_digits=12, decimal_places=2)
    quantity: Decimal = Field(default=Decimal(1), max_digits=10, decimal_places=3)
    category_id: int
    vat_scheme_id: int


class LineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, max_length=200)
    unit_price: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    quantity: Decimal | None = Field(default=None, max_digits=10, decimal_places=3)
    category_id: int | None = None
    vat_scheme_id: int | None = None


class LineRead(BaseModel):
    id: int
    description: str
    unit_price: Decimal
    quantity: Decimal
    category_id: int
    vat_scheme_id: int
    net: Decimal
    vat: Decimal


class PieceRead(BaseModel):
    id: int
    fiscal_year_id: int
    number: int
    kind: PieceKind
    third_party_id: int | None
    third_party_name: str | None
    description: str
    document_date: date
    booking_date: date
    payment_method_id: int
    payment_date: date
    paid: bool | None  # None for a card purchase
    status: Literal["paid", "planned", "late"]
    net: Decimal
    vat: Decimal
    total: Decimal
