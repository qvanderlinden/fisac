from sqlalchemy import ColumnElement, Integer, func, literal, select


def uses_expr(id_col, *refs) -> ColumnElement[int]:
    """How many rows reference `id_col`'s row, summed over the referencing columns."""
    if not refs:
        return literal(0, Integer)
    counts = [select(func.count()).where(ref == id_col).scalar_subquery() for ref in refs]
    return sum(counts[1:], counts[0])
