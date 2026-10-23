import asyncio

from conftest import add_purchase_line

PURCHASE_CAT = 6
SALES_CAT = 1


async def open_2026(client):
    await client.post("/api/fiscal-years")


def body(**kw):
    return {"kind": "invoice", "document_date": "2026-02-10", "payment_method_id": 1,
            "payment_date": "2026-03-01", **kw}


async def make(client, **kw):
    r = await client.post("/api/purchases", json=body(**kw))
    assert r.status_code == 201, r.text
    return r.json()


def line(**kw):
    return {"description": "x", "unit_price": "100", "category_id": PURCHASE_CAT, "vat_scheme_id": 4, **kw}


async def test_numbers_and_recovered_charge(client):
    await open_2026(client)
    p = await make(client)
    assert p["number"] == 1 and p["recovered"] == "0.00" and p["charge"] == "0.00"
    p = (await client.post(f"/api/purchases/{p['id']}/lines", json=line(vat_scheme_id=8))).json()
    assert (p["net"], p["vat"], p["total"]) == ("100.00", "21.00", "121.00")
    assert (p["recovered"], p["charge"]) == ("10.50", "110.50")
    ln = p["lines"][0]
    assert (ln["recovered"], ln["charge"]) == ("10.50", "110.50")
    assert ln["fixed_asset_id"] is None and ln["fixed_asset_number"] is None


async def test_credit_note_and_status_fields(client):
    await open_2026(client)
    p = await make(client, kind="credit_note")
    assert p["kind"] == "credit_note" and p["status"] in {"paid", "planned", "late"}


async def test_card_allowed_on_purchases(client):
    await open_2026(client)
    method = (await client.post("/api/payment-methods", json={
        "name": "Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5})).json()
    assert (await make(client, payment_method_id=method["id"]))["payment_method_id"] == method["id"]


async def test_line_category_direction(client):
    await open_2026(client)
    p = await make(client)
    r = await client.post(f"/api/purchases/{p['id']}/lines", json=line(category_id=SALES_CAT))
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "category_id"]
    assert r.json()["detail"][0]["msg"] == "Choisissez une catégorie d'achat"


async def test_booking_date_renumbers_and_no_year(client):
    await open_2026(client)
    await client.post("/api/fiscal-years")
    a, b = await make(client), await make(client)
    moved = (await client.patch(f"/api/purchases/{b['id']}", json={"booking_date": "2027-02-01"})).json()
    assert moved["number"] == 1 and moved["fiscal_year_id"] != a["fiscal_year_id"]
    r = await client.post("/api/purchases", json=body(document_date="2040-01-01"))
    assert r.status_code == 422 and r.json()["detail"][0]["msg"] == "Aucun exercice ne couvre cette date"


async def test_concurrent_creates(client):
    await open_2026(client)
    rs = await asyncio.gather(*[client.post("/api/purchases", json=body()) for _ in range(4)])
    assert {r.json()["number"] for r in rs} == {1, 2, 3, 4}


async def test_line_patch_delete_and_cascade(client):
    await open_2026(client)
    p = await make(client)
    p = (await client.post(f"/api/purchases/{p['id']}/lines", json=line())).json()
    lid = p["lines"][0]["id"]
    p = (await client.patch(f"/api/purchase-lines/{lid}", json={"quantity": "2"})).json()
    assert p["net"] == "200.00"
    assert (await client.delete(f"/api/purchase-lines/{lid}")).json()["lines"] == []
    await client.post(f"/api/purchases/{p['id']}/lines", json=line())
    assert (await client.delete(f"/api/purchases/{p['id']}")).status_code == 204


async def test_fixed_asset_shown_on_line(client, session):
    from fisac.models import FixedAsset
    pl = await add_purchase_line(session)
    session.add(FixedAsset(number=4, description="PC", depreciation_model_id=1, purchase_line_id=pl.id))
    await session.commit()
    asset = (await session.execute(__import__("sqlalchemy").select(FixedAsset))).scalar_one()
    p = (await client.get(f"/api/purchases/{pl.purchase_id}")).json()
    assert p["lines"][0]["fixed_asset_id"] == asset.id and p["lines"][0]["fixed_asset_number"] == 4


async def test_available_lists_invoice_lines_only(client, session):
    from fisac.models import FixedAsset, PieceKind
    inv = await add_purchase_line(session, description="Laptop", purchase={"number": 1})
    await add_purchase_line(session, description="Avoir", purchase={"number": 2, "kind": PieceKind.CREDIT_NOTE})
    taken = await add_purchase_line(session, description="Taken", purchase={"number": 3})
    session.add(FixedAsset(number=1, description="T", depreciation_model_id=1, purchase_line_id=taken.id))
    await session.commit()
    rows = (await client.get("/api/purchase-lines/available")).json()
    assert [r["id"] for r in rows] == [inv.id]
    assert set(rows[0]) == {"id", "purchase_id", "purchase_number", "fiscal_year", "third_party_name",
                            "description", "net", "charge", "booking_date"}
    assert rows[0]["fiscal_year"] == 2026 and rows[0]["net"] == "100.00"
    assert len((await client.get("/api/purchase-lines/available?q=lap")).json()) == 1
    assert (await client.get("/api/purchase-lines/available?q=zzz")).json() == []
