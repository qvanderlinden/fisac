import pytest
from fastapi import HTTPException
from sqlalchemy import select

from fisac import errors
from fisac.models import Category, DepreciationModel, FinancialAccount, PurchaseLine, SaleLine
from fisac.uses import uses_expr


async def test_unmapped_and_mapped_constraints(session):
    session.add(DepreciationModel(label="X", years=60))
    with pytest.raises(HTTPException) as e:
        await errors.commit(session)
    assert e.value.status_code == 422
    assert e.value.detail == [{"loc": ["body", "years"], "msg": "De 1 à 50 ans", "type": "value_error"}]


async def test_unmapped_constraint_falls_back_to_root(session):
    session.add(FinancialAccount(code="BQ", name="Doublon", kind="bank"))
    with pytest.raises(HTTPException) as e:
        await errors.commit(session)
    assert e.value.status_code == 422
    assert e.value.detail == [
        {"loc": ["body", "__root__"], "msg": "uq_financial_accounts_code", "type": "value_error"}
    ]


async def test_foreign_key_violation_is_in_use(session):
    account = await session.get(FinancialAccount, 1)
    await session.delete(account)
    with pytest.raises(HTTPException) as e:
        await errors.commit(session)
    assert e.value.status_code == 409
    assert e.value.detail == "Utilisé par d'autres données"
    assert e.value.extra == {"code": "in_use", "uses": 0}


async def test_error_bodies_are_flat(client):
    from fisac.main import app

    @app.get("/api/_probe-in-use")
    async def probe_in_use():
        raise errors.in_use(3)

    @app.get("/api/_probe-conflict")
    async def probe_conflict():
        raise errors.conflict("system", "Fourni par le système")

    @app.get("/api/_probe-missing")
    async def probe_missing():
        raise errors.not_found("Catégorie")

    r = await client.get("/api/_probe-in-use")
    assert r.status_code == 409
    assert r.json() == {
        "detail": "Porté par 3 pièce(s) : impossible de le supprimer",
        "code": "in_use",
        "uses": 3,
    }
    r = await client.get("/api/_probe-conflict")
    assert r.status_code == 409
    assert r.json() == {"detail": "Fourni par le système", "code": "system"}
    r = await client.get("/api/_probe-missing")
    assert r.status_code == 404
    assert r.json() == {"detail": "Catégorie introuvable"}


async def test_uses_expr_counts_each_reference(session):
    q = select(uses_expr(Category.id, SaleLine.category_id, PurchaseLine.category_id)).where(
        Category.id == 1
    )
    assert (await session.execute(q)).scalar_one() == 0


async def test_uses_expr_without_refs_is_zero(session):
    q = select(uses_expr(Category.id)).where(Category.id == 1)
    assert (await session.execute(q)).scalar_one() == 0
