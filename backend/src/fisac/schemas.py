from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from fisac.models import FlowKind, PaymentMethod

# Every money field is a Decimal - Pydantic v2 + FastAPI serialize it to a JSON
# string (not a number), which the hand-mirrored frontend types rely on.


# --- Accounts ---------------------------------------------------------------


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    current_balance: Decimal = Decimal("0")
    is_company: bool = False
    # Only meaningful for companies - normalized to false otherwise so the
    # stored state can't disagree with is_company.
    vat_applicable: bool = False
    # Day of the month (1-31) the account's Visa charges are paid; feeds the
    # create-flow form's payment_date auto-fill.
    visa_payment_day: int | None = Field(default=None, ge=1, le=31)

    @model_validator(mode="after")
    def _vat_only_for_companies(self) -> "AccountCreate":
        if not self.is_company:
            self.vat_applicable = False
        return self


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    current_balance: Decimal | None = None
    is_company: bool | None = None
    vat_applicable: bool | None = None
    visa_payment_day: int | None = Field(default=None, ge=1, le=31)


class AccountRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    current_balance: Decimal
    is_company: bool
    vat_applicable: bool
    visa_payment_day: int | None
    sort_key: str


# --- Categories -------------------------------------------------------------


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Both 0-100. tax: share deductible for income/corporate tax (remainder is
    # the "dépense non admise"); vat: share of VAT that is recoverable.
    tax_deduction_rate: Decimal = Field(default=Decimal("100"), ge=0, le=100)
    vat_deduction_rate: Decimal = Field(default=Decimal("100"), ge=0, le=100)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    tax_deduction_rate: Decimal | None = Field(default=None, ge=0, le=100)
    vat_deduction_rate: Decimal | None = Field(default=None, ge=0, le=100)


class CategoryRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    account_id: int
    name: str
    tax_deduction_rate: Decimal
    vat_deduction_rate: Decimal
    sort_key: str


# --- Flow lines -------------------------------------------------------------


class FlowLineCreate(BaseModel):
    description: str | None = Field(default=None, max_length=200)
    # Net base (excl. VAT), unsigned - the flow's kind supplies the sign.
    amount_net: Decimal = Field(ge=0)
    vat_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class FlowLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    description: str | None
    amount_net: Decimal
    vat_rate: Decimal
    sort_key: str


# --- Flows ------------------------------------------------------------------


class FlowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: FlowKind
    category_id: int | None = None
    invoice_date: date
    # A flow with no payment method makes no payment, so it must carry no
    # payment_date (mirrors the DB CheckConstraint).
    payment_date: date | None = None
    payment_method: PaymentMethod | None = None
    paid: bool = False
    # Reverse charge (autoliquidation): only meaningful on expenses. When set,
    # no VAT is paid to the supplier (gross = net) but the notional VAT is
    # self-assessed on the VAT return (output + deductible).
    reverse_charge: bool = False
    lines: list[FlowLineCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _no_method_no_payment_date(self) -> "FlowCreate":
        if self.payment_method is None and self.payment_date is not None:
            raise ValueError("payment_date requires a payment_method")
        return self


# Full-replace semantics on update (fields + the entire line set), like the old
# one-off flow update.
FlowUpdate = FlowCreate


class FlowRead(BaseModel):
    id: int
    account_id: int
    name: str
    kind: FlowKind
    category_id: int | None
    invoice_date: date
    payment_date: date | None
    payment_method: PaymentMethod | None
    paid: bool
    # Shared by all flows created in the same /bulk call; null otherwise.
    batch_id: str | None
    reverse_charge: bool
    sort_key: str
    lines: list[FlowLineRead]
    # Computed from the lines (nothing is stored on the flow header). Note that
    # for a reverse-charge flow amount_gross == amount_net (no VAT paid), while
    # amount_vat still carries the notional VAT used by the VAT report.
    amount_net: Decimal
    amount_vat: Decimal
    amount_gross: Decimal


class FlowPaidSet(BaseModel):
    paid: bool


class FlowBulkUpdate(BaseModel):
    # Applies to every flow in flow_ids. Only fields actually present in the
    # request are changed (checked via model_fields_set in the router), so a
    # partial bulk edit - e.g. category alone - leaves the rest untouched. This
    # is why category_id/payment_method default to None yet can also be
    # *explicitly* set to None to clear a value; "omitted" and "set to null"
    # are distinguished by presence, not by the value.
    flow_ids: list[int] = Field(min_length=1, max_length=500)
    category_id: int | None = None
    payment_method: PaymentMethod | None = None
    paid: bool | None = None
    reverse_charge: bool | None = None
    # When amount_net is present, each selected flow's entire line set is
    # replaced by a single line (net + vat_rate). vat_rate is only meaningful
    # alongside amount_net.
    amount_net: Decimal | None = Field(default=None, ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)


class FlowBulkDelete(BaseModel):
    flow_ids: list[int] = Field(min_length=1, max_length=500)


# --- LLM-assisted generation -------------------------------------------------


class ScheduleOccurrence(BaseModel):
    # One instance of a recurring rule as produced by the LLM: a period-aware
    # name ("Cotisations sociales Q1") plus the two dates. Everything else
    # (category, amounts, VAT, payment method) is template data the frontend
    # applies uniformly before insertion.
    name: str = Field(min_length=1, max_length=200)
    invoice_date: date
    payment_date: date | None = None


class FlowGenerateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=2000)


class FlowGenerateResponse(BaseModel):
    occurrences: list[ScheduleOccurrence]
    model: str
    # OpenRouter provider slug that actually served the request, when reported.
    # Surfaced so bad formatting can be traced to (and excluded via
    # OPENROUTER_PROVIDERS) the responsible provider.
    provider: str | None = None


class FlowBulkCreate(BaseModel):
    flows: list[FlowCreate] = Field(min_length=1, max_length=100)


# --- Reordering (fractional index) ------------------------------------------


class MoveRequest(BaseModel):
    # The row lands strictly between these two neighbors (by their sort keys).
    # Pass null for either end to move to the start/end of the list.
    after_id: int | None = None
    before_id: int | None = None


# --- Projection -------------------------------------------------------------


class ProjectionFlow(BaseModel):
    id: int
    name: str
    kind: FlowKind
    # Unsigned gross magnitude (Σ lines, incl. VAT); the sign comes from kind.
    amount: Decimal
    invoice_date: date
    payment_date: date
    paid: bool


class ProjectionPoint(BaseModel):
    date: date
    flows: list[ProjectionFlow]
    balance: Decimal


class AccountProjection(BaseModel):
    as_of: date
    starting_balance: Decimal
    points: list[ProjectionPoint]


# --- VAT estimation (per quarter) -------------------------------------------


class VatFlow(BaseModel):
    id: int
    name: str
    kind: FlowKind
    invoice_date: date
    # This flow's own contribution to the quarter's two totals. A normal revenue
    # hits output_vat only; a normal expense hits deductible_vat only; a
    # reverse-charge expense (autoliquidation) self-assesses the notional VAT and
    # hits *both*.
    output_vat: Decimal
    deductible_vat: Decimal
    reverse_charge: bool
    # Context: gross_vat is the full VAT on the flow (Σ line VAT, before
    # deduction); deduction_rate is the recoverable share applied (100 for a
    # revenue, the category's vat_deduction_rate for an expense, 0 when
    # uncategorized); vat_rate is the line VAT % if the flow's lines share one
    # rate, else null (mixed).
    gross_vat: Decimal
    deduction_rate: Decimal
    vat_rate: Decimal | None


class VatQuarter(BaseModel):
    quarter: int  # 1-4
    label: str  # e.g. "Q1 2026"
    output_vat: Decimal  # VAT collected on revenues
    deductible_vat: Decimal  # recoverable VAT on expenses
    net_due: Decimal  # output - deductible (negative = VAT credit)
    flows: list[VatFlow]


class AccountVat(BaseModel):
    year: int
    vat_applicable: bool
    total_net_due: Decimal
    quarters: list[VatQuarter]
