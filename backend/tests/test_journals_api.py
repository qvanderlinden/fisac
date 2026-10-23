from datetime import date

from conftest import add_purchase_line, add_sale
from sqlalchemy import select

from fisac import pieces
from fisac.models import FinancialAccount, FinancialAccountKind, PaymentMethod, PaymentMethodType


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
    await add_sale(session, payment_method_id=transfer_id, paid=True)
    await add_purchase_line(
        session, unit_price=100,
        purchase={"payment_method_id": card_id, "payment_date": date(2026, 10, 22), "document_date": date(2026, 10, 22)},
    )
    fy = 1
    r = await client.get(f"/api/fiscal-years/{fy}/journals")
    assert r.status_code == 200, r.text
    by_account = {j["account"]["id"]: j for j in r.json()}
    bank = by_account[bank_account]
    card_journal = by_account[card_account]
    assert bank["movements"][0]["reference"] == "S-0001"
    assert bank["movements"][-1]["kind"] == "card_statement" and bank["movements"][-1]["planned"]
    assert card_journal["closing"] == "0.00"
    assert (await client.get("/api/fiscal-years/999/journals")).status_code == 404
