"""ISOC computation: disallowed expenses, tax, majoration and balance. Pure."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fisac.books.amounts import cents
from fisac.books.depreciation import fiscal_year_of
from fisac.books.isoc_params import Params
from fisac.models import IsocRubric

_HUNDRED = Decimal(100)
_ZERO = Decimal("0.00")


@dataclass(frozen=True)
class DisallowedLine:
    rubric: IsocRubric
    reference: str
    date: date
    label: str
    base: Decimal  # signed
    deductible_rate: Decimal
    disallowed: Decimal


@dataclass(frozen=True)
class Prepayment:
    number: int
    amount: Decimal
    paid: bool
    payment_date: date | None


@dataclass(frozen=True)
class IsocResult:
    before_tax: Decimal
    disallowed_by_rubric: dict[IsocRubric, Decimal]
    disallowed_total: Decimal
    taxable_base: Decimal
    reduced: bool
    tax_reduced: Decimal
    tax_normal: Decimal
    tax: Decimal
    majoration_gross: Decimal
    bonifications: list[tuple[int, int | None, Decimal]]
    bonification_total: Decimal
    threshold: Decimal
    majoration: Decimal
    exempt: bool
    paid_total: Decimal
    balance: Decimal
    estimated_tax: Decimal
    after_tax: Decimal


def disallowed_part(amount: Decimal, deductible_rate: Decimal) -> Decimal:
    """amount x (100 - deductible rate) / 100, to the cent."""
    return cents(amount * (_HUNDRED - deductible_rate) / _HUNDRED)


def is_exempt(
    small_company: bool, incorporated_on: date | None, fy_start: date, start_month: int
) -> bool:
    """A small company in its first three fiscal years, the one containing
    `incorporated_on` being the first.

    Years are counted as 12-month spans from that first year's start, so a longer
    (or shorter) first fiscal year makes the count approximate."""
    if not small_company or incorporated_on is None:
        return False
    first_start, _ = fiscal_year_of(incorporated_on, start_month)
    months = (fy_start.year * 12 + fy_start.month) - (first_start.year * 12 + first_start.month)
    return 0 <= months // 12 <= 2


def _quarter(payment_date: date, due: list[date]) -> int | None:
    """The 1-based first quarter whose due date is on or after the payment."""
    for i, d in enumerate(due, start=1):
        if payment_date <= d:
            return i
    return None


def attribute(
    prepayment: Prepayment, due: list[date], params: Params
) -> tuple[int | None, Decimal | None, Decimal]:
    """The quarter a prepayment counts for, that quarter's rate and its bonification.

    Unpaid, undated or paid after the fourth due date: no quarter, no rate, 0.00."""
    if not prepayment.paid or prepayment.payment_date is None:
        return None, None, _ZERO
    quarter = _quarter(prepayment.payment_date, due)
    if quarter is None:
        return None, None, _ZERO
    rate = params.bonifications[quarter - 1]
    return quarter, rate, cents(prepayment.amount * rate / _HUNDRED)


def compute(
    before_tax: Decimal,
    disallowed: list[DisallowedLine],
    conditions: tuple[bool, bool, bool],
    prepayments: list[Prepayment],
    due: list[date],
    params: Params,
    exempt: bool,
) -> IsocResult:
    by_rubric = {rubric: _ZERO for rubric in IsocRubric}
    for line in disallowed:
        by_rubric[line.rubric] += line.disallowed
    disallowed_total = sum(by_rubric.values(), _ZERO)

    base = max(_ZERO, cents(before_tax + disallowed_total))
    reduced = all(conditions)
    if reduced:
        tax_reduced = cents(min(base, params.reduced_ceiling) * params.reduced_rate / _HUNDRED)
        tax_normal = cents(max(_ZERO, base - params.reduced_ceiling) * params.normal_rate / _HUNDRED)
    else:
        tax_reduced = _ZERO
        tax_normal = cents(base * params.normal_rate / _HUNDRED)
    tax = tax_reduced + tax_normal

    bonifications: list[tuple[int, int | None, Decimal]] = []
    paid_total = _ZERO
    for p in prepayments:
        if not p.paid:
            continue
        paid_total += p.amount
        quarter, _, bonification = attribute(p, due, params)
        bonifications.append((p.number, quarter, bonification))
    bonification_total = sum((b[2] for b in bonifications), _ZERO)

    majoration_gross = cents(tax * params.majoration_rate / _HUNDRED)
    threshold = cents(max(tax * params.threshold_rate / _HUNDRED, params.threshold_min))
    majoration = max(_ZERO, majoration_gross - bonification_total)
    if exempt or majoration < threshold:
        majoration = _ZERO

    estimated_tax = tax + majoration
    return IsocResult(
        before_tax=before_tax,
        disallowed_by_rubric=by_rubric,
        disallowed_total=disallowed_total,
        taxable_base=base,
        reduced=reduced,
        tax_reduced=tax_reduced,
        tax_normal=tax_normal,
        tax=tax,
        majoration_gross=majoration_gross,
        bonifications=bonifications,
        bonification_total=bonification_total,
        threshold=threshold,
        majoration=majoration,
        exempt=exempt,
        paid_total=paid_total,
        balance=estimated_tax - paid_total,
        estimated_tax=estimated_tax,
        after_tax=before_tax - estimated_tax,
    )
