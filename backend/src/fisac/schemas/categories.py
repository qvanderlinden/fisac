from pydantic import BaseModel, ConfigDict, Field

from fisac.models import CategoryKind, CategoryRole, CategorySettlement


class CategoryRead(BaseModel):
    id: int
    label: str
    kind: CategoryKind
    role: CategoryRole | None
    settlement: CategorySettlement | None
    default_vat_scheme_id: int | None
    default_isoc_scheme_id: int | None
    archived: bool
    uses: int


# The settlement only fits an outside category: the database says so (translated on commit).
class CategoryCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    kind: CategoryKind
    settlement: CategorySettlement | None = None
    default_vat_scheme_id: int | None = None
    default_isoc_scheme_id: int | None = None


class CategoryUpdate(BaseModel):
    """Only the fields sent are changed; a null settlement or default clears it.
    The role is never changed."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=120)
    kind: CategoryKind | None = None
    settlement: CategorySettlement | None = None
    default_vat_scheme_id: int | None = None
    default_isoc_scheme_id: int | None = None
    archived: bool | None = None
