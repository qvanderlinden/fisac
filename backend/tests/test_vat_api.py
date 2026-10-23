from datetime import date

from conftest import add_purchase_line, add_sale

from fisac import pieces
from fisac.models import SaleLine


async def _year(client):
    return (await client.get("/api/fiscal-years")).json()[0]["id"]


async def _setup(session):
    sale = await add_sale(session, document_date=date(2026, 2, 10))
    session.add(SaleLine(sale_id=sale.id, unit_price=1000, category_id=1, vat_scheme_id=4, sort_key="a0"))
    await session.commit()
    await add_purchase_line(
        session, unit_price=100, purchase={"document_date": date(2026, 2, 12), "booking_date": date(2026, 4, 2)}
    )


async def test_quarters_with_balance_and_pieces(client, session, monkeypatch):
    monkeypatch.setattr(pieces, "today", lambda: date(2026, 5, 1))
    await _setup(session)
    fy = await _year(client)
    r = await client.get(f"/api/fiscal-years/{fy}/vat-periods")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["regime"] == "quarterly" and len(body["periods"]) == 4
    q1, q2 = body["periods"][:2]
    assert q1["sales_net"] == "1000.00" and q1["sales_vat"] == "210.00"
    assert q1["purchases_net"] == "0.00" and q1["balance"] == "210.00"
    assert q1["due"] == "2026-04-20" and q1["status"] == "to_file"
    assert q1["pieces"][0]["number"] == "S-0001"
    # the purchase is booked in Q2 although its document is dated in Q1
    assert q2["purchases_net"] == "100.00" and q2["purchases_vat_recovered"] == "21.00"
    assert q2["balance"] == "-21.00" and q2["status"] == "current"
    assert q2["pieces"][0]["number"] == "A-0001" and q2["pieces"][0]["recovered"] == "21.00"


async def test_credit_note_is_signed_once(client, session):
    await add_purchase_line(session, unit_price=100, purchase={"kind": "credit_note"})
    fy = await _year(client)
    q1 = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()["periods"][0]
    assert q1["purchases_net"] == "-100.00" and q1["balance"] == "21.00"
    assert q1["pieces"][0]["net"] == "-100.00"


async def test_patch_filed_on(client, session):
    await _setup(session)
    fy = await _year(client)
    q1 = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()["periods"][0]
    r = await client.patch(f"/api/vat-periods/{q1['id']}", json={"filed_on": "2026-04-15"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "filed" and r.json()["filed_on"] == "2026-04-15"
    r = await client.patch(f"/api/vat-periods/{q1['id']}", json={"filed_on": None})
    assert r.json()["status"] != "filed"
    assert (await client.patch("/api/vat-periods/999", json={"filed_on": None})).status_code == 404


async def test_monthly_regime_and_stale_rows(client, session):
    await add_sale(session)  # creates fiscal year 2026
    fy = await _year(client)
    first = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()["periods"]
    await client.patch(f"/api/vat-periods/{first[0]['id']}", json={"filed_on": "2026-04-15"})
    assert (await client.patch("/api/company", json={"vat_regime": "monthly"})).status_code == 200
    body = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()
    assert body["regime"] == "monthly" and len(body["periods"]) == 12
    assert body["periods"][0]["end"] == "2026-01-31" and body["periods"][0]["filed_on"] is None
    # the quarter rows starting like a month became that month, unfiled
    assert body["periods"][3]["id"] == first[1]["id"]
    months = {p["id"]: p for p in body["periods"]}
    # back to quarters: the February row starts no quarter, it stays but is not read
    await client.patch("/api/company", json={"vat_regime": "quarterly"})
    back = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()["periods"]
    assert len(back) == 4 and back[0]["end"] == "2026-03-31" and back[0]["id"] == first[0]["id"]
    february = next(p for p in months.values() if p["start"] == "2026-02-01")
    assert (await client.patch(f"/api/vat-periods/{february['id']}", json={"filed_on": None})).status_code == 404


async def test_franchise_has_no_periods(client, session):
    await add_sale(session)
    fy = await _year(client)
    await client.patch("/api/company", json={"vat_regime": "franchise"})
    assert (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json() == {
        "regime": "franchise", "periods": [],
    }
    assert (await client.get("/api/fiscal-years/999/vat-periods")).status_code == 404
