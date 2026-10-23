async def test_get_creates_the_row(client):
    r = await client.get("/api/company")
    assert r.status_code == 200
    assert r.json()["legal_form"] == "srl" and r.json()["fiscal_year_start_month"] == 1


async def test_patch_one_field(client):
    r = await client.patch("/api/company", json={"name": "Ma SRL"})
    assert r.json()["name"] == "Ma SRL" and r.json()["vat_regime"] == "quarterly"


async def test_iban_is_normalised_and_checked(client):
    r = await client.patch("/api/company", json={"iban": "be68 5390 0754 7034"})
    assert r.json()["iban"] == "BE68539007547034"
    r = await client.patch("/api/company", json={"iban": "BE00 0000 0000 0000"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "iban"]
    assert r.json()["detail"][0]["msg"] == "IBAN invalide : vérifiez les chiffres (Belgique)"


async def test_start_month_out_of_range(client):
    assert (await client.patch("/api/company", json={"fiscal_year_start_month": 13})).status_code == 422
