from datetime import date
from decimal import Decimal

from conftest import add_purchase_line, add_sale
from sqlalchemy import null, select

from fisac import pieces
from fisac.models import (
    Category,
    CategoryDirection,
    FinancialAccount,
    FinancialAccountKind,
    FiscalYear,
    PaymentMethod,
    PaymentMethodType,
    Purchase,
    PurchaseLine,
    SaleLine,
)


async def test_journals(client, session, monkeypatch):
    monkeypatch.setattr(pieces, "today", lambda: date(2026, 10, 23))
    transfer = await session.scalar(select(PaymentMethod).where(PaymentMethod.type == PaymentMethodType.TRANSFER))
    transfer_id, bank_account = transfer.id, transfer.financial_account_id
    visa = FinancialAccount(code="VISA", name="Visa", kind=FinancialAccountKind.CARD)
    session.add(visa)
    await session.flush()
    card = PaymentMethod(
        name="Carte Visa", type=PaymentMethodType.CARD, financial_account_id=visa.id,
        statement_closing_day=25, statement_payment_day=5,
        settlement_account_id=bank_account,
    )
    session.add(card)
    await session.flush()
    card_id, card_account = card.id, visa.id
    await session.commit()
    category = await session.scalar(select(Category.id).where(Category.direction == CategoryDirection.SALES))
    for sale in (
        await add_sale(session, payment_method_id=transfer_id, paid=True),
        await add_sale(session, payment_method_id=transfer_id, kind="credit_note", number=2, payment_date=date(2026, 3, 2)),
    ):
        session.add(SaleLine(sale_id=sale.id, unit_price=50, category_id=category, vat_scheme_id=4, sort_key="a0"))
    await session.commit()
    await add_purchase_line(
        session, unit_price=100,
        purchase={"payment_method_id": card_id, "payment_date": date(2026, 10, 22), "document_date": date(2026, 10, 22)},
    )
    await add_purchase_line(
        session, unit_price=10,
        purchase={"payment_method_id": transfer_id, "kind": "credit_note", "number": 2, "payment_date": date(2026, 3, 3)},
    )
    fy = (await client.get("/api/fiscal-years")).json()[0]["id"]
    r = await client.get(f"/api/fiscal-years/{fy}/journals")
    assert r.status_code == 200, r.text
    by_account = {j["account"]["id"]: j for j in r.json()}
    bank = by_account[bank_account]
    card_journal = by_account[card_account]
    assert bank["movements"][0]["reference"] == "S-0001"
    assert bank["movements"][-1]["kind"] == "card_statement" and bank["movements"][-1]["planned"]
    refs = {m["reference"]: m for m in bank["movements"]}
    assert Decimal(refs["S-0001"]["amount"]) > 0
    assert Decimal(refs["S-0002"]["amount"]) < 0  # sale credit note: out
    assert Decimal(refs["A-0002"]["amount"]) > 0  # purchase credit note: in
    assert card_journal["closing"] == "0.00"
    assert (await client.get("/api/fiscal-years/999/journals")).status_code == 404


async def test_statement_paid_in_a_mid_month_year_for_a_purchase_of_the_previous_one(client, session):
    transfer = await session.scalar(select(PaymentMethod).where(PaymentMethod.type == PaymentMethodType.TRANSFER))
    bank_account = transfer.financial_account_id
    visa = FinancialAccount(code="VISA", name="Visa", kind=FinancialAccountKind.CARD)
    previous = FiscalYear(start_date=date(2025, 3, 20), end_date=date(2026, 3, 19))
    current = FiscalYear(start_date=date(2026, 3, 20), end_date=date(2027, 3, 19))
    session.add_all([visa, previous, current])
    await session.flush()
    card = PaymentMethod(
        name="Carte Visa", type=PaymentMethodType.CARD, financial_account_id=visa.id,
        statement_closing_day=1, statement_payment_day=25, settlement_account_id=bank_account,
    )
    session.add(card)
    await session.flush()
    purchase = Purchase(
        fiscal_year_id=previous.id, number=1, document_date=date(2026, 1, 5),
        payment_date=date(2026, 1, 5), payment_method_id=card.id, paid=True,
    )
    session.add(purchase)
    await session.flush()
    session.add(PurchaseLine(
        purchase_id=purchase.id, unit_price=100, category_id=6, vat_scheme_id=4,
        isoc_scheme_id=1, sort_key="a0",
    ))
    current_id, visa_id = current.id, visa.id
    await session.commit()
    r = await client.get(f"/api/fiscal-years/{current_id}/journals")
    assert r.status_code == 200, r.text
    by_account = {j["account"]["id"]: j for j in r.json()}
    for journal in (by_account[bank_account], by_account[visa_id]):
        assert [(m["date"], m["kind"]) for m in journal["movements"]] == [("2026-03-25", "card_statement")]
    assert by_account[bank_account]["movements"][0]["amount"].startswith("-")


async def test_future_card_purchase_is_planned_in_the_journal(client, session, monkeypatch):
    monkeypatch.setattr(pieces, "today", lambda: date(2026, 10, 23))
    transfer = await session.scalar(select(PaymentMethod).where(PaymentMethod.type == PaymentMethodType.TRANSFER))
    bank_account = transfer.financial_account_id
    visa = FinancialAccount(code="VISA", name="Visa", kind=FinancialAccountKind.CARD)
    session.add(visa)
    await session.flush()
    card = PaymentMethod(
        name="Carte Visa", type=PaymentMethodType.CARD, financial_account_id=visa.id,
        statement_closing_day=25, statement_payment_day=5, settlement_account_id=bank_account,
    )
    session.add(card)
    await session.flush()
    card_id, visa_id = card.id, visa.id
    for number, day in ((1, date(2026, 10, 20)), (2, date(2026, 10, 30))):
        await add_purchase_line(session, purchase={
            "number": number, "payment_date": day, "payment_method_id": card_id, "paid": null()})
    year = await session.scalar(select(FiscalYear.id))
    r = await client.get(f"/api/fiscal-years/{year}/journals")
    assert r.status_code == 200, r.text
    by_account = {j["account"]["id"]: j for j in r.json()}
    planned = {m["reference"]: m["planned"] for m in by_account[visa_id]["movements"] if m["kind"] == "purchase"}
    assert planned == {"A-0001": False, "A-0002": True}
