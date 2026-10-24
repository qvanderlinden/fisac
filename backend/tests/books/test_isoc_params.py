from datetime import date

from fisac.books.isoc_params import assessment_year, due_dates, params_for


def test_due_dates_2026():
    assert due_dates(date(2026, 1, 1)) == [
        date(2026, 4, 10),
        date(2026, 7, 10),
        date(2026, 10, 12),
        date(2026, 12, 21),
    ]


def test_due_dates_broken_fiscal_year():
    # starts 1 July 2026: 10 Oct, 10 Jan, 10 Apr, 20 June (12th month)
    assert due_dates(date(2026, 7, 1)) == [
        date(2026, 10, 12),
        date(2027, 1, 11),
        date(2027, 4, 12),
        date(2027, 6, 21),
    ]


def test_fallback():
    assert params_for(2031)[1] is True
    assert params_for(2027)[1] is False


def test_params_2027():
    p, _ = params_for(2027)
    assert p.assessment_year == 2027
    assert p.bonifications[0] > p.bonifications[3]


def test_assessment_year():
    # closed between 31/12/N-1 and 30/12/N: assessment year N
    assert assessment_year(date(2026, 12, 31)) == 2027
    assert assessment_year(date(2026, 6, 30)) == 2026
    assert assessment_year(date(2026, 12, 30)) == 2026
    assert assessment_year(date(2025, 12, 31)) == 2026
