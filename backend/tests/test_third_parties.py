from conftest import add_purchase_line, add_sale


async def test_crud(client):
    t = (
        await client.post(
            "/api/third-parties", json={"name": "Langerman", "iban": "nl91 abna 0417 1643 00"}
        )
    ).json()
    assert t == {"id": t["id"], "name": "Langerman", "iban": "NL91ABNA0417164300", "uses": 0}
    r = await client.patch(f"/api/third-parties/{t['id']}", json={"iban": ""})
    assert r.json()["iban"] is None
    assert (await client.delete(f"/api/third-parties/{t['id']}")).status_code == 204
    assert (await client.get(f"/api/third-parties/{t['id']}")).status_code == 404


async def test_list_by_name(client):
    for name in ("Zeta", "Alpha"):
        await client.post("/api/third-parties", json={"name": name})
    names = [t["name"] for t in (await client.get("/api/third-parties")).json()]
    assert names == ["Alpha", "Zeta"]


async def test_invalid_iban(client):
    r = await client.post("/api/third-parties", json={"name": "X", "iban": "DE89370400440532013001"})
    assert r.status_code == 422 and r.json()["detail"][0]["msg"] == "IBAN invalide : vérifiez les chiffres (Allemagne)"


async def test_overlong_iban_is_422_not_500(client):
    r = await client.post("/api/third-parties", json={"name": "X", "iban": "XX00" + "1" * 40})
    assert r.status_code == 422


async def test_in_use(client, session):
    t = (await client.post("/api/third-parties", json={"name": "Client"})).json()
    await add_sale(session, third_party_id=t["id"])
    await add_purchase_line(session, purchase={"third_party_id": t["id"], "number": 2})
    assert (await client.get(f"/api/third-parties/{t['id']}")).json()["uses"] == 2
    r = await client.delete(f"/api/third-parties/{t['id']}")
    assert r.status_code == 409 and (r.json()["code"], r.json()["uses"]) == ("in_use", 2)
