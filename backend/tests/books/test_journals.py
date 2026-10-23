from datetime import date
from decimal import Decimal

from fisac.books.journals import Account, Card, CashPiece, build

BANK = Account(1, "BQ", "Banque", "bank")
VISA = Account(2, "VISA", "Visa", "card")
CARD = Card(7, "Carte Visa", 2, 1, 25, 5)
START, END, TODAY = date(2026, 1, 1), date(2026, 12, 31), date(2026, 10, 23)


def _piece(day, kind, pid, amount, account=1, paid=True, card=None):
    ref = ("S" if kind == "sale" else "A") + f"-{pid:04d}"
    return CashPiece(day, kind, pid, ref, "tiers", Decimal(amount), account, paid, card)


def _by_id(journals):
    return {j.account.id: j for j in journals}


def test_cash_pieces_and_running_balance():
    pieces = [
        _piece(date(2026, 3, 1), "sale", 1, "121.00"),
        _piece(date(2026, 3, 5), "purchase", 1, "60.50", paid=False),  # credit note: in
        _piece(date(2026, 2, 1), "purchase", 2, "-30.00"),
    ]
    bank = _by_id(build([BANK], pieces, [], START, END, TODAY))[1]
    assert [m.reference for m in bank.movements] == ["A-0002", "S-0001", "A-0001"]
    assert [m.balance for m in bank.movements] == [Decimal("-30.00"), Decimal("91.00"), Decimal("151.50")]
    assert (bank.opening, bank.receipts, bank.payments, bank.closing) == (
        Decimal("0.00"), Decimal("181.50"), Decimal("30.00"), Decimal("151.50"),
    )
    assert [m.planned for m in bank.movements] == [False, False, True]


def test_card_statements():
    pieces = [
        _piece(date(2026, 10, 22), "purchase", 1, "-100.00", account=2, card=7),
        _piece(date(2026, 10, 26), "purchase", 2, "-40.00", account=2, card=7),
    ]
    journals = _by_id(build([BANK, VISA], pieces, [CARD], START, END, TODAY))
    bank, visa = journals[1], journals[2]
    assert [(m.date, m.amount, m.planned) for m in bank.movements] == [
        (date(2026, 11, 5), Decimal("-100.00"), True),
        (date(2026, 12, 5), Decimal("-40.00"), True),
    ]
    assert bank.movements[0].reference == "Décompte Carte Visa · octobre"
    assert bank.movements[1].reference == "Décompte Carte Visa · novembre"
    assert bank.movements[0].kind == "card_statement" and bank.movements[0].piece_id is None
    assert visa.closing == Decimal("0.00")
    assert visa.payments == Decimal("140.00") and visa.receipts == Decimal("140.00")


def test_paid_statement_is_not_planned():
    pieces = [_piece(date(2026, 8, 10), "purchase", 1, "-10.00", account=2, card=7)]
    bank = _by_id(build([BANK, VISA], pieces, [CARD], START, END, TODAY))[1]
    assert bank.movements[0].date == date(2026, 9, 5) and not bank.movements[0].planned


def test_outside_the_year_is_excluded():
    pieces = [
        _piece(date(2025, 12, 31), "sale", 1, "10.00"),
        _piece(date(2027, 1, 1), "sale", 2, "10.00"),
        _piece(date(2025, 12, 28), "purchase", 3, "-50.00", account=2, card=7),  # statement paid 2026-02-05
    ]
    journals = _by_id(build([BANK, VISA], pieces, [CARD], START, END, TODAY))
    assert [(m.date, m.amount) for m in journals[1].movements] == [(date(2026, 2, 5), Decimal("-50.00"))]
    assert [m.kind for m in journals[2].movements] == ["card_statement"]
