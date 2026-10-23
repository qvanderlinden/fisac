"""A fiscal year through the API only: pieces, register, journals, VAT and result."""

from datetime import date
from decimal import Decimal

import pytest

from fisac import fiscal_years, pieces

TRANSFER = 1  # the seeded bank transfer, on BQ


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    for module in (pieces, fiscal_years):
        monkeypatch.setattr(module, "today", lambda: date(2026, 10, 23))


async def _find(client, path, label, key="label"):
    rows = (await client.get(path)).json()
    return next(r["id"] for r in rows if r[key] == label)


async def _post(client, path, body):
    r = await client.post(path, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


async def _piece(client, path, kind, day, method, line, paid_on=None, paid=True):
    piece = await _post(client, path, {
        "kind": kind, "document_date": day, "payment_method_id": method,
        "payment_date": paid_on or day, "paid": paid,
    })
    category, scheme, price = line
    return await _post(client, f"{path}/{piece['id']}/lines", {
        "unit_price": price, "category_id": category, "vat_scheme_id": scheme,
    })


async def _year(client):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]
    sales21 = await _find(client, "/api/vat-schemes", "Ventes 21 %")
    buy21 = await _find(client, "/api/vat-schemes", "Achats 21 % · récupérable")
    buy12 = await _find(client, "/api/vat-schemes", "Achats 12 % · non récupérable")
    services = await _find(client, "/api/categories", "Prestations de services")
    equipment = await _find(client, "/api/categories", "Petit matériel")
    restaurant = await _find(client, "/api/categories", "Restaurant")
    laptop_model = await _find(client, "/api/depreciation-models", "Informatique · 3 ans")
    card = (await _post(client, "/api/payment-methods", {
        "name": "Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5,
    }))["id"]

    await _piece(client, "/api/sales", "invoice", "2026-02-10", TRANSFER, (services, sales21, "1000"), "2026-03-01")
    await _piece(client, "/api/sales", "credit_note", "2026-04-15", TRANSFER, (services, sales21, "100"), "2026-04-20")
    a1 = await _piece(client, "/api/purchases", "invoice", "2026-03-05", TRANSFER, (equipment, buy21, "1500"), "2026-03-20")
    await _piece(client, "/api/purchases", "invoice", "2026-05-10", TRANSFER, (restaurant, buy12, "100"))
    await _piece(client, "/api/purchases", "invoice", "2026-10-22", card, (equipment, buy21, "50"))

    asset = await _post(client, "/api/fixed-assets", {
        "purchase_line_id": a1["lines"][0]["id"], "description": "Portable", "depreciation_model_id": laptop_model,
    })
    row = next(r for r in asset["schedule"] if r["year"] == 2026)
    depreciation = Decimal(row["amount"])
    assert depreciation > 0

    return {
        "fy": fy, "asset": asset, "sales": (services, sales21), "card": card,
        "depreciation": depreciation,
    }


async def test_a_fiscal_year_end_to_end(client):
    year = await _year(client)
    fy, depreciation = year["fy"], year["depreciation"]
    result = (await client.get(f"/api/fiscal-years/{fy}/result")).json()
    assert result["revenue"]["total"] == "900.00"
    assert result["charges"]["total"] == "162.00"
    assert Decimal(result["depreciation"]["total"]) == depreciation
    assert [a["reference"] for a in result["depreciation"]["by_asset"]] == ["I-001"]
    assert Decimal(result["result"]) == Decimal("738.00") - depreciation
    assert [p["reference"] for p in result["revenue"]["by_category"][0]["pieces"]] == ["S-0001", "S-0002"]
    # the taken-over line is not a charge
    assert [p["amount"] for p in result["revenue"]["by_category"][0]["pieces"]] == ["1000.00", "-100.00"]
    assert [c["label"] for c in result["charges"]["by_category"]] == ["Petit matériel", "Restaurant"]
    assert result["charges"]["by_category"][0]["total"] == "50.00"

    vat = (await client.get(f"/api/fiscal-years/{fy}/vat-periods")).json()["periods"]
    assert [vat[0]["balance"], vat[1]["balance"], vat[3]["balance"]] == ["-105.00", "-21.00", "-10.50"]

    journals = (await client.get(f"/api/fiscal-years/{fy}/journals")).json()
    bank = next(j for j in journals if j["account"]["code"] == "BQ")
    assert [m["amount"] for m in bank["movements"]] == ["1210.00", "-1815.00", "-121.00", "-112.00", "-60.50"]
    last = bank["movements"][-1]
    assert last["kind"] == "card_statement" and last["planned"] and last["date"] == "2026-11-05"
    assert bank["closing"] == "-898.50"
    visa = next(j for j in journals if j["account"]["kind"] == "card")
    assert [m["amount"] for m in visa["movements"]] == ["-60.50", "60.50"]
    assert visa["closing"] == "0.00"


async def test_edited_depreciation_row_is_what_counts(client):
    year = await _year(client)
    r = await client.put(f"/api/fixed-assets/{year['asset']['id']}/depreciations/2026", json={"amount": "400.00"})
    assert r.status_code == 200, r.text
    result = (await client.get(f"/api/fiscal-years/{year['fy']}/result")).json()
    assert result["depreciation"]["total"] == "400.00"
    assert result["depreciation"]["by_asset"][0]["amount"] == "400.00"
    assert result["result"] == "338.00"


async def test_pieces_count_in_the_year_of_their_booking_date(client):
    year = await _year(client)
    fy26 = year["fy"]
    fy27 = (await _post(client, "/api/fiscal-years", {}))["id"]
    services, sales21 = year["sales"]
    await _piece(client, "/api/sales", "invoice", "2027-02-01", TRANSFER, (services, sales21, "500"), "2027-02-10")
    # a sale documented in 2026 but booked in 2027 leaves the 2026 result
    late = await _piece(client, "/api/sales", "invoice", "2026-12-20", TRANSFER, (services, sales21, "300"), "2026-12-30")
    await client.patch(f"/api/sales/{late['id']}", json={"booking_date": "2027-01-05"})
    r26 = (await client.get(f"/api/fiscal-years/{fy26}/result")).json()
    assert r26["revenue"]["total"] == "900.00"
    r27 = (await client.get(f"/api/fiscal-years/{fy27}/result")).json()
    assert r27["revenue"]["total"] == "800.00"
    assert r27["result"] == str(Decimal("800.00") - Decimal(r27["depreciation"]["total"]))


async def test_result_unknown_year(client):
    assert (await client.get("/api/fiscal-years/999/result")).status_code == 404
    assert "detail" in (await client.get("/api/fiscal-years/999/result")).json()
