from datetime import date
from decimal import Decimal

from fisac.books.depreciation import fiscal_year_of, schedule
from fisac.models import DepreciationFirstYear, DepreciationMethod

LINEAR = DepreciationMethod.LINEAR
PRORATA = DepreciationFirstYear.PRORATA
FULL = DepreciationFirstYear.FULL


def amounts(rows):
    return [str(a) for _, a in rows]


def test_linear_prorata_calendar():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 3, LINEAR, PRORATA, 1)
    assert [y for y, _ in rows] == [2026, 2027, 2028, 2029]
    assert amounts(rows) == ["168.04", "333.33", "333.33", "165.30"]


def test_linear_full():
    assert amounts(schedule(Decimal("1000"), date(2026, 7, 1), 3, LINEAR, FULL, 1)) == ["333.33", "333.33", "333.34"]


def test_declining():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 5, DepreciationMethod.DECLINING, PRORATA, 1)
    assert amounts(rows)[:2] == ["201.64", "319.34"]
    assert sum(a for _, a in rows) == Decimal("1000.00")


def test_fiscal_year_from_july():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 3, LINEAR, PRORATA, 7)
    assert [y for y, _ in rows] == [2027, 2028, 2029]
    assert amounts(rows) == ["333.33", "333.33", "333.34"]


def test_fiscal_year_of():
    assert fiscal_year_of(date(2026, 3, 1), 7) == (date(2025, 7, 1), date(2026, 6, 30))


def test_no_years_no_rows():
    assert schedule(Decimal("1000"), date(2026, 7, 1), 0, LINEAR, FULL, 1) == []
