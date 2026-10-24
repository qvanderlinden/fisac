from conftest import add_purchase_line

PURCHASE_CAT = 6


async def isoc_id(client, label):
    return next(s["id"] for s in (await client.get("/api/isoc-schemes")).json() if s["label"] == label)


async def test_company_incorporation_date(client):
    r = await client.get("/api/company")
    assert r.json()["incorporated_on"] is None
    r = await client.patch("/api/company", json={"incorporated_on": "2025-03-01"})
    assert r.json()["incorporated_on"] == "2025-03-01"
    r = await client.patch("/api/company", json={"incorporated_on": None})
    assert r.json()["incorporated_on"] is None


async def test_purchase_line_isoc_scheme(client):
    await client.post("/api/fiscal-years")
    purchase = (
        await client.post(
            "/api/purchases",
            json={"kind": "invoice", "document_date": "2026-02-10", "payment_method_id": 1,
                  "payment_date": "2026-03-01"},
        )
    ).json()
    full = await isoc_id(client, "100 %")
    restaurant = await isoc_id(client, "69 % · restaurant")
    line = {"description": "x", "unit_price": "100", "category_id": PURCHASE_CAT, "vat_scheme_id": 4}
    p = (await client.post(f"/api/purchases/{purchase['id']}/lines", json=line)).json()
    assert p["lines"][0]["isoc_scheme_id"] == full
    line_id = p["lines"][0]["id"]
    r = await client.patch(f"/api/purchase-lines/{line_id}", json={"isoc_scheme_id": restaurant})
    assert r.status_code == 200 and r.json()["lines"][0]["isoc_scheme_id"] == restaurant
    r = await client.patch(f"/api/purchase-lines/{line_id}", json={"isoc_scheme_id": 99999})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "isoc_scheme_id"]
    r = await client.post(
        f"/api/purchases/{purchase['id']}/lines", json={**line, "isoc_scheme_id": restaurant}
    )
    assert r.json()["lines"][-1]["isoc_scheme_id"] == restaurant
    r = await client.post(
        f"/api/purchases/{purchase['id']}/lines", json={**line, "isoc_scheme_id": 99999}
    )
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "isoc_scheme_id"]
