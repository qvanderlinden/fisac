from datetime import date
from decimal import Decimal

from fisac.books.isoc import DisallowedLine, Prepayment, attribute, compute, disallowed_part, is_exempt
from fisac.books.isoc_params import due_dates, params_for
from fisac.models import IsocRubric

due = due_dates(date(2026, 1, 1))
P, _ = params_for(2027)
OK = (True, True, True)


def test_disallowed_restaurant():
    assert disallowed_part(Decimal("112.00"), Decimal("69")) == Decimal("34.72")


def test_car_asset_depreciation():
    assert disallowed_part(Decimal("1000.00"), Decimal("75")) == Decimal("250.00")


def test_reduced_bracket():
    r = compute(Decimal("120000"), [], OK, [], due, P, False)
    assert (r.tax_reduced, r.tax_normal, r.tax) == (
        Decimal("20000.00"),
        Decimal("5000.00"),
        Decimal("25000.00"),
    )
    assert r.reduced is True


def test_normal_rate_when_a_condition_fails():
    r = compute(Decimal("120000"), [], (True, False, True), [], due, P, False)
    assert r.tax == Decimal("30000.00")
    assert r.reduced is False


def test_majoration_without_va():
    assert compute(Decimal("50000"), [], OK, [], due, P, False).majoration == Decimal("675.00")


def test_va1_on_time():
    r = compute(
        Decimal("50000"), [], OK, [Prepayment(1, Decimal("2000"), True, date(2026, 4, 1))], due, P, False
    )
    assert (r.majoration, r.balance) == (Decimal("495.00"), Decimal("8495.00"))


def test_late_va_moves_to_next_quarter():
    r = compute(
        Decimal("50000"), [], OK, [Prepayment(1, Decimal("2000"), True, date(2026, 4, 15))], due, P, False
    )
    assert r.majoration == Decimal("525.00")


def test_va_after_last_due_earns_nothing():
    r = compute(
        Decimal("50000"), [], OK, [Prepayment(4, Decimal("2000"), True, date(2026, 12, 28))], due, P, False
    )
    assert (r.majoration, r.balance) == (Decimal("675.00"), Decimal("8675.00"))


def test_unpaid_va_counts_for_nothing():
    r = compute(Decimal("50000"), [], OK, [Prepayment(1, Decimal("2000"), False, None)], due, P, False)
    assert (r.majoration, r.paid_total) == (Decimal("675.00"), Decimal("0.00"))


def test_below_threshold():
    assert compute(Decimal("5000"), [], OK, [], due, P, False).majoration == Decimal("0.00")


def test_exempt():
    assert compute(Decimal("50000"), [], OK, [], due, P, True).majoration == Decimal("0.00")


def test_is_exempt():
    assert is_exempt(True, date(2025, 3, 1), date(2026, 1, 1), 1) is True
    assert is_exempt(True, date(2022, 3, 1), date(2026, 1, 1), 1) is False
    assert is_exempt(False, date(2025, 3, 1), date(2026, 1, 1), 1) is False
    assert is_exempt(True, None, date(2026, 1, 1), 1) is False


def test_is_exempt_third_year_and_broken_year():
    assert is_exempt(True, date(2024, 6, 1), date(2026, 1, 1), 1) is True
    assert is_exempt(True, date(2023, 12, 31), date(2026, 1, 1), 1) is False
    # start_month 7: 2025-03-01 lies in the year starting 2024-07-01 (years 1-3 start 2024, 2025, 2026)
    assert is_exempt(True, date(2025, 3, 1), date(2026, 7, 1), 7) is True
    assert is_exempt(True, date(2025, 3, 1), date(2025, 7, 1), 7) is True
    assert is_exempt(True, date(2025, 3, 1), date(2027, 7, 1), 7) is False


def test_loss():
    r = compute(
        Decimal("-500"), [], OK, [Prepayment(1, Decimal("100"), True, date(2026, 4, 1))], due, P, False
    )
    assert (r.taxable_base, r.tax, r.majoration, r.balance) == (
        Decimal("0.00"),
        Decimal("0.00"),
        Decimal("0.00"),
        Decimal("-100.00"),
    )


def _line(base: str) -> DisallowedLine:
    b = Decimal(base)
    return DisallowedLine(
        IsocRubric.RESTAURANT, "F1", date(2026, 3, 1), "Restaurant", b, Decimal("69"), disallowed_part(b, Decimal("69"))
    )


def test_credit_note_lowers_disallowed():
    r = compute(Decimal("1000"), [_line("112.00"), _line("-112.00")], OK, [], due, P, False)
    assert r.disallowed_total == Decimal("0.00")
    assert r.disallowed_by_rubric[IsocRubric.RESTAURANT] == Decimal("0.00")


def test_disallowed_adds_to_base():
    r = compute(Decimal("1000"), [_line("112.00")], OK, [], due, P, False)
    assert r.disallowed_total == Decimal("34.72")
    assert r.taxable_base == Decimal("1034.72")
    assert r.disallowed_by_rubric[IsocRubric.CAR] == Decimal("0.00")


def test_after_tax():
    r = compute(Decimal("50000"), [], OK, [], due, P, False)
    assert (r.estimated_tax, r.after_tax) == (Decimal("10675.00"), Decimal("39325.00"))


def test_attribute_each_prepayment():
    assert attribute(Prepayment(1, Decimal("1000"), True, date(2026, 4, 10)), due, P) == (
        1, Decimal("9"), Decimal("90.00"))
    assert attribute(Prepayment(3, Decimal("1000"), True, date(2026, 10, 13)), due, P) == (
        4, Decimal("4.5"), Decimal("45.00"))
    assert attribute(Prepayment(4, Decimal("1000"), True, date(2026, 12, 22)), due, P) == (
        None, None, Decimal("0.00"))
    assert attribute(Prepayment(2, Decimal("1000"), False, None), due, P) == (None, None, Decimal("0.00"))
