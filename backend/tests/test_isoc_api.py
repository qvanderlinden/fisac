"""The ISOC read and the result after tax, through the API only."""

from datetime import date

import pytest
from sqlalchemy import delete, func, select

from fisac import fiscal_years, pieces
from fisac.models import IsocPrepayment, PaymentMethod, PaymentMethodType

TRANSFER = 1  # the seeded bank transfer, on BQ


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    for module in (pieces, fiscal_years):
        monkeypatch.setattr(module, "today", lambda: date(2026, 10, 24))


async def _find(client, path, label):
    return next(r["id"] for r in (await client.get(path)).json() if r["label"] == label)


async def _post(client, path, body):
    r = await client.post(path, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


async def _patch(client, path, body):
    r = await client.patch(path, json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def _piece(client, path, day, line):
    piece = await _post(client, path, {
        "kind": "invoice", "document_date": day, "payment_method_id": TRANSFER, "payment_date": day,
    })
    return await _post(client, f"{path}/{piece['id']}/lines", line)


async def _year(client):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]
    await _piece(client, "/api/sales", "2026-03-01", {
        "unit_price": "100000",
        "category_id": await _find(client, "/api/categories", "Prestations de services"),
        "vat_scheme_id": await _find(client, "/api/vat-schemes", "Ventes 21 %"),
    })
    await _piece(client, "/api/purchases", "2026-05-10", {
        "unit_price": "1000",
        "category_id": await _find(client, "/api/categories", "Restaurant"),
        "vat_scheme_id": await _find(client, "/api/vat-schemes", "Achats 12 % · non récupérable"),
        "isoc_scheme_id": await _find(client, "/api/isoc-schemes", "69 % · restaurant"),
    })
    vas = (await client.get(f"/api/fiscal-years/{fy}/isoc-prepayments")).json()
    await _patch(client, f"/api/isoc-prepayments/{vas[0]['id']}",
                 {"amount": "5000", "paid": True, "payment_date": "2026-04-01"})
    await _patch(client, f"/api/isoc-prepayments/{vas[2]['id']}",
                 {"amount": "5000", "paid": True, "payment_date": "2026-10-20"})
    return fy


async def test_isoc_and_result_after_tax(client):
    fy = await _year(client)
    r = await client.get(f"/api/fiscal-years/{fy}/isoc")
    assert r.status_code == 200, r.text
    isoc = r.json()
    assert isoc["before_tax"] == "98880.00"
    assert isoc["disallowed"]["restaurant"]["total"] == "347.20"
    assert isoc["disallowed"]["total"] == "347.20"
    [line] = isoc["disallowed"]["restaurant"]["lines"]
    assert line["reference"] == "A-0001" and line["amount"] == "1120.00"
    assert line["deductible_rate"] == "69.00" and line["disallowed"] == "347.20"
    purchases = (await client.get(f"/api/fiscal-years/{fy}/purchases")).json()
    assert line["piece_id"] == next(p["id"] for p in purchases if p["number"] == 1)
    assert line["asset_id"] is None
    assert isoc["taxable_base"] == "99227.20"
    assert isoc["reduced"] is True
    assert isoc["tax"] == "19845.44"
    assert isoc["majoration"]["gross"] == "1339.57"
    assert isoc["majoration"]["bonification_total"] == "675.00"
    assert isoc["majoration"]["amount"] == "664.57"
    assert isoc["majoration"]["exempt"] is False
    assert [(p["number"], p["quarter"], p["bonification"]) for p in isoc["prepayments"]] == [
        (1, 1, "450.00"), (2, None, "0.00"), (3, 4, "225.00"), (4, None, "0.00"),
    ]
    assert [p["due_date"] for p in isoc["prepayments"]] == ["2026-04-10", "2026-07-10", "2026-10-12", "2026-12-21"]
    assert isoc["paid_total"] == "10000.00"
    assert isoc["balance"] == "10510.01"
    assert isoc["estimated_tax"] == "20510.01"
    assert isoc["after_tax"] == "78369.99"
    assert isoc["assessment_year"] == 2027 and isoc["parameters_fallback"] is False

    result = (await client.get(f"/api/fiscal-years/{fy}/result")).json()
    assert result["result"] == "98880.00"
    assert result["estimated_tax"] == "20510.01"
    assert result["majoration"] == "664.57"
    assert result["after_tax"] == "78369.99"

    await _patch(client, f"/api/fiscal-years/{fy}", {"isoc_minimum_pay": False})
    isoc = (await client.get(f"/api/fiscal-years/{fy}/isoc")).json()
    assert isoc["reduced"] is False and isoc["conditions"]["minimum_pay"] is False
    assert isoc["tax"] == "24806.80"


async def test_isoc_of_an_asset_taken_over(client):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]
    car = await _piece(client, "/api/purchases", "2026-01-15", {
        "unit_price": "12000",
        "category_id": await _find(client, "/api/categories", "Petit matériel"),
        "vat_scheme_id": await _find(client, "/api/vat-schemes", "Achats 21 % · récupérable"),
        "isoc_scheme_id": await _find(client, "/api/isoc-schemes", "75 % · voiture"),
    })
    asset = await _post(client, "/api/fixed-assets", {
        "purchase_line_id": car["lines"][0]["id"], "description": "Voiture",
        "depreciation_model_id": await _find(client, "/api/depreciation-models", "Informatique · 3 ans"),
    })
    r = await client.put(f"/api/fixed-assets/{asset['id']}/depreciations/2026", json={"amount": "4000.00"})
    assert r.status_code == 200, r.text
    isoc = (await client.get(f"/api/fiscal-years/{fy}/isoc")).json()
    assert isoc["before_tax"] == "-4000.00"
    [line] = isoc["disallowed"]["car"]["lines"]
    assert line["reference"] == "I-001" and line["date"] == "2026-01-15"
    assert line["amount"] == "4000.00" and line["disallowed"] == "1000.00"
    assert line["asset_id"] == asset["id"] and line["piece_id"] is None
    assert isoc["taxable_base"] == "0.00" and isoc["tax"] == "0.00"
    assert (await client.get("/api/fiscal-years/999/isoc")).status_code == 404


