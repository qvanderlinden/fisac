from pydantic import BaseModel, ConfigDict, Field

from fisac.models import DepreciationFirstYear, DepreciationMethod


class DepreciationModelRead(BaseModel):
    id: int
    label: str
    years: int
    method: DepreciationMethod
    first_year: DepreciationFirstYear
    uses: int


# The 1-50 range of `years` is the database's; the bounds here only keep the
# value inside its smallint column.
class DepreciationModelCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    years: int = Field(ge=-32768, le=32767)
    method: DepreciationMethod = DepreciationMethod.LINEAR
    first_year: DepreciationFirstYear = DepreciationFirstYear.PRORATA


class DepreciationModelUpdate(BaseModel):
    """Only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=120)
    years: int | None = Field(default=None, ge=-32768, le=32767)
    method: DepreciationMethod | None = None
    first_year: DepreciationFirstYear | None = None
