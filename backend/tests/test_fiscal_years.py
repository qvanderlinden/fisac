import asyncio
from datetime import date, timedelta
from decimal import Decimal

import pytest

from fisac.fiscal_years import next_period
from fisac.models import EquityLine


@pytest.mark.parametrize(
    "month, latest, today, expected",
    [
        (1, None, date(2026, 10, 23), (date(2026, 1, 1), date(2026, 12, 31))),
        (7, None, date(2026, 3, 1), (date(2025, 7, 1), date(2026, 6, 30))),
        (7, None, date(2026, 7, 1), (date(2026, 7, 1), date(2027, 6, 30))),
        (1, date(2026, 12, 31), date(2026, 10, 23), (date(2027, 1, 1), date(2027, 12, 31))),
        (3, date(2027, 2, 28), date(2026, 10, 23), (date(2027, 3, 1), date(2028, 2, 29))),
    ],
)
def test_next_period(month, latest, today, expected):
    assert next_period(month, latest, today) == expected


async def test_two_posts_open_consecutive_years(client):
    first = (await client.post("/api/fiscal-years")).json()
    second = (await client.post("/api/fiscal-years")).json()
    assert date.fromisoformat(second["start_date"]) == date.fromisoformat(
        first["end_date"]
    ) + timedelta(days=1)
    ids = [y["id"] for y in (await client.get("/api/fiscal-years")).json()]
    assert ids == [second["id"], first["id"]]


async def test_concurrent_posts_open_consecutive_years(client):
    await client.get("/api/company")  # the company row exists before the race
    responses = await asyncio.gather(*(client.post("/api/fiscal-years") for _ in range(4)))
    assert [r.status_code for r in responses] == [201] * 4
    years = sorted(
        ((date.fromisoformat(r.json()["start_date"]), date.fromisoformat(r.json()["end_date"]))
         for r in responses)
    )
    assert len(set(years)) == 4
    for (_, end), (start, _) in zip(years, years[1:]):
        assert start == end + timedelta(days=1)


async def test_next_matches_post(client):
    nxt = (await client.get("/api/fiscal-years/next")).json()
    made = (await client.post("/api/fiscal-years")).json()
    assert (made["start_date"], made["end_date"]) == (nxt["start_date"], nxt["end_date"])


async def test_patch_isoc_conditions_not_dates(client):
    y = (await client.post("/api/fiscal-years")).json()
    res = await client.patch(f"/api/fiscal-years/{y['id']}", json={"isoc_small_company": False})
    assert res.json()["isoc_small_company"] is False
    res = await client.patch(f"/api/fiscal-years/{y['id']}", json={"start_date": "2020-01-01"})
    assert res.status_code == 422


async def test_patch_state_and_unknown_year(client):
    y = (await client.post("/api/fiscal-years")).json()
    assert y["state"] == "open"
    res = await client.patch(f"/api/fiscal-years/{y['id']}", json={"state": "closed"})
    assert res.json()["state"] == "closed"
    assert (await client.patch("/api/fiscal-years/999", json={"state": "closed"})).status_code == 404
    assert (await client.get("/api/fiscal-years/999/equity-lines")).status_code == 404


async def test_equity_lines(client, session):
    y = (await client.post("/api/fiscal-years")).json()
    session.add_all(
        [
            EquityLine(fiscal_year_id=y["id"], label="Perte reportée",
                       amount=Decimal("-33428.16"), sort_key="a1"),
            EquityLine(fiscal_year_id=y["id"], label="Réserve", amount=Decimal("10"), sort_key="a0"),
        ]
    )
    await session.commit()
    lines = (await client.get(f"/api/fiscal-years/{y['id']}/equity-lines")).json()
    assert [(l["label"], l["amount"]) for l in lines] == [
        ("Réserve", "10.00"),
        ("Perte reportée", "-33428.16"),
    ]
