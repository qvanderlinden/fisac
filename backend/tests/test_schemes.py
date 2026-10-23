from datetime import date

from conftest import add_purchase_line, add_sale
from sqlalchemy import select

from fisac.models import Category, FixedAsset


async def test_vat_lists_the_seed(client):
    labels = [v["label"] for v in (await client.get("/api/vat-schemes")).json()]
    assert len(labels) == 10 and "Achats 21 % · voiture 50 %" in labels
    assert labels == sorted(labels)


async def test_vat_crud(client):
    body = {"label": "Z", "rate": "6", "for_sales": True, "for_purchases": True, "recoverable_rate": "100"}
    v = (await client.post("/api/vat-schemes", json=body)).json()
    assert v == {"id": v["id"], **body, "rate": "6.00", "recoverable_rate": "100.00", "uses": 0}
    r = await client.patch(f"/api/vat-schemes/{v['id']}", json={"label": "Y", "for_purchases": False, "recoverable_rate": None})
    assert (r.json()["label"], r.json()["recoverable_rate"]) == ("Y", None)
    assert (await client.delete(f"/api/vat-schemes/{v['id']}")).status_code == 204
    assert (await client.get(f"/api/vat-schemes/{v['id']}")).status_code == 404


async def test_vat_purchase_needs_recoverable(client):
    r = await client.post("/api/vat-schemes", json={"label": "Z", "rate": "21", "for_sales": False, "for_purchases": True})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "recoverable_rate"]


async def test_vat_in_use(client, session):
    await add_purchase_line(session, vat_scheme_id=4)
    assert (await client.delete("/api/vat-schemes/4")).json()["code"] == "in_use"


async def test_vat_uses_sum_sales_and_purchases(client, session):
    await add_sale(session)
    await add_purchase_line(session, vat_scheme_id=4)
    await add_purchase_line(session, vat_scheme_id=4, purchase={"number": 2})
    assert (await client.get("/api/vat-schemes/4")).json()["uses"] == 2


async def test_scheme_only_a_default_points_at_is_deletable(client, session):
    r = await client.delete("/api/vat-schemes/3")  # "Ventes 0 % · cocontractant": no line, no default
    assert r.status_code == 204
    r = await client.delete("/api/isoc-schemes/2")  # "69 % · restaurant", default of "Restaurant"
    assert r.status_code == 204
    restaurant = (
        await session.execute(
            select(Category).where(Category.label == "Restaurant").execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert restaurant.default_isoc_scheme_id is None


async def test_isoc_rate_range(client):
    assert (await client.post("/api/isoc-schemes", json={"label": "X", "deductible_rate": "101", "rubric": "other"})).status_code == 422
    assert (await client.post("/api/isoc-schemes", json={"label": "X", "deductible_rate": "1000", "rubric": "other"})).status_code == 422


async def test_isoc_crud_and_in_use(client, session):
    s = (await client.post("/api/isoc-schemes", json={"label": "X", "deductible_rate": "50", "rubric": "other"})).json()
    assert s == {"id": s["id"], "label": "X", "deductible_rate": "50.00", "rubric": "other", "uses": 0}
    r = await client.patch(f"/api/isoc-schemes/{s['id']}", json={"deductible_rate": "40"})
    assert r.json()["deductible_rate"] == "40.00"
    await add_purchase_line(session, isoc_scheme_id=1)
    r = await client.delete("/api/isoc-schemes/1")
    assert (r.status_code, r.json()["code"], r.json()["uses"]) == (409, "in_use", 1)
    assert (await client.delete(f"/api/isoc-schemes/{s['id']}")).status_code == 204


async def test_model_years_and_duplicate_label(client):
    assert (await client.post("/api/depreciation-models", json={"label": "X", "years": 0, "method": "linear", "first_year": "prorata"})).status_code == 422
    r = await client.post("/api/depreciation-models", json={"label": "Mobilier · 5 ans", "years": 5, "method": "linear", "first_year": "full"})
    assert r.status_code == 422 and r.json()["detail"][0]["msg"] == "Ce libellé existe déjà"


async def test_model_crud_and_in_use(client, session):
    m = (await client.post("/api/depreciation-models", json={"label": "X", "years": 4, "method": "declining", "first_year": "full"})).json()
    assert m == {"id": m["id"], "label": "X", "years": 4, "method": "declining", "first_year": "full", "uses": 0}
    r = await client.patch(f"/api/depreciation-models/{m['id']}", json={"years": 6})
    assert r.json()["years"] == 6
    assert (await client.patch(f"/api/depreciation-models/{m['id']}", json={"nope": 1})).status_code == 422
    session.add(
        FixedAsset(number=1, acquisition_date=date(2026, 3, 1), acquisition_value=100, depreciation_model_id=m["id"])
    )
    await session.commit()
    r = await client.delete(f"/api/depreciation-models/{m['id']}")
    assert (r.status_code, r.json()["code"], r.json()["uses"]) == (409, "in_use", 1)
