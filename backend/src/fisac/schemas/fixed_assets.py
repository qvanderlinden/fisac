from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FixedAssetCreate(BaseModel):
    purchase_line_id: int
    description: str = Field(default="", max_length=200)
    depreciation_model_id: int


class FixedAssetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, max_length=200)
    depreciation_model_id: int | None = None


class DepreciationWrite(BaseModel):
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class ScheduleRow(BaseModel):
    year: int
    amount: Decimal
    edited: bool


class FixedAssetBase(BaseModel):
    id: int
    number: int
    description: str
    purchase_line_id: int
    purchase_id: int
    purchase_number: int
    depreciation_model_id: int
    value: Decimal
    acquired_on: date


class FixedAssetRead(FixedAssetBase):
    schedule: list[ScheduleRow]


class RegisterRow(FixedAssetBase):
    depreciated_before: Decimal
    depreciation: Decimal
    remaining: Decimal
    status: Literal["in_service", "depreciated"]
    schedule_balanced: bool
