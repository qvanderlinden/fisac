async def test_lists_the_seeded_bank(client):
    r = await client.get("/api/financial-accounts")
    assert r.status_code == 200
    assert r.json() == [{"id": 1, "code": "BQ", "name": "Banque · compte courant", "kind": "bank"}]
