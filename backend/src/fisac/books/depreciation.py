"""Depreciation schedule over fiscal years, in integer cents."""

from datetime import date, timedelta
from decimal import Decimal

from fisac.models import DepreciationFirstYear, DepreciationMethod

_DAYS = 365


def fiscal_year_of(day: date, start_month: int) -> tuple[date, date]:
    """The fiscal year (first day, last day) containing `day`."""
    year = day.year if day.month >= start_month else day.year - 1
    start = date(year, start_month, 1)
    end = date(year + 1, start_month, 1) - timedelta(days=1)
    return start, end


def _div(num: int, den: int) -> int:
    """Half-up integer division of non-negative numbers."""
    return (2 * num + den) // (2 * den)


def schedule(
    value: Decimal,
    acquired: date,
    years: int,
    method: DepreciationMethod,
    first_year: DepreciationFirstYear,
    start_month: int,
) -> list[tuple[int, Decimal]]:
    """`(year, amount)` rows, `year` being the calendar year the fiscal year ends in.

    The first year counts `days / 365` of a year when prorated (days from the
    acquisition to its fiscal year's end, both included, at most 365), a whole year
    otherwise. Linear: value / years a year, the first year scaled, an extra last
    row when the first year was partial, the last row takes the remainder.
    Declining: twice the linear rate on what remains, linear over the remaining
    life once that gives more, the last row takes the remainder.
    """
    if years < 1:
        return []
    total = int((value * 100).quantize(Decimal(1), rounding="ROUND_HALF_UP"))
    start, end = fiscal_year_of(acquired, start_month)
    year = end.year
    days = min(_DAYS, (end - acquired).days + 1)
    first = days if first_year == DepreciationFirstYear.PRORATA else _DAYS
    out: list[tuple[int, Decimal]] = []
    rest = total

    def push(amount: int) -> None:
        nonlocal rest
        rest -= amount
        out.append((year + len(out), Decimal(amount).scaleb(-2)))

    if method == DepreciationMethod.DECLINING:
        life = years * _DAYS
        linear = False
        i = 0
        while rest > 0 and i < years + 2:
            part = first if i == 0 else _DAYS
            if life <= part:
                amount = rest
            else:
                if years * _DAYS >= 2 * life:
                    linear = True
                if linear:
                    share = _div(rest * part, life)
                else:
                    share = _div(rest * 2 * part, years * _DAYS)
                amount = min(share, rest)
            life -= part
            push(amount)
            i += 1
        return out

    count = years + 1 if first < _DAYS else years
    for i in range(count):
        if rest <= 0:
            break
        if i == count - 1:
            push(rest)
        elif i == 0:
            push(min(_div(total * first, years * _DAYS), rest))
        else:
            push(min(_div(total, years), rest))
    return out
