from pydantic import BaseModel, ConfigDict, Field

from fisac.models import CategoryDirection


class CategoryRead(BaseModel):
    id: int
    label: str
    direction: CategoryDirection
    archived: bool
    uses: int


class CategoryCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    direction: CategoryDirection


class CategoryUpdate(BaseModel):
    """Only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=120)
    direction: CategoryDirection | None = None
    archived: bool | None = None
