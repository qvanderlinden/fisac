"""VAT return periods and their totals.

Pure: the router loads the pieces' lines (already signed) and the stored filing dates.
"""

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from fisac.models import VatRegime

_ZERO = Decimal("0.00")
_STEP = {VatRegime.QUARTERLY: 3, VatRegime.MONTHLY: 1}


@dataclass(frozen=True)
class VatLine:
    booking_date: date
    net: Decimal  # signed: a credit note counts negative
    vat: Decimal
    recovered: Decimal  # 0 for a sale
    side: Literal["sale", "purchase"]


@dataclass(frozen=True)
class VatSummary:
    sales_net: Decimal
    sales_vat: Decimal
    purchases_net: Decimal
    purchases_vat_recovered: Decimal
    balance: Decimal  # > 0 to pay, < 0 to recover


def periods(start: date, end: date, regime: VatRegime) -> list[tuple[date, date]]:
    """The calendar quarters or months touching [start, end], clipped to it."""
    step = _STEP.get(regime)
    if step is None:
        return []
    result = []
    month0 = start.year * 12 + (start.month - 1) // step * step
    while True:
        year, month = divmod(month0, 12)
        first = date(year, month + 1, 1)
        if first > end:
            return result
        last_month = month0 + step - 1
        ly, lm = divmod(last_month, 12)
        last = date(ly, lm + 1, calendar.monthrange(ly, lm + 1)[1])
        result.append((max(first, start), min(last, end)))
        month0 += step


def due_date(period_end: date) -> date:
    """The 20th of the month after the period's end."""
    year, month = (period_end.year + 1, 1) if period_end.month == 12 else (period_end.year, period_end.month + 1)
    return date(year, month, 20)


def status(period_end: date, filed_on: date | None, today: date) -> Literal["current", "to_file", "filed"]:
    if filed_on is not None:
        return "filed"
    return "current" if today <= period_end else "to_file"


def summarize(lines: list[VatLine]) -> VatSummary:
    sales = [line for line in lines if line.side == "sale"]
    purchases = [line for line in lines if line.side == "purchase"]
    sales_vat = sum((line.vat for line in sales), _ZERO)
    recovered = sum((line.recovered for line in purchases), _ZERO)
    return VatSummary(
        sum((line.net for line in sales), _ZERO),
        sales_vat,
        sum((line.net for line in purchases), _ZERO),
        recovered,
        sales_vat - recovered,
    )
