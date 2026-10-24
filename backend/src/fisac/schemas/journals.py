from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from fisac.schemas.financial_accounts import FinancialAccountRead


class MovementRead(BaseModel):
    date: date
    kind: Literal["sale", "purchase", "card_statement", "isoc_prepayment"]
    piece_id: int | None
    reference: str
    label: str
    amount: Decimal
    balance: Decimal
    planned: bool


class JournalRead(BaseModel):
    account: FinancialAccountRead
    opening: Decimal
    receipts: Decimal
    payments: Decimal
    closing: Decimal
    movements: list[MovementRead]
