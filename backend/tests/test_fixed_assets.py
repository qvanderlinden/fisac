from datetime import date
from decimal import Decimal

import pytest
from conftest import add_purchase_line

from fisac import register
from fisac.books.depreciation import schedule
from fisac.models import DepreciationFirstYear, DepreciationMethod


async def _asset(client, line, **kw):
    body = {"purchase_line_id": line.id, "description": "Portable", "depreciation_model_id": 1, **kw}
    response = await client.post("/api/fixed-assets", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_from_line(client, session):
    line = await add_purchase_line(session, unit_price=1500, vat_scheme_id=4)
    a = await _asset(client, line)
    assert (a["number"], a["value"], a["acquired_on"]) == (1, "1500.00", "2026-03-01")
    assert sum(Decimal(r["amount"]) for r in a["schedule"]) == Decimal("1500.00")
    assert not any(r["edited"] for r in a["schedule"])
    second = await add_purchase_line(session, unit_price=10, purchase={"number": 2})
    assert (await _asset(client, second))["number"] == 2


async def test_line_taken_once(client, session):
    line = await add_purchase_line(session)
    await _asset(client, line)
    r = await client.post(
        "/api/fixed-assets",
        json={"purchase_line_id": line.id, "description": "", "depreciation_model_id": 1},
    )
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "purchase_line_id"]


async def test_credit_note_line_refused(client, session):
    line = await add_purchase_line(session, purchase={"kind": "credit_note"})
    r = await client.post(
        "/api/fixed-assets",
        json={"purchase_line_id": line.id, "description": "", "depreciation_model_id": 1},
    )
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "purchase_line_id"]


async def test_edit_then_price_change(client, session):
    line = await add_purchase_line(session, unit_price=1500, vat_scheme_id=4)
    a = await _asset(client, line)
    r = await client.put(f"/api/fixed-assets/{a['id']}/depreciations/2027", json={"amount": "400"})
    assert r.status_code == 200
    r = await client.patch(f"/api/purchase-lines/{line.id}", json={"unit_price": "3000"})
    assert r.status_code == 200
    got = (await client.get(f"/api/fixed-assets/{a['id']}")).json()
    rows = {row["year"]: row for row in got["schedule"]}
    assert (rows[2027]["amount"], rows[2027]["edited"]) == ("400.00", True)
    assert got["value"] == "3000.00"
    expected = dict(schedule(Decimal("3000.00"), date(2026, 3, 1), 3, DepreciationMethod.LINEAR, DepreciationFirstYear.PRORATA, 1))
    for year, row in rows.items():
        if year != 2027:
            assert Decimal(row["amount"]) == expected[year]


async def test_recompute_resets(client, session):
    line = await add_purchase_line(session, unit_price=1500, vat_scheme_id=4)
    a = await _asset(client, line)
    await client.put(f"/api/fixed-assets/{a['id']}/depreciations/2027", json={"amount": "400"})
    got = (await client.post(f"/api/fixed-assets/{a['id']}/recompute")).json()
    assert not any(r["edited"] for r in got["schedule"])
    expected = schedule(Decimal(got["value"]), date(2026, 3, 1), 3, DepreciationMethod.LINEAR, DepreciationFirstYear.PRORATA, 1)
    assert [(r["year"], Decimal(r["amount"])) for r in got["schedule"]] == expected


async def _stored(client, asset_id):
    got = (await client.get(f"/api/fixed-assets/{asset_id}")).json()
    return got, [(r["year"], Decimal(r["amount"])) for r in got["schedule"]]


async def test_date_and_model_change_refresh(client, session):
    line = await add_purchase_line(session, unit_price=1000, vat_scheme_id=4)
    a = await _asset(client, line)
    models = {m["id"]: m for m in (await client.get("/api/depreciation-models")).json()}
    other = next(i for i, m in models.items() if i != 1 and m["years"] != models[1]["years"])

    def expected(model_id, day):
        m = models[model_id]
        return schedule(Decimal("1000.00"), day, m["years"], DepreciationMethod(m["method"]), DepreciationFirstYear(m["first_year"]), 1)

    r = await client.patch(f"/api/fixed-assets/{a['id']}", json={"depreciation_model_id": other, "description": "Autre"})
    assert r.status_code == 200
    got, rows = await _stored(client, a["id"])
    assert (got["depreciation_model_id"], got["description"]) == (other, "Autre")
    assert rows == expected(other, date(2026, 3, 1)) != expected(1, date(2026, 3, 1))

    r = await client.patch(f"/api/purchases/{line.purchase_id}", json={"document_date": "2026-07-01"})
    assert r.status_code == 200
    got, rows = await _stored(client, a["id"])
    assert got["acquired_on"] == "2026-07-01"
    assert rows == expected(other, date(2026, 7, 1)) != expected(other, date(2026, 3, 1))


async def test_refresh_is_atomic_with_the_edit(client, session, monkeypatch):
    line = await add_purchase_line(session, unit_price=1000, vat_scheme_id=4)
    a = await _asset(client, line)

    async def boom(*args, **kwargs):
        raise RuntimeError("refresh failed")

    monkeypatch.setattr(register, "refresh_schedule", boom)
    with pytest.raises(RuntimeError):
        await client.patch(f"/api/purchase-lines/{line.id}", json={"unit_price": "3000"})
    monkeypatch.undo()
    got = (await client.get(f"/api/purchases/{line.purchase_id}")).json()
    assert got["lines"][0]["unit_price"] == "1000.00"
    assert (await client.get(f"/api/fixed-assets/{a['id']}")).json()["value"] == "1000.00"


async def test_line_lock(client, session):
    line = await add_purchase_line(session)
    await _asset(client, line)
    for url in (f"/api/purchase-lines/{line.id}", f"/api/purchases/{line.purchase_id}"):
        r = await client.delete(url)
        assert r.status_code == 409
        assert r.json()["detail"] == "Reprise par l'immobilisation I-001"
        assert r.json()["code"] == "in_use"
    r = await client.patch(f"/api/purchases/{line.purchase_id}", json={"kind": "credit_note"})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "kind"]
    got = (await client.get(f"/api/purchases/{line.purchase_id}")).json()
    assert got["lines"][0]["fixed_asset_number"] == 1
    # deleting the asset frees the line
    assert (await client.delete("/api/fixed-assets/1")).status_code == 204
    assert (await client.delete(f"/api/purchases/{line.purchase_id}")).status_code == 204


async def test_register_for_year(client, session):
    line = await add_purchase_line(session, unit_price=1500, vat_scheme_id=4)
    a = await _asset(client, line)
    fy = (await client.get("/api/fiscal-years")).json()[0]["id"]
    rows = (await client.get(f"/api/fiscal-years/{fy}/fixed-assets")).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["depreciated_before"] == "0.00"
    assert row["depreciation"] == next(r["amount"] for r in a["schedule"] if r["year"] == 2026)
    assert Decimal(row["remaining"]) == Decimal("1500.00") - Decimal(row["depreciation"])
    assert (row["status"], row["schedule_balanced"]) == ("in_service", True)
