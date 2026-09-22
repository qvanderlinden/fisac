from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from itertools import groupby

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Flow, FlowKind, FlowLine, PaymentMethod
from fisac.schemas import AccountProjection, ProjectionFlow, ProjectionPoint

router = APIRouter(prefix="/api/accounts/{account_id}/projection", tags=["projection"])

_DEFAULT_HORIZON = relativedelta(years=1)
_CENTS = Decimal("0.01")


def _signed(flow: ProjectionFlow) -> Decimal:
    # ProjectionFlow.amount is the unsigned gross magnitude; the sign is
    # applied here, the one place a running balance is computed.
    return flow.amount if flow.kind == FlowKind.REVENUE else -flow.amount


def _day_of_month(year: int, month: int, day: int) -> date:
    # Date overflow rolls into the following month (day 31 of a 30-day month
    # lands on the 1st), which is acceptable for a derived date.
    return date(year, month, 1) + timedelta(days=day - 1)


def _next_day_of_month(reference: date, day: int) -> date:
    # The next occurrence of day-of-month `day` on/after reference - that same
    # month if the day hasn't passed yet, otherwise the next one.
    candidate = _day_of_month(reference.year, reference.month, day)
    if candidate < reference:
        if reference.month == 12:
            candidate = _day_of_month(reference.year + 1, 1, day)
        else:
            candidate = _day_of_month(reference.year, reference.month + 1, day)
    return candidate


def _visa_payment_date(invoice_date: date, visa_day: int, closing_day: int | None) -> date:
    # Two hops: the invoice first lands on a statement (the next closing day
    # on/after invoice_date), and that statement is then settled on the next
    # payment day on/after it. With closing 25 / payment 5, an invoice on
    # Mar 26 closes Apr 25 and is paid May 5; one on Mar 25 closes that day and
    # is paid Apr 5. Mirrors frontend/src/accountingDisplay.ts's
    # visaPaymentDate, overflow rollover included.
    if closing_day is None:
        # No statement cycle configured - the charge is simply debited on the
        # next payment day, exactly as this worked before visa_closing_day
        # existed. Kept as its own single hop rather than folded into the two
        # below (with closing_day = visa_day) so the overflow rollover lands
        # identically for accounts that never set a closing day.
        return _next_day_of_month(invoice_date, visa_day)
    statement_close = _next_day_of_month(invoice_date, closing_day)
    return _next_day_of_month(statement_close, visa_day)


def _effective_payment_date(flow: Flow, account: Account) -> date | None:
    # A Visa flow never stores its own payment_date (ck_flows_no_visa_payment_
    # date) - its effective date for cashflow purposes is derived here instead.
    if flow.payment_date is not None:
        return flow.payment_date
    if flow.payment_method == PaymentMethod.VISA and account.visa_payment_day is not None:
        return _visa_payment_date(
            flow.invoice_date, account.visa_payment_day, account.visa_closing_day
        )
    return None


def _gross(lines: list[FlowLine], reverse_charge: bool = False) -> Decimal:
    total = Decimal("0")
    for line in lines:
        if reverse_charge:
            # Autoliquidation: no VAT is paid to the supplier, so cash = net.
            total += line.amount_net
        else:
            vat = (line.amount_net * line.vat_rate / Decimal("100")).quantize(
                _CENTS, ROUND_HALF_UP
            )
            total += line.amount_net + vat
    return total


@router.get("", response_model=AccountProjection)
async def get_projection(
    to_date: date | None = None,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> AccountProjection:
    # Anchored to today: current_balance is "the balance as of now", so there's
    # no independent start date. A flow already marked paid is assumed already
    # reflected in current_balance, so it's excluded from the running sum - but
    # an unpaid flow still counts even if its payment_date has elapsed (overdue
    # but unpaid), hence including it regardless of date below. Flows with no
    # effective payment date (no payment made) never reach cashflow.
    as_of = date.today()
    range_end = to_date or (as_of + _DEFAULT_HORIZON)

    # Every flow that could have an effective date is loaded (payment_date set,
    # or a Visa flow whose date the projection computes below) - the date-range
    # filtering happens in Python once that effective date is known.
    result = await session.execute(
        select(Flow).where(
            Flow.account_id == account.id,
            or_(Flow.payment_date.is_not(None), Flow.payment_method == PaymentMethod.VISA),
        )
    )
    flows = list(result.scalars().all())

    lines_by_flow: dict[int, list[FlowLine]] = defaultdict(list)
    if flows:
        lines_result = await session.execute(
            select(FlowLine).where(FlowLine.flow_id.in_([f.id for f in flows]))
        )
        for line in lines_result.scalars().all():
            lines_by_flow[line.flow_id].append(line)

    # A flow whose effective date has elapsed but is still unpaid is bucketed
    # at as_of (the chart/table are anchored there), while sort_date keeps its
    # true date so same-bucket flows still list chronologically.
    dated_flows: list[tuple[date, date, ProjectionFlow]] = []
    next_flow_date: date | None = None
    for flow in flows:
        effective_date = _effective_payment_date(flow, account)
        if effective_date is None:
            continue
        if effective_date > range_end:
            if next_flow_date is None or effective_date < next_flow_date:
                next_flow_date = effective_date
            continue
        if effective_date < as_of and flow.paid:
            continue
        dated_flows.append(
            (
                max(effective_date, as_of),
                effective_date,
                ProjectionFlow(
                    id=flow.id,
                    name=flow.name,
                    kind=flow.kind,
                    amount=_gross(lines_by_flow[flow.id], flow.reverse_charge),
                    invoice_date=flow.invoice_date,
                    payment_date=effective_date,
                    payment_method=flow.payment_method,
                    paid=flow.paid,
                ),
            )
        )

    dated_flows.sort(key=lambda triple: (triple[0], triple[1]))
    running_balance = account.current_balance
    points: list[ProjectionPoint] = []
    for day, group in groupby(dated_flows, key=lambda triple: triple[0]):
        day_flows = [flow for _, _, flow in group]
        # Paid flows stay visible in the point but are excluded from the sum.
        running_balance += sum(
            (_signed(f) for f in day_flows if not f.paid), start=Decimal("0")
        )
        points.append(ProjectionPoint(date=day, flows=day_flows, balance=running_balance))

    return AccountProjection(
        as_of=as_of,
        starting_balance=account.current_balance,
        points=points,
        next_flow_date=next_flow_date,
    )
