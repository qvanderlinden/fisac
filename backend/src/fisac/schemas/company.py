from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from fisac.iban import checked as checked_iban
from fisac.models import LegalForm, VatRegime


class CompanyRead(BaseModel):
    name: str
    legal_form: LegalForm
    bce_number: str | None
    vat_regime: VatRegime
    registered_office: str | None
    iban: str | None
    fiscal_year_start_month: int
    manager_name: str | None
    manager_since: date | None
    manager_paid: bool


class CompanyUpdate(BaseModel):
    """Only the fields sent are changed; nullable ones can be cleared with null."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    legal_form: LegalForm | None = None
    bce_number: str | None = Field(default=None, max_length=20)
    vat_regime: VatRegime | None = None
    registered_office: str | None = Field(default=None, max_length=300)
    iban: str | None = None
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    manager_name: str | None = Field(default=None, max_length=200)
    manager_since: date | None = None
    manager_paid: bool | None = None

    _iban = field_validator("iban")(staticmethod(checked_iban))
