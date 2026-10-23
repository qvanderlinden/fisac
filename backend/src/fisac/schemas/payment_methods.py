from pydantic import BaseModel, ConfigDict, Field

from fisac.models import PaymentMethodType


class PaymentMethodRead(BaseModel):
    id: int
    name: str
    type: PaymentMethodType
    financial_account_id: int
    financial_account_name: str
    statement_closing_day: int | None
    statement_payment_day: int | None
    settlement_account_id: int | None
    uses: int


# The 1-31 range and the card rule are the database's (translated on commit);
# the int bounds only keep a value inside the column.
class PaymentMethodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: PaymentMethodType
    # A card gets its own account when none is given.
    financial_account_id: int | None = None
    statement_closing_day: int | None = Field(default=None, ge=-32768, le=32767)
    statement_payment_day: int | None = Field(default=None, ge=-32768, le=32767)


class PaymentMethodUpdate(BaseModel):
    """The type and the account are fixed once created."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    statement_closing_day: int | None = Field(default=None, ge=-32768, le=32767)
    statement_payment_day: int | None = Field(default=None, ge=-32768, le=32767)
