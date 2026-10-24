"""The journals: one per financial account, computed from the pieces' payments.

Pure: the router loads the facts, `build` turns them into movements. Amounts are
signed from the account's side, money in > 0.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

from fisac.books.card_statements import statement_for

_ZERO = Decimal("0.00")
_MONTHS = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)


@dataclass(frozen=True)
class Account:
    id: int
    code: str
    name: str
    kind: str


@dataclass(frozen=True)
class CashPiece:
    date: date  # the payment date
    kind: Literal["sale", "purchase"]
    piece_id: int
    reference: str
    label: str
    amount: Decimal  # signed: in > 0
    account_id: int
    paid: bool
    card_method_id: int | None = None


@dataclass(frozen=True)
class Prepayment:
    number: int
    date: date  # the payment date, else the due date
    amount: Decimal  # unsigned, > 0
    account_id: int
    paid: bool


@dataclass(frozen=True)
class Card:
    method_id: int
    name: str
    account_id: int
    settlement_account_id: int
    closing_day: int
    payment_day: int


@dataclass
class Movement:
    date: date
    kind: Literal["sale", "purchase", "card_statement", "isoc_prepayment"]
    piece_id: int | None
    reference: str
    label: str
    amount: Decimal
    planned: bool
    balance: Decimal = _ZERO


@dataclass
class Journal:
    account: Account
    opening: Decimal = _ZERO
    receipts: Decimal = _ZERO
    payments: Decimal = _ZERO
    closing: Decimal = _ZERO
    movements: list[Movement] = field(default_factory=list)


def _statements(pieces: list[CashPiece], cards: list[Card], today: date) -> list[tuple[int, Movement]]:
    """Per card and statement with purchases: (account id, movement), out of the
    settlement account and into the card's account on the payment date."""
    by_method = {card.method_id: card for card in cards}
    totals: dict[tuple[int, date, date], Decimal] = defaultdict(Decimal)
    for piece in pieces:
        card = by_method.get(piece.card_method_id)
        if card is None:
            continue
        statement = statement_for(piece.date, card.closing_day, card.payment_day)
        totals[(card.method_id, statement.end, statement.payment)] += piece.amount
    moves = []
    for (method_id, end, payment), total in totals.items():
        if not total:
            continue
        card = by_method[method_id]
        reference = f"Décompte {card.name} · {_MONTHS[end.month - 1]}"
        planned = payment > today
        out = Movement(payment, "card_statement", None, reference, card.name, total, planned)
        into = Movement(payment, "card_statement", None, reference, card.name, -total, planned)
        moves += [(card.settlement_account_id, out), (card.account_id, into)]
    return moves


def build(
    accounts: list[Account],
    pieces: list[CashPiece],
    cards: list[Card],
    start: date,
    end: date,
    today: date,
    prepayments: list[Prepayment] = (),
) -> list[Journal]:
    """`pieces` may reach before `start`: a card purchase paid late in the previous
    year can have its statement paid in this one. Only movements within [start, end] stay."""
    journals = {account.id: Journal(account) for account in accounts}
    moves: list[tuple[int, Movement]] = _statements(pieces, cards, today)
    for piece in pieces:
        moves.append((
            piece.account_id,
            Movement(piece.date, piece.kind, piece.piece_id, piece.reference, piece.label,
                     piece.amount, not piece.paid),
        ))
    for pay in prepayments:
        moves.append((
            pay.account_id,
            Movement(pay.date, "isoc_prepayment", None, f"VA{pay.number} · ISOC",
                     "Versement anticipé", -pay.amount, not pay.paid),
        ))
    for account_id, movement in moves:
        if start <= movement.date <= end and account_id in journals:
            journals[account_id].movements.append(movement)
    for journal in journals.values():
        journal.movements.sort(key=lambda m: (m.date, m.reference))
        balance = journal.opening
        for movement in journal.movements:
            balance += movement.amount
            movement.balance = balance
            if movement.amount > 0:
                journal.receipts += movement.amount
            else:
                journal.payments -= movement.amount
        journal.closing = balance
    return list(journals.values())
