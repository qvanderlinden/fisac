from pydantic import BaseModel, ConfigDict, Field, field_validator

from fisac.iban import checked as checked_iban


class ThirdPartyRead(BaseModel):
    id: int
    name: str
    iban: str | None
    uses: int


class ThirdPartyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    iban: str | None = None

    _iban = field_validator("iban")(staticmethod(checked_iban))


class ThirdPartyUpdate(BaseModel):
    """Only the fields sent are changed; the IBAN can be cleared with "" or null."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    iban: str | None = None

    _iban = field_validator("iban")(staticmethod(checked_iban))
