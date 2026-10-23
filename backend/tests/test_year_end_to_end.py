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


async def test_a_fiscal_year_end_to_end(client):
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

    result = (await client.get(f"/api/fiscal-years/{fy}/result")).json()
    assert result["revenue"]["total"] == "900.00"
    assert result["charges"]["total"] == "162.00"
    assert Decimal(result["depreciation"]["total"]) == depreciation
    assert [a["reference"] for a in result["depreciation"]["by_asset"]] == ["I-001"]
    assert Decimal(result["result"]) == Decimal("738.00") - depreciation
    assert [p["reference"] for p in result["revenue"]["by_category"][0]["pieces"]] == ["S-0001", "S-0002"]
    # the taken-over line is not a charge
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


async def test_result_unknown_year(client):
    assert (await client.get("/api/fiscal-years/999/result")).status_code == 404
