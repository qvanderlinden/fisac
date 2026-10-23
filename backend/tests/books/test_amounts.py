from decimal import Decimal

from fisac.books.amounts import cents, line_amounts, sign
from fisac.models import PieceKind


def test_purchase_line_partly_recoverable():
    a = line_amounts(Decimal("100"), Decimal("1"), Decimal("21"), Decimal("50"))
    assert (a.net, a.vat, a.recovered, a.charge) == (Decimal("100.00"), Decimal("21.00"), Decimal("10.50"), Decimal("110.50"))


def test_non_recoverable_and_quantity_rounding():
    a = line_amounts(Decimal("33.33"), Decimal("3"), Decimal("12"), None)
    assert (a.net, a.vat, a.recovered, a.charge) == (Decimal("99.99"), Decimal("12.00"), Decimal("0.00"), Decimal("111.99"))


def test_half_up():
    assert cents(Decimal("0.125")) == Decimal("0.13")


def test_sign():
    assert (sign(PieceKind.INVOICE), sign(PieceKind.CREDIT_NOTE)) == (1, -1)