async def test_reads_never_write_nor_need_a_transfer_method(client, session):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]
    await _post(client, "/api/payment-methods", {
        "name": "Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5,
    })
    await session.execute(delete(PaymentMethod).where(PaymentMethod.type != PaymentMethodType.CARD))
    await session.commit()
    r = await client.get(f"/api/fiscal-years/{fy}/result")
    assert r.status_code == 200, r.text
    assert r.json()["after_tax"] == "0.00"
    r = await client.get(f"/api/fiscal-years/{fy}/isoc")
    assert r.status_code == 200, r.text
    assert [(p["id"], p["payment_method_id"], p["amount"], p["paid"]) for p in r.json()["prepayments"]] == [
        (None, None, "0.00", False)
    ] * 4
    assert [p["due_date"] for p in r.json()["prepayments"]] == ["2026-04-10", "2026-07-10", "2026-10-12", "2026-12-21"]
    assert await session.scalar(select(func.count()).select_from(IsocPrepayment)) == 0


async def test_a_line_without_isoc_scheme_is_fully_deductible(client):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]
    purchase = await _piece(client, "/api/purchases", "2026-05-10", {
        "unit_price": "1000",
        "category_id": await _find(client, "/api/categories", "Restaurant"),
        "vat_scheme_id": await _find(client, "/api/vat-schemes", "Achats 21 % · récupérable"),
        "isoc_scheme_id": None,
    })
    assert purchase["lines"][0]["isoc_scheme_id"] is None
    isoc = (await client.get(f"/api/fiscal-years/{fy}/isoc")).json()
    assert isoc["before_tax"] == "-1000.00"
    assert isoc["disallowed"]["total"] == "0.00"
    assert all(isoc["disallowed"][k]["lines"] == [] for k in ("restaurant", "car", "other"))


async def test_assessment_year_of_a_calendar_year(client):
    fy = (await _post(client, "/api/fiscal-years", {}))["id"]  # 2026-01-01..2026-12-31
    isoc = (await client.get(f"/api/fiscal-years/{fy}/isoc")).json()
    assert (isoc["assessment_year"], isoc["parameters_fallback"]) == (2027, False)


async def test_assessment_year_of_a_year_closing_in_june(client, monkeypatch):
    for module in (pieces, fiscal_years):
        monkeypatch.setattr(module, "today", lambda: date(2026, 3, 1))
    await _patch(client, "/api/company", {"fiscal_year_start_month": 7})
    year = await _post(client, "/api/fiscal-years", {})
    assert (year["start_date"], year["end_date"]) == ("2025-07-01", "2026-06-30")
    isoc = (await client.get(f"/api/fiscal-years/{year['id']}/isoc")).json()
    # closed on 30/06/2026: assessment year 2026, whose parameters are not defined
    assert (isoc["assessment_year"], isoc["parameters_fallback"]) == (2026, True)
