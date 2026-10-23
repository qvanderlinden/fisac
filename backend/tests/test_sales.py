import asyncio
from datetime import date, timedelta

import pytest
from conftest import add_purchase_line

import fisac.pieces as pieces

SALES_CAT = 1  # Prestations de services
PURCHASE_CAT = 6  # Honoraires


async def open_2026(client):
    await client.post("/api/fiscal-years")


def sale_body(**kw):
    return {
        "kind": "invoice",
        "document_date": "2026-02-10",
        "payment_method_id": 1,
        "payment_date": "2026-03-01",
        **kw,
    }


async def make_sale(client, **kw):
    r = await client.post("/api/sales", json=sale_body(**kw))
    assert r.status_code == 201, r.text
    return r.json()


async def test_reference_and_status():
    assert pieces.reference("S", 1, 4) == "S-0001"
    assert pieces.reference("I", 4, 3) == "I-004"
    d = date(2026, 5, 1)
    assert pieces.status(True, d - timedelta(days=9), d) == "paid"
    assert pieces.status(False, d, d) == "planned"
    assert pieces.status(False, d - timedelta(days=1), d) == "late"


async def test_create_numbers_and_totals(client):
    await open_2026(client)
    s = await make_sale(client)
    assert s["number"] == 1 and s["lines"] == [] and s["total"] == "0.00"
    assert s["booking_date"] == "2026-02-10" and s["third_party_name"] is None
    r = await client.post(
        f"/api/sales/{s['id']}/lines",
        json={"description": "Conseil", "unit_price": "1000", "quantity": "1",
              "category_id": SALES_CAT, "vat_scheme_id": 1},
    )
    assert r.status_code == 201
    s = r.json()
    assert (s["net"], s["vat"], s["total"]) == ("1000.00", "210.00", "1210.00")
    assert s["lines"][0]["net"] == "1000.00" and s["lines"][0]["vat"] == "210.00"
    assert (await make_sale(client))["number"] == 2


async def test_lines_ordered_patched_deleted_answer_the_piece(client):
    await open_2026(client)
    s = await make_sale(client)
    body = {"unit_price": "100", "category_id": SALES_CAT, "vat_scheme_id": 1}
    for name in ("a", "b"):
        s = (await client.post(f"/api/sales/{s['id']}/lines", json={**body, "description": name})).json()
    assert [line["description"] for line in s["lines"]] == ["a", "b"]
    first = s["lines"][0]["id"]
    s = (await client.patch(f"/api/sale-lines/{first}", json={"unit_price": "50"})).json()
    assert s["net"] == "150.00"
    s = (await client.delete(f"/api/sale-lines/{first}")).json()
    assert [line["description"] for line in s["lines"]] == ["b"]
    assert (await client.get(f"/api/sales/{s['id']}")).json() == s


async def test_list_by_fiscal_year_and_delete(client):
    await open_2026(client)
    a, b = await make_sale(client), await make_sale(client)
    year = a["fiscal_year_id"]
    assert [s["id"] for s in (await client.get(f"/api/fiscal-years/{year}/sales")).json()] == [a["id"], b["id"]]
    await client.post(f"/api/sales/{a['id']}/lines", json={"unit_price": "1", "category_id": SALES_CAT, "vat_scheme_id": 1})
    assert (await client.delete(f"/api/sales/{a['id']}")).status_code == 204
    assert (await client.get(f"/api/sales/{a['id']}")).status_code == 404
    assert len((await client.get(f"/api/fiscal-years/{year}/sales")).json()) == 1


async def test_no_fiscal_year(client):
    r = await client.post("/api/sales", json=sale_body(document_date="2030-01-01", payment_date="2030-01-01"))
    assert r.status_code == 422 and r.json()["detail"][0] == {
        "loc": ["body", "document_date"], "msg": "Aucun exercice ne couvre cette date", "type": "value_error"}


async def test_booking_date_moves_and_renumbers(client, session):
    await open_2026(client)
    await client.post("/api/fiscal-years")  # 2027
    await make_sale(client)
    second = await make_sale(client)
    assert second["number"] == 2
    r = await client.patch(f"/api/sales/{second['id']}", json={"booking_date": "2027-01-05"})
    moved = r.json()
    assert moved["number"] == 1 and moved["fiscal_year_id"] != second["fiscal_year_id"]
    assert moved["booking_date"] == "2027-01-05" and moved["document_date"] == "2026-02-10"
    r = await client.patch(f"/api/sales/{second['id']}", json={"booking_date": "2026-02-10"})
    assert r.json()["booking_date"] == "2026-02-10" and r.json()["number"] == 2
    from fisac.models import Sale
    assert (await session.get(Sale, second["id"])).booking_date is None
    r = await client.patch(f"/api/sales/{second['id']}", json={"booking_date": "2035-01-05"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "booking_date"]


async def test_status(client, monkeypatch):
    await open_2026(client)
    monkeypatch.setattr(pieces, "today", lambda: date(2026, 6, 10))
    planned = await make_sale(client, payment_date="2026-06-11")
    late = await make_sale(client, payment_date="2026-06-09")
    paid = await make_sale(client, payment_date="2026-06-09", paid=True)
    assert (planned["status"], late["status"], paid["status"]) == ("planned", "late", "paid")
    assert (await client.patch(f"/api/sales/{late['id']}", json={"paid": True})).json()["status"] == "paid"


async def test_card_refused_on_sales(client):
    await open_2026(client)
    method = (await client.post("/api/payment-methods", json={
        "name": "Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5})).json()
    r = await client.post("/api/sales", json=sale_body(payment_method_id=method["id"]))
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "payment_method_id"]
    assert r.json()["detail"][0]["msg"] == "Une vente ne se paie pas par carte"
    s = await make_sale(client)
    r = await client.patch(f"/api/sales/{s['id']}", json={"payment_method_id": method["id"]})
    assert r.status_code == 422


async def test_line_category_direction(client):
    await open_2026(client)
    s = await make_sale(client)
    r = await client.post(f"/api/sales/{s['id']}/lines", json={
        "unit_price": "1", "category_id": PURCHASE_CAT, "vat_scheme_id": 1})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "category_id"]
    assert r.json()["detail"][0]["msg"] == "Choisissez une catégorie de vente"


async def test_credit_note_kind(client):
    await open_2026(client)
    s = await make_sale(client, kind="credit_note")
    assert s["kind"] == "credit_note"


async def test_concurrent_creates_get_distinct_numbers(client):
    await open_2026(client)
    results = await asyncio.gather(*[client.post("/api/sales", json=sale_body()) for _ in range(4)])
    assert all(r.status_code == 201 for r in results)
    assert {r.json()["number"] for r in results} == {1, 2, 3, 4}


@pytest.mark.parametrize("path", ["/api/sales/999", "/api/sale-lines/999"])
async def test_not_found(client, path):
    assert (await client.patch(path, json={})).status_code == 404
