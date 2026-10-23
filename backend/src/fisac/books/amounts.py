"""Line amounts: cents, half-up, line by line."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from fisac.models import PieceKind

_CENT = Decimal("0.01")
_HUNDRED = Decimal(100)


def cents(x: Decimal) -> Decimal:
    return x.quantize(_CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class LineAmounts:
    net: Decimal
    vat: Decimal
    recovered: Decimal
    charge: Decimal


def line_amounts(
    unit_price: Decimal,
    quantity: Decimal,
    rate: Decimal,
    recoverable_rate: Decimal | None,
) -> LineAmounts:
    """net = price x quantity, vat = net x rate / 100, recovered = vat x recoverable
    rate / 100 (0 without one), charge = net + vat - recovered. Each rounded."""
    net = cents(unit_price * quantity)
    vat = cents(net * rate / _HUNDRED)
    recovered = cents(vat * recoverable_rate / _HUNDRED) if recoverable_rate else Decimal("0.00")
    return LineAmounts(net, vat, recovered, net + vat - recovered)


def sign(kind: PieceKind) -> int:
    """The sign every effect of a piece takes: +1 invoice, -1 credit note."""
    return -1 if kind == PieceKind.CREDIT_NOTE else 1
