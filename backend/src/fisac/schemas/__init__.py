from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def to_read(schema: type[T], obj, **extra) -> T:
    """Validate an ORM row (its columns) plus computed `extra` fields into `schema`."""
    data = {c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs}
    return schema.model_validate({**data, **extra})
