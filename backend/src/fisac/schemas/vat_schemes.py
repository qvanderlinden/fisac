from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class VatSchemeRead(BaseModel):
    id: int
    label: str
    rate: Decimal
    recoverable_rate: Decimal | None
    for_sales: bool
    for_purchases: bool
    uses: int


# The 0-100 range and the side rules are the database's (translated on commit);
# max_digits only keeps a value inside the column.
class VatSchemeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    rate: Decimal = Field(max_digits=5, decimal_places=2)
    recoverable_rate: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    for_sales: bool
    for_purchases: bool


class VatSchemeUpdate(BaseModel):
    """Only the fields sent are changed; a null recoverable_rate clears it."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=120)
    rate: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    recoverable_rate: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    for_sales: bool | None = None
    for_purchases: bool | None = None
