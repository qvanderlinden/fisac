from conftest import add_purchase_line, add_sale

from fisac.routers.payment_methods import card_account_code

VISA = {"name": "Carte Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5}


def test_card_account_code():
    assert card_account_code("Carte Visa", {"BQ"}) == "CV"
    assert card_account_code("Carte Visa", {"BQ", "CV"}) == "CV2"
    assert len(card_account_code("a b c d e f g h i j", {"ABCDEFGH"})) <= 8


async def test_card_brings_its_account(client):
    m = (await client.post("/api/payment-methods", json=VISA)).json()
    assert m["financial_account_name"] == "Carte Visa" and m["settlement_account_id"] == 1
    accounts = (await client.get("/api/financial-accounts")).json()
    account = next(a for a in accounts if a["id"] == m["financial_account_id"])
    assert {"code": "CV", "kind": "card"}.items() <= account.items()


async def test_second_card_same_initials(client):
    await client.post("/api/payment-methods", json=VISA)
    body = {"name": "Crédit Volvo", "type": "card", "statement_closing_day": 1, "statement_payment_day": 10}
    m = (await client.post("/api/payment-methods", json=body)).json()
    accounts = (await client.get("/api/financial-accounts")).json()
    assert next(a for a in accounts if a["id"] == m["financial_account_id"])["code"] == "CV2"


async def test_card_needs_days(client):
    r = await client.post("/api/payment-methods", json={"name": "C", "type": "card"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "statement_closing_day"]
    # the card's account was rolled back with it
    accounts = (await client.get("/api/financial-accounts")).json()
    assert all(a["name"] != "C" for a in accounts)


async def test_day_range(client):
    m = (await client.post("/api/payment-methods", json={**VISA, "name": "C"})).json()
    r = await client.patch(f"/api/payment-methods/{m['id']}", json={"statement_closing_day": 32})
    assert r.json()["detail"][0]["msg"] == "Un jour de 1 à 31"


async def test_type_is_fixed(client):
    assert (await client.patch("/api/payment-methods/1", json={"type": "cash"})).status_code == 422


async def test_transfer_needs_an_account(client):
    assert (await client.post("/api/payment-methods", json={"name": "V2", "type": "transfer"})).status_code == 422


async def test_in_use(client, session):
    await add_sale(session, payment_method_id=1)
    r = await client.delete("/api/payment-methods/1")
    assert r.status_code == 409 and r.json()["code"] == "in_use"


async def test_uses_and_delete_keeps_account(client, session):
    await add_purchase_line(session, purchase={"payment_method_id": 1})
    assert (await client.get("/api/payment-methods/1")).json()["uses"] == 1
    m = (await client.post("/api/payment-methods", json=VISA)).json()
    assert m["uses"] == 0
    assert (await client.delete(f"/api/payment-methods/{m['id']}")).status_code == 204
    accounts = (await client.get("/api/financial-accounts")).json()
    assert any(a["id"] == m["financial_account_id"] for a in accounts)
