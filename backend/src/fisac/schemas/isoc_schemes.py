from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from fisac.models import IsocRubric


class IsocSchemeRead(BaseModel):
    id: int
    label: str
    deductible_rate: Decimal
    rubric: IsocRubric
    uses: int


class IsocSchemeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    deductible_rate: Decimal = Field(max_digits=5, decimal_places=2)
    rubric: IsocRubric = IsocRubric.OTHER


class IsocSchemeUpdate(BaseModel):
    """Only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=120)
    deductible_rate: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    rubric: IsocRubric | None = None
