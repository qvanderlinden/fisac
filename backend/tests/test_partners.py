async def test_crud_and_last_partner(client):
    a = (await client.post("/api/partners", json={"name": "A", "shares": 100, "contribution": "1000"})).json()
    assert a["contribution"] == "1000.00"
    b = (await client.post("/api/partners", json={"name": "B", "shares": 0, "contribution": "0"})).json()
    assert [p["name"] for p in (await client.get("/api/partners")).json()] == ["A", "B"]
    assert (await client.patch(f"/api/partners/{b['id']}", json={"shares": 10})).json()["shares"] == 10
    assert (await client.delete(f"/api/partners/{b['id']}")).status_code == 204
    r = await client.delete(f"/api/partners/{a['id']}")
    assert r.status_code == 409 and r.json()["code"] == "last_partner"


async def test_negative_shares(client):
    r = await client.post("/api/partners", json={"name": "A", "shares": -1, "contribution": "0"})
    assert r.status_code == 422
