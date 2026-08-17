from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from itertools import groupby

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Flow, FlowKind, FlowLine
from fisac.schemas import AccountProjection, ProjectionFlow, ProjectionPoint

router = APIRouter(prefix="/api/accounts/{account_id}/projection", tags=["projection"])

_DEFAULT_HORIZON = relativedelta(years=1)
_CENTS = Decimal("0.01")


def _signed(flow: ProjectionFlow) -> Decimal:
    # ProjectionFlow.amount is the unsigned gross magnitude; the sign is
    # applied here, the one place a running balance is computed.
    return flow.amount if flow.kind == FlowKind.REVENUE else -flow.amount


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
    # but unpaid), hence OR'ing in unpaid regardless of date. Flows with a NULL
    # payment_date (no payment made) never reach cashflow.
    as_of = date.today()
    range_end = to_date or (as_of + _DEFAULT_HORIZON)

    result = await session.execute(
        select(Flow).where(
            Flow.account_id == account.id,
            Flow.payment_date.is_not(None),
            Flow.payment_date <= range_end,
            or_(Flow.payment_date >= as_of, Flow.paid.is_(False)),
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

    # A flow whose payment_date has elapsed but is still unpaid is bucketed at
    # as_of (the chart/table are anchored there), while sort_date keeps its true
    # date so same-bucket flows still list chronologically.
    dated_flows: list[tuple[date, date, ProjectionFlow]] = []
    for flow in flows:
        assert flow.payment_date is not None  # guaranteed by the query filter
        dated_flows.append(
            (
                max(flow.payment_date, as_of),
                flow.payment_date,
                ProjectionFlow(
                    id=flow.id,
                    name=flow.name,
                    kind=flow.kind,
                    amount=_gross(lines_by_flow[flow.id], flow.reverse_charge),
                    invoice_date=flow.invoice_date,
                    payment_date=flow.payment_date,
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

    return AccountProjection(as_of=as_of, starting_balance=account.current_balance, points=points)
