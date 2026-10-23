from conftest import add_purchase_line


async def test_seed(client):
    cats = (await client.get("/api/categories")).json()
    assert len(cats) == 19 and {c["role"] for c in cats} >= {"sales", "corporate_tax", "fixed_asset"}


async def test_system_rules(client):
    sales = next(c for c in (await client.get("/api/categories")).json() if c["role"] == "sales")
    for call in (
        client.delete(f"/api/categories/{sales['id']}"),
        client.patch(f"/api/categories/{sales['id']}", json={"archived": True}),
        client.patch(f"/api/categories/{sales['id']}", json={"kind": "expense"}),
    ):
        r = await call
        assert r.status_code == 409 and r.json()["code"] == "system"
    assert (await client.patch(f"/api/categories/{sales['id']}", json={"label": "Prestations"})).status_code == 200


async def test_in_use_archives_but_does_not_delete(client, session):
    await add_purchase_line(session, category_id=6)
    assert (await client.delete("/api/categories/6")).json()["code"] == "in_use"
    assert (await client.patch("/api/categories/6", json={"archived": True})).json()["archived"] is True


async def test_settlement_on_expense(client):
    r = await client.post("/api/categories", json={"label": "X", "kind": "expense", "settlement": "vat_return"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "settlement"]


async def test_duplicate_label(client):
    r = await client.post("/api/categories", json={"label": "Honoraires", "kind": "expense"})
    assert r.status_code == 422 and r.json()["detail"][0] == {"loc": ["body", "label"], "msg": "Ce libellé existe déjà", "type": "value_error"}
    r = await client.patch("/api/categories/7", json={"label": "Honoraires"})
    assert r.status_code == 422
    assert (await client.get("/api/categories/7")).status_code == 200
