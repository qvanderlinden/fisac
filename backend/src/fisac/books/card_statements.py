"""A card's monthly statement: purchases from `start` to `end` are paid on `payment`."""

import calendar
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Statement:
    start: date
    end: date
    payment: date


def _clamp(year: int, month: int, day: int) -> date:
    """The day of the month, cut to its last day: 31 stands for every month's end."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _shift(year: int, month: int, by: int) -> tuple[int, int]:
    index = year * 12 + month - 1 + by
    return index // 12, index % 12 + 1


def statement_for(day: date, closing_day: int, payment_day: int) -> Statement:
    """The statement containing `day`: it closes on `closing_day`, starts the day after
    the previous closing and is paid on `payment_day` of the following month."""
    year, month = day.year, day.month
    if day > _clamp(year, month, closing_day):
        year, month = _shift(year, month, 1)
    end = _clamp(year, month, closing_day)
    py, pm = _shift(year, month, -1)
    start = _clamp(py, pm, closing_day).toordinal() + 1
    ny, nm = _shift(year, month, 1)
    return Statement(date.fromordinal(start), end, _clamp(ny, nm, payment_day))
