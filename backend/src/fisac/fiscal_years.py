"""Which period the next fiscal year covers."""

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


def today() -> date:
    return date.today()


def next_period(start_month: int, latest_end: date | None, today: date) -> tuple[date, date]:
    """The (start, end) of the year a POST would open.

    After a year it is the day after that year's end. For the very first year
    it is the 1st of `start_month` in `today`'s year, or the year before when
    that date is still ahead of `today`.
    """
    if latest_end is not None:
        start = latest_end + timedelta(days=1)
    else:
        start = date(today.year, start_month, 1)
        if start > today:
            start = date(today.year - 1, start_month, 1)
    return start, start + relativedelta(years=1) - timedelta(days=1)
