import asyncio
from datetime import date

from conftest import add_sale
from sqlalchemy import select

from fisac import pieces
from fisac.models import FinancialAccount, FinancialAccountKind, PaymentMethod, PaymentMethodType
from fisac.routers import isoc_prepayments


async def _year(client):
    return (await client.get("/api/fiscal-years")).json()[0]["id"]


async def _setup(session):
    await add_sale(session)  # creates the 2026 year
    return None


async def _rows(client, session):
    await _setup(session)
    fy = await _year(client)
    r = await client.get(f"/api/fiscal-years/{fy}/isoc-prepayments")
    assert r.status_code == 200, r.text
    return fy, r.json()


async def _card(session):
    visa = FinancialAccount(code="VISA", name="Visa", kind=FinancialAccountKind.CARD)
    session.add(visa)
    await session.flush()
    bank = await session.scalar(select(PaymentMethod).where(PaymentMethod.type == PaymentMethodType.TRANSFER))
    card = PaymentMethod(
        name="Carte Visa", type=PaymentMethodType.CARD, financial_account_id=visa.id,
        statement_closing_day=25, statement_payment_day=5, settlement_account_id=bank.financial_account_id,
    )
    session.add(card)
    await session.commit()
    return card.id


async def test_first_read_creates_four_rows(client, session):
    _, rows = await _rows(client, session)
    assert [r["number"] for r in rows] == [1, 2, 3, 4]
    assert [r["due_date"] for r in rows] == ["2026-04-10", "2026-07-10", "2026-10-12", "2026-12-21"]
    assert all(r["amount"] == "0.00" and r["paid"] is False and r["payment_date"] is None for r in rows)
    first = await session.scalar(
        select(PaymentMethod.id).where(PaymentMethod.type != PaymentMethodType.CARD).order_by(PaymentMethod.id)
    )
    assert {r["payment_method_id"] for r in rows} == {first}
    assert (await client.get("/api/fiscal-years/999/isoc-prepayments")).status_code == 404


async def test_concurrent_first_reads_both_succeed(client, session, monkeypatch):
    original = isoc_prepayments.commit

    async def slow_commit(s):
        await asyncio.sleep(0.1)
        await original(s)

    monkeypatch.setattr(isoc_prepayments, "commit", slow_commit)
    await _setup(session)
    fy = await _year(client)
    results = await asyncio.gather(*[client.get(f"/api/fiscal-years/{fy}/isoc-prepayments") for _ in range(2)])
    assert [r.status_code for r in results] == [200, 200], [r.text for r in results]
    ids = [[p["id"] for p in r.json()] for r in results]
    assert ids[0] == ids[1] and len(ids[0]) == 4


async def test_patch_amount_and_paid(client, session):
    _, rows = await _rows(client, session)
    pid = rows[0]["id"]
    r = await client.patch(f"/api/isoc-prepayments/{pid}", json={"amount": "2000"})
    assert r.status_code == 200 and r.json()["amount"] == "2000.00" and r.json()["paid"] is False
    r = await client.patch(f"/api/isoc-prepayments/{pid}", json={"paid": True, "payment_date": "2026-04-09"})
    assert r.status_code == 200 and r.json()["paid"] is True and r.json()["payment_date"] == "2026-04-09"
    r = await client.patch(f"/api/isoc-prepayments/{pid}", json={"paid": False})
    assert r.json()["paid"] is False and r.json()["payment_date"] == "2026-04-09"
    assert (await client.patch("/api/isoc-prepayments/999", json={"amount": "1"})).status_code == 404
    assert (await client.patch(f"/api/isoc-prepayments/{pid}", json={"amount": "-1"})).status_code == 422


async def test_card_is_refused(client, session):
    card = await _card(session)
    _, rows = await _rows(client, session)
    r = await client.patch(f"/api/isoc-prepayments/{rows[0]['id']}", json={"payment_method_id": card})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "payment_method_id"]
    assert r.json()["detail"][0]["msg"] == "Un versement anticipé ne se paie pas par carte"


async def test_paid_without_date_is_refused(client, session):
    _, rows = await _rows(client, session)
    r = await client.patch(f"/api/isoc-prepayments/{rows[0]['id']}", json={"paid": True})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "payment_date"]


async def test_journal_movement(client, session, monkeypatch):
    monkeypatch.setattr(pieces, "today", lambda: date(2026, 5, 1))
    fy, rows = await _rows(client, session)
    pid = rows[0]["id"]
    await client.patch(f"/api/isoc-prepayments/{pid}", json={"amount": "2000"})
    bank = await session.scalar(select(PaymentMethod).where(PaymentMethod.id == rows[0]["payment_method_id"]))
    account = bank.financial_account_id

    def movement(journals):
        j = next(j for j in journals if j["account"]["id"] == account)
        return [m for m in j["movements"] if m["kind"] == "isoc_prepayment"]

    r = await client.get(f"/api/fiscal-years/{fy}/journals")
    (m,) = movement(r.json())
    assert m["reference"] == "VA1 · ISOC" and m["amount"] == "-2000.00" and m["planned"] is True
    assert m["piece_id"] is None and m["label"] == "Versement anticipé" and m["date"] == "2026-04-10"
    await client.patch(f"/api/isoc-prepayments/{pid}", json={"paid": True, "payment_date": "2026-04-08"})
    (m,) = movement((await client.get(f"/api/fiscal-years/{fy}/journals")).json())
    assert m["planned"] is False and m["date"] == "2026-04-08"
    # unpaid again: planned on its due date, the typed payment date notwithstanding
    await client.patch(f"/api/isoc-prepayments/{pid}", json={"paid": False})
    (m,) = movement((await client.get(f"/api/fiscal-years/{fy}/journals")).json())
    assert m["planned"] is True and m["date"] == "2026-04-10"
