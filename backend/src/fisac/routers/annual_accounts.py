from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Category, Flow, FlowKind, FlowLine, LedgerAccount
from fisac.schemas import (
    AnnualAccounts,
    LedgerAccountTotals,
    LedgerClassTotals,
    PeriodTotals,
    UnassignedTotals,
)

router = APIRouter(
    prefix="/api/accounts/{account_id}/annual-accounts", tags=["annual-accounts"]
)

_CENTS = Decimal("0.01")

PCMN_CLASS_LABELS = {
    1: "Capitaux propres",
    2: "Immobilisés",
    3: "Stocks",
    4: "Créances et dettes",
    5: "Trésorerie",
    6: "Charges",
    7: "Produits",
}


def _line_amount(
    kind: FlowKind, ratio: Decimal, vat_deduction_rate: Decimal, line: FlowLine
) -> Decimal:
    """One line's signed contribution to its ledger account.

    See "Booking amount formula" in the ledger accounts design doc. The
    unrecoverable-VAT factor is applied UNIFORMLY to revenue and expense lines.
    That carries a known, deliberately kept defect - a revenue flow with no
    category books the full gross - which is documented in that doc and must
    not be silently fixed here. Do not add a kind- or class-based condition.
    """
    sign = Decimal("1") if kind == FlowKind.REVENUE else Decimal("-1")
    factor = Decimal("1") + (line.vat_rate / Decimal("100")) * (
        Decimal("1") - vat_deduction_rate / Decimal("100")
    )
    return (line.amount_net * sign * factor * ratio).quantize(_CENTS, ROUND_HALF_UP)


async def _totals_for_year(
    session: AsyncSession, account_id: int, year: int
) -> tuple[dict[int | None, Decimal], int]:
    """Signed total per ledger_account_id (None = unbooked), and how many
    unbooked lines there were.

    Bucketed by invoice_date, not payment_date: this is a fiscal figure, the
    same choice routers/vat.py makes.
    """
    start, end = date(year, 1, 1), date(year, 12, 31)
    result = await session.execute(
        select(Flow).where(
            Flow.account_id == account_id,
            Flow.invoice_date >= start,
            Flow.invoice_date <= end,
        )
    )
    flows = list(result.scalars().all())

    totals: dict[int | None, Decimal] = defaultdict(lambda: Decimal("0"))
    unbooked_lines = 0
    if not flows:
        return totals, unbooked_lines

    lines_result = await session.execute(
        select(FlowLine).where(FlowLine.flow_id.in_([f.id for f in flows]))
    )
    lines_by_flow: dict[int, list[FlowLine]] = defaultdict(list)
    for line in lines_result.scalars().all():
        lines_by_flow[line.flow_id].append(line)

    cat_result = await session.execute(
        select(Category.id, Category.vat_deduction_rate).where(
            Category.account_id == account_id
        )
    )
    vat_rate_by_category: dict[int, Decimal] = dict(cat_result.all())

    for flow in flows:
        # No category recovers no VAT, so all of it is a cost. This mirrors
        # routers/vat.py's expense branch; see the design doc for why it is
        # applied to revenue flows too, and what that costs.
        deduction_rate = (
            vat_rate_by_category.get(flow.category_id, Decimal("0"))
            if flow.category_id is not None
            else Decimal("0")
        )
        for line in lines_by_flow[flow.id]:
            totals[line.ledger_account_id] += _line_amount(
                flow.kind, flow.ratio, deduction_rate, line
            )
            if line.ledger_account_id is None:
                unbooked_lines += 1

    return totals, unbooked_lines


@router.get("", response_model=AnnualAccounts)
async def get_annual_accounts(
    year: int | None = None,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> AnnualAccounts:
    target = year if year is not None else date.today().year
    current, unbooked_current = await _totals_for_year(session, account.id, target)
    prior, _ = await _totals_for_year(session, account.id, target - 1)

    ledger_result = await session.execute(
        select(LedgerAccount)
        .where(LedgerAccount.account_id == account.id)
        .order_by(LedgerAccount.code)
    )
    ledger_accounts = list(ledger_result.scalars().all())

    # Every chart account is returned, including all-zero ones, so the view's
    # "show all accounts" toggle filters client-side without a refetch.
    by_class: dict[int, list[LedgerAccountTotals]] = defaultdict(list)
    for la in ledger_accounts:
        c = current.get(la.id, Decimal("0"))
        p = prior.get(la.id, Decimal("0"))
        by_class[la.pcmn_class].append(
            LedgerAccountTotals(id=la.id, code=la.code, name=la.name, current=c, prior=p, delta=c - p)
        )

    # Descending: a compte de résultats reads produits (7) above charges (6).
    # A class 1-5 group appears if the chart has one - booking there is allowed
    # by the schema, so anything booked stays visible.
    classes = [
        LedgerClassTotals(
            pcmn_class=cls,
            label=PCMN_CLASS_LABELS[cls],
            accounts=rows,
            current_total=sum((r.current for r in rows), Decimal("0")),
            prior_total=sum((r.prior for r in rows), Decimal("0")),
            delta=sum((r.delta for r in rows), Decimal("0")),
        )
        for cls, rows in sorted(by_class.items(), reverse=True)
    ]

    uc = current.get(None, Decimal("0"))
    up = prior.get(None, Decimal("0"))
    unassigned = UnassignedTotals(
        current=uc, prior=up, delta=uc - up, line_count=unbooked_current
    )

    # Sums every class plus the unassigned bucket, so no grouping decision can
    # quietly keep something out of the bottom line.
    rc = sum((c.current_total for c in classes), Decimal("0")) + uc
    rp = sum((c.prior_total for c in classes), Decimal("0")) + up
    return AnnualAccounts(
        year=target,
        classes=classes,
        unassigned=unassigned,
        result=PeriodTotals(current=rc, prior=rp, delta=rc - rp),
    )
