"""Belgian corporate tax (ISOC) legal parameters, per assessment year.

The assessment year (exercice d'imposition) is the calendar year after the fiscal
year's end. Rates are percentages.

Sources consulted: Pyxis "VAI exercice d'imposition 2027", Grant Thornton on the
majoration for insufficient advance payments, Argenta, StarterPass, myfid, and the
SPF Finances circular on the 0.5 % / EUR 80 threshold. The sources disagree on the
uplift of the base of the majoration and on the threshold; the values below follow
the 6.75 % of the tax and the "0.5 % of the tax or EUR 80, whichever is higher" rule.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal


@dataclass(frozen=True)
class Params:
    assessment_year: int
    reduced_rate: Decimal
    reduced_ceiling: Decimal
    normal_rate: Decimal
    majoration_rate: Decimal
    bonifications: tuple[Decimal, Decimal, Decimal, Decimal]
    threshold_rate: Decimal
    threshold_min: Decimal


_PARAMS: dict[int, Params] = {
    2027: Params(
        assessment_year=2027,
        reduced_rate=Decimal("20"),
        reduced_ceiling=Decimal("100000"),
        normal_rate=Decimal("25"),
        majoration_rate=Decimal("6.75"),
        bonifications=(Decimal("9"), Decimal("7.5"), Decimal("6"), Decimal("4.5")),
        threshold_rate=Decimal("0.5"),
        threshold_min=Decimal("80"),
    ),
}


def params_for(assessment_year: int) -> tuple[Params, bool]:
    """The parameters of the year, or of the latest known one (`True`: fallback)."""
    if assessment_year in _PARAMS:
        return _PARAMS[assessment_year], False
    return _PARAMS[max(_PARAMS)], True


def _add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def _next_monday_if_weekend(day: date) -> date:
    return day + timedelta(days=(7 - day.weekday()) % 7) if day.weekday() >= 5 else day


def due_dates(fy_start: date) -> list[date]:
    """The 10th of the 4th, 7th and 10th month and the 20th of the 12th month of the
    fiscal year, moved to the next Monday when on a weekend."""
    out = []
    for offset, dom in ((3, 10), (6, 10), (9, 10), (11, 20)):
        first = _add_months(fy_start.replace(day=1), offset)
        assert dom <= calendar.monthrange(first.year, first.month)[1]
        out.append(_next_monday_if_weekend(first.replace(day=dom)))
    return out
