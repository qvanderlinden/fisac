from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class IsocPrepaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    due_date: date
    amount: Decimal
    payment_method_id: int
    paid: bool
    payment_date: date | None


class IsocPrepaymentUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    payment_method_id: int | None = None
    payment_date: date | None = None
    paid: bool | None = None
