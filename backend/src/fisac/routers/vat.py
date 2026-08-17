from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Category, Flow, FlowKind, FlowLine
from fisac.schemas import AccountVat, VatFlow, VatQuarter

router = APIRouter(prefix="/api/accounts/{account_id}/vat", tags=["vat"])

_CENTS = Decimal("0.01")


def _flow_vat(lines: list[FlowLine]) -> Decimal:
    # Same per-line rounding as flows._line_vat / projection._gross, so quarter
    # totals reconcile with each flow's FlowRead.amount_vat.
    total = Decimal("0")
    for line in lines:
        total += (line.amount_net * line.vat_rate / Decimal("100")).quantize(_CENTS, ROUND_HALF_UP)
    return total


@router.get("", response_model=AccountVat)
async def get_vat_estimate(
    year: int | None = None,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> AccountVat:
    # VAT is a fiscal figure, so flows are bucketed by invoice_date (not
    # payment_date, which drives cashflow) into calendar quarters of one year.
    target_year = year if year is not None else date.today().year
    start, end = date(target_year, 1, 1), date(target_year, 12, 31)

    result = await session.execute(
        select(Flow).where(
            Flow.account_id == account.id,
            Flow.invoice_date >= start,
            Flow.invoice_date <= end,
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

    # Recoverable share of input VAT per category (0-100). An expense with no
    # category recovers nothing.
    cat_result = await session.execute(
        select(Category.id, Category.vat_deduction_rate).where(Category.account_id == account.id)
    )
    vat_rate_by_category: dict[int, Decimal] = dict(cat_result.all())

    output = [Decimal("0")] * 4  # per quarter (index 0 = Q1)
    deductible = [Decimal("0")] * 4
    flows_by_quarter: list[list[VatFlow]] = [[], [], [], []]

    for flow in flows:
        lines = lines_by_flow[flow.id]
        q = (flow.invoice_date.month - 1) // 3  # 0-3
        gross_vat = _flow_vat(lines)
        rates = {line.vat_rate for line in lines}
        uniform_rate = next(iter(rates)) if len(rates) == 1 else None
        out = Decimal("0")
        ded = Decimal("0")
        if flow.kind == FlowKind.REVENUE:
            # Output VAT is always fully owed (the category rate is input-only).
            out = gross_vat
            deduction_rate = Decimal("100")
        else:
            deduction_rate = (
                vat_rate_by_category.get(flow.category_id, Decimal("0"))
                if flow.category_id is not None
                else Decimal("0")
            )
            ded = (gross_vat * deduction_rate / Decimal("100")).quantize(_CENTS, ROUND_HALF_UP)
            if flow.reverse_charge:
                # Autoliquidation: self-assess the notional VAT as output too, so
                # a fully deductible reverse-charge purchase nets to zero and a
                # partly deductible one leaves the non-deductible slice owed.
                out = gross_vat
        output[q] += out
        deductible[q] += ded
        flows_by_quarter[q].append(
            VatFlow(
                id=flow.id,
                name=flow.name,
                kind=flow.kind,
                invoice_date=flow.invoice_date,
                output_vat=out.quantize(_CENTS),
                deductible_vat=ded.quantize(_CENTS),
                reverse_charge=flow.reverse_charge,
                gross_vat=gross_vat.quantize(_CENTS),
                deduction_rate=deduction_rate.quantize(_CENTS),
                vat_rate=uniform_rate,
            )
        )

    quarters: list[VatQuarter] = []
    total_net = Decimal("0")
    for i in range(4):
        net = output[i] - deductible[i]
        total_net += net
        flows_by_quarter[i].sort(key=lambda f: f.invoice_date)
        quarters.append(
            VatQuarter(
                quarter=i + 1,
                label=f"Q{i + 1} {target_year}",
                # Quantize so empty quarters still serialize as "0.00".
                output_vat=output[i].quantize(_CENTS),
                deductible_vat=deductible[i].quantize(_CENTS),
                net_due=net.quantize(_CENTS),
                flows=flows_by_quarter[i],
            )
        )

    return AccountVat(
        year=target_year,
        vat_applicable=account.vat_applicable,
        total_net_due=total_net.quantize(_CENTS),
        quarters=quarters,
    )
