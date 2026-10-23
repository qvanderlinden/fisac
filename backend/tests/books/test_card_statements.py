from datetime import date

from fisac.books.card_statements import Statement, statement_for


def test_statement_open_today():
    assert statement_for(date(2026, 10, 22), 25, 5) == Statement(date(2026, 9, 26), date(2026, 10, 25), date(2026, 11, 5))


def test_after_closing_goes_to_next():
    assert statement_for(date(2026, 10, 26), 25, 5).end == date(2026, 11, 25)


def test_february_closing_31():
    assert statement_for(date(2027, 2, 10), 31, 5) == Statement(date(2027, 2, 1), date(2027, 2, 28), date(2027, 3, 5))


def test_december_rolls_year():
    assert statement_for(date(2026, 12, 28), 25, 5).payment == date(2027, 2, 5)
