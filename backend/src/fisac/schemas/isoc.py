from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class DisallowedLineRead(BaseModel):
    reference: str  # A-0001 for a purchase, I-001 for a fixed asset's depreciation
    date: date
    label: str  # the purchase's third party, or the asset's description
    amount: Decimal  # signed charge, or the asset's depreciation of the year
    deductible_rate: Decimal
    disallowed: Decimal


class DisallowedRubricRead(BaseModel):
    total: Decimal
    lines: list[DisallowedLineRead]


class DisallowedRead(BaseModel):
    total: Decimal
    restaurant: DisallowedRubricRead
    car: DisallowedRubricRead
    other: DisallowedRubricRead


class IsocConditionsRead(BaseModel):
    small_company: bool
    minimum_pay: bool
    shares_owned: bool


class IsocPrepaymentView(BaseModel):
    id: int | None  # None until GET /isoc-prepayments creates the row
    number: int
    due_date: date
    amount: Decimal
    payment_method_id: int | None
    paid: bool
    payment_date: date | None
    quarter: int | None  # the quarter it counts for; None when unpaid or after the 4th due date
    bonification_rate: Decimal | None
    bonification: Decimal


class MajorationRead(BaseModel):
    rate: Decimal
    gross: Decimal
    bonification_total: Decimal
    threshold: Decimal
    amount: Decimal
    exempt: bool
    # first_years: exempt; otherwise why not
    exempt_reason: Literal["first_years", "not_small_company", "no_incorporation_date", "after_first_years"]


class IsocRead(BaseModel):
    before_tax: Decimal
    disallowed: DisallowedRead
    taxable_base: Decimal
    conditions: IsocConditionsRead
    reduced: bool
    reduced_rate: Decimal
    reduced_ceiling: Decimal
    normal_rate: Decimal
    tax_reduced: Decimal
    tax_normal: Decimal
    tax: Decimal
    majoration: MajorationRead
    prepayments: list[IsocPrepaymentView]
    paid_total: Decimal
    balance: Decimal
    estimated_tax: Decimal
    after_tax: Decimal
    assessment_year: int
    parameters_fallback: bool
