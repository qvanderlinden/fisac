from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PartnerRead(BaseModel):
    id: int
    name: str
    shares: int
    contribution: Decimal


class PartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    shares: int = Field(default=0, ge=0)
    contribution: Decimal = Field(default=Decimal(0), ge=0, max_digits=12, decimal_places=2)


class PartnerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    shares: int | None = Field(default=None, ge=0)
    contribution: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
