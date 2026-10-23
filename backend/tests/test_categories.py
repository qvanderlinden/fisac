from conftest import add_purchase_line


async def test_seed_after_0006(client):
    cats = (await client.get("/api/categories")).json()
    assert {c["label"] for c in cats if c["direction"] == "sales"} == {"Prestations de services", "Autres recettes"}
    assert {c["label"] for c in cats if c["direction"] == "purchases"} == {
        "Honoraires", "Logiciels et abonnements", "Petit matériel", "Formation",
        "Restaurant", "Déplacements", "Frais de voiture", "Frais bancaires"}
    assert set(cats[0]) == {"id", "label", "direction", "archived", "uses"}


async def test_filter_by_direction(client):
    r = (await client.get("/api/categories?direction=sales")).json()
    assert r and all(c["direction"] == "sales" for c in r)


async def test_direction_of_used_category_is_fixed(client, session):
    await add_purchase_line(session, category_id=6)
    r = await client.patch("/api/categories/6", json={"direction": "sales"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "direction"]


async def test_direction_of_unused_category_can_change(client):
    r = await client.patch("/api/categories/6", json={"direction": "sales"})
    assert r.status_code == 200 and r.json()["direction"] == "sales"


async def test_any_category_can_be_deleted_when_unused(client):
    sales = next(c for c in (await client.get("/api/categories")).json() if c["label"] == "Prestations de services")
    assert (await client.delete(f"/api/categories/{sales['id']}")).status_code == 204


async def test_in_use_archives_but_does_not_delete(client, session):
    await add_purchase_line(session, category_id=6)
    assert (await client.delete("/api/categories/6")).json()["code"] == "in_use"
    assert (await client.patch("/api/categories/6", json={"archived": True})).json()["archived"] is True


async def test_duplicate_label(client):
    r = await client.post("/api/categories", json={"label": "Honoraires", "direction": "purchases"})
    assert r.status_code == 422 and r.json()["detail"][0] == {"loc": ["body", "label"], "msg": "Ce libellé existe déjà", "type": "value_error"}
    r = await client.patch("/api/categories/7", json={"label": "Honoraires"})
    assert r.status_code == 422
    assert (await client.get("/api/categories/7")).status_code == 200
