from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from fisac.models import FiscalYearState


class FiscalYearRead(BaseModel):
    id: int
    start_date: date
    end_date: date
    state: FiscalYearState
    isoc_small_company: bool
    isoc_minimum_pay: bool
    isoc_shares_owned: bool


class NextPeriod(BaseModel):
    start_date: date
    end_date: date


class FiscalYearUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: FiscalYearState | None = None
    isoc_small_company: bool | None = None
    isoc_minimum_pay: bool | None = None
    isoc_shares_owned: bool | None = None


class EquityLineRead(BaseModel):
    id: int
    label: str
    amount: Decimal
