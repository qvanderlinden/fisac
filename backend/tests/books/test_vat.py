from datetime import date
from decimal import Decimal

from fisac.books import vat
from fisac.models import VatRegime

Y = (date(2026, 1, 1), date(2026, 12, 31))


def test_quarters():
    assert vat.periods(*Y, VatRegime.QUARTERLY) == [
        (date(2026, 1, 1), date(2026, 3, 31)),
        (date(2026, 4, 1), date(2026, 6, 30)),
        (date(2026, 7, 1), date(2026, 9, 30)),
        (date(2026, 10, 1), date(2026, 12, 31)),
    ]


def test_months():
    months = vat.periods(*Y, VatRegime.MONTHLY)
    assert len(months) == 12 and months[1] == (date(2026, 2, 1), date(2026, 2, 28))


def test_no_periods_without_vat():
    assert vat.periods(*Y, VatRegime.FRANCHISE) == []
    assert vat.periods(*Y, VatRegime.NONE) == []


def test_periods_clipped_to_a_mid_year_fiscal_year():
    got = vat.periods(date(2026, 3, 20), date(2027, 3, 19), VatRegime.QUARTERLY)
    assert got[0] == (date(2026, 3, 20), date(2026, 3, 31))
    assert got[-1] == (date(2027, 1, 1), date(2027, 3, 19))
    assert len(got) == 5


def test_due_date():
    assert vat.due_date(date(2026, 12, 31)) == date(2027, 1, 20)
    assert vat.due_date(date(2026, 3, 31)) == date(2026, 4, 20)


def test_status():
    end = date(2026, 3, 31)
    assert vat.status(end, None, date(2026, 3, 31)) == "current"
    assert vat.status(end, None, date(2026, 4, 1)) == "to_file"
    assert vat.status(end, date(2026, 4, 10), date(2026, 5, 1)) == "filed"
    assert vat.status(end, date(2026, 4, 10), date(2026, 3, 1)) == "filed"


def test_summarize():
    d = date(2026, 2, 1)
    s = vat.summarize([
        vat.VatLine(d, Decimal("1000.00"), Decimal("210.00"), Decimal("0.00"), "sale"),
        vat.VatLine(d, Decimal("100.00"), Decimal("21.00"), Decimal("21.00"), "purchase"),
    ])
    assert (s.sales_net, s.sales_vat) == (Decimal("1000.00"), Decimal("210.00"))
    assert (s.purchases_net, s.purchases_vat_recovered) == (Decimal("100.00"), Decimal("21.00"))
    assert s.balance == Decimal("189.00")
