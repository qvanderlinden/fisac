from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.config import settings
from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.fractional_index import key_between
from fisac.llm import generate_schedule
from fisac.models import Account, Category, Flow, FlowKind, FlowLine
from fisac.ordering import move_sort_key, next_sort_key
from fisac.schemas import (
    FlowBulkCreate,
    FlowBulkDelete,
    FlowBulkUpdate,
    FlowCreate,
    FlowGenerateRequest,
    FlowGenerateResponse,
    FlowLineCreate,
    FlowLineRead,
    FlowPaidSet,
    FlowRead,
    FlowUpdate,
    MoveRequest,
)

router = APIRouter(prefix="/api/accounts/{account_id}/flows", tags=["flows"])

_CENTS = Decimal("0.01")


def _line_vat(line: FlowLine) -> Decimal:
    return (line.amount_net * line.vat_rate / Decimal("100")).quantize(_CENTS, ROUND_HALF_UP)


def _serialize(flow: Flow, lines: list[FlowLine]) -> FlowRead:
    net = sum((line.amount_net for line in lines), Decimal("0"))
    vat = sum((_line_vat(line) for line in lines), Decimal("0"))
    # Reverse charge (autoliquidation): no VAT is paid to the supplier, so the
    # cash gross is just the net. amount_vat still reports the notional VAT (used
    # by the VAT report's self-assessment).
    gross = net if flow.reverse_charge else net + vat
    return FlowRead(
        id=flow.id,
        account_id=flow.account_id,
        name=flow.name,
        kind=flow.kind,
        category_id=flow.category_id,
        invoice_date=flow.invoice_date,
        payment_date=flow.payment_date,
        payment_method=flow.payment_method,
        paid=flow.paid,
        batch_id=flow.batch_id,
        reverse_charge=flow.reverse_charge,
        sort_key=flow.sort_key,
        lines=[FlowLineRead.model_validate(line) for line in lines],
        amount_net=net,
        amount_vat=vat,
        amount_gross=gross,
    )


def _line_sort_keys(count: int) -> list[str]:
    """Ascending fractional-index keys so lines keep their submitted order."""
    keys: list[str] = []
    prev: str | None = None
    for _ in range(count):
        prev = key_between(prev, None)
        keys.append(prev)
    return keys


async def _load_lines(session: AsyncSession, flow_id: int) -> list[FlowLine]:
    result = await session.execute(
        select(FlowLine).where(FlowLine.flow_id == flow_id).order_by(FlowLine.sort_key)
    )
    return list(result.scalars().all())


async def _validate_category(session: AsyncSession, account_id: int, category_id: int | None) -> None:
    if category_id is None:
        return
    category = await session.get(Category, category_id)
    if category is None or category.account_id != account_id:
        raise HTTPException(status_code=400, detail="Invalid category for this account")


def _add_lines(session: AsyncSession, flow_id: int, lines: list[FlowLineCreate]) -> None:
    for payload, sort_key in zip(lines, _line_sort_keys(len(lines))):
        session.add(
            FlowLine(
                flow_id=flow_id,
                description=payload.description,
                amount_net=payload.amount_net,
                vat_rate=payload.vat_rate,
                sort_key=sort_key,
            )
        )


async def _get_flow(
    flow_id: int,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> Flow:
    flow = await session.get(Flow, flow_id)
    if flow is None or flow.account_id != account.id:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.get("", response_model=list[FlowRead])
async def list_flows(
    kind: FlowKind | None = None,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[FlowRead]:
    query = select(Flow).where(Flow.account_id == account.id)
    if kind is not None:
        query = query.where(Flow.kind == kind)
    flows = list((await session.execute(query.order_by(Flow.sort_key))).scalars().all())

    lines_by_flow: dict[int, list[FlowLine]] = defaultdict(list)
    if flows:
        lines_result = await session.execute(
            select(FlowLine)
            .where(FlowLine.flow_id.in_([f.id for f in flows]))
            .order_by(FlowLine.sort_key)
        )
        for line in lines_result.scalars().all():
            lines_by_flow[line.flow_id].append(line)

    return [_serialize(flow, lines_by_flow[flow.id]) for flow in flows]


# Registered before the /{flow_id} routes so the literal segments can never be
# captured as a flow id.
@router.post("/generate", response_model=FlowGenerateResponse)
async def generate_flows(
    payload: FlowGenerateRequest,
    account: Account = Depends(get_account),  # noqa: ARG001 - 404s unknown accounts
) -> FlowGenerateResponse:
    # No DB writes: the LLM proposes a schedule (period-aware names + dates),
    # the frontend merges it with the user's template and only the approved
    # result comes back through /bulk.
    occurrences, provider = await generate_schedule(payload.description)
    return FlowGenerateResponse(
        occurrences=occurrences, model=settings.openrouter_model, provider=provider
    )


@router.post("/bulk", response_model=list[FlowRead], status_code=201)
async def create_flows_bulk(
    payload: FlowBulkCreate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[FlowRead]:
    for item in payload.flows:
        await _validate_category(session, account.id, item.category_id)
    # One transaction for the whole batch; ascending sort keys chained after
    # the account's current last flow (same idiom as _line_sort_keys).
    sort_key = await next_sort_key(session, Flow, Flow.account_id == account.id)
    batch_id = str(uuid4())
    created: list[Flow] = []
    for item in payload.flows:
        flow = Flow(
            account_id=account.id,
            name=item.name,
            kind=item.kind,
            category_id=item.category_id,
            invoice_date=item.invoice_date,
            payment_date=item.payment_date,
            payment_method=item.payment_method,
            paid=item.paid,
            reverse_charge=item.reverse_charge,
            batch_id=batch_id,
            sort_key=sort_key,
        )
        session.add(flow)
        await session.flush()
        _add_lines(session, flow.id, item.lines)
        created.append(flow)
        sort_key = key_between(sort_key, None)
    await session.commit()
    return [_serialize(flow, await _load_lines(session, flow.id)) for flow in created]


@router.patch("/bulk", response_model=list[FlowRead])
async def update_flows_bulk(
    payload: FlowBulkUpdate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[FlowRead]:
    # Only fields the caller actually sent are applied; presence (not value)
    # decides, so category_id/payment_method can be explicitly cleared to None.
    fields = payload.model_fields_set

    if "category_id" in fields:
        await _validate_category(session, account.id, payload.category_id)

    result = await session.execute(
        select(Flow).where(Flow.account_id == account.id, Flow.id.in_(payload.flow_ids))
    )
    flows = list(result.scalars().all())
    missing = set(payload.flow_ids) - {flow.id for flow in flows}
    if missing:
        raise HTTPException(status_code=404, detail=f"Flows not found: {sorted(missing)}")

    replace_lines = "amount_net" in fields and payload.amount_net is not None
    new_line = (
        FlowLineCreate(
            amount_net=payload.amount_net,
            vat_rate=payload.vat_rate if payload.vat_rate is not None else Decimal("0"),
        )
        if replace_lines
        else None
    )

    for flow in flows:
        if "category_id" in fields:
            flow.category_id = payload.category_id
        if "payment_method" in fields:
            flow.payment_method = payload.payment_method
            # No method means no payment is made, so no payment_date can remain
            # (mirrors ck_flows_no_method_no_payment_date).
            if payload.payment_method is None:
                flow.payment_date = None
        if "paid" in fields:
            flow.paid = payload.paid
        if "reverse_charge" in fields:
            flow.reverse_charge = payload.reverse_charge
        if new_line is not None:
            await session.execute(delete(FlowLine).where(FlowLine.flow_id == flow.id))
            _add_lines(session, flow.id, [new_line])

    await session.commit()
    return [_serialize(flow, await _load_lines(session, flow.id)) for flow in flows]


@router.delete("/bulk", status_code=204)
async def delete_flows_bulk(
    payload: FlowBulkDelete,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> None:
    # One transaction for the whole selection; lines go with their flows via the
    # FK's ON DELETE CASCADE. Scoped to this account so ids from another account
    # are silently ignored rather than deleted.
    await session.execute(
        delete(Flow).where(Flow.account_id == account.id, Flow.id.in_(payload.flow_ids))
    )
    await session.commit()


@router.delete("/batch/{batch_id}", status_code=204)
async def delete_flow_batch(
    batch_id: str,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Lines go with their flows via the FK's ON DELETE CASCADE.
    result = await session.execute(
        delete(Flow).where(Flow.account_id == account.id, Flow.batch_id == batch_id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Batch not found")
    await session.commit()


@router.get("/{flow_id}", response_model=FlowRead)
async def get_flow(
    flow: Flow = Depends(_get_flow),
    session: AsyncSession = Depends(get_session),
) -> FlowRead:
    return _serialize(flow, await _load_lines(session, flow.id))


@router.post("", response_model=FlowRead, status_code=201)
async def create_flow(
    payload: FlowCreate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> FlowRead:
    await _validate_category(session, account.id, payload.category_id)
    sort_key = await next_sort_key(session, Flow, Flow.account_id == account.id)
    flow = Flow(
        account_id=account.id,
        name=payload.name,
        kind=payload.kind,
        category_id=payload.category_id,
        invoice_date=payload.invoice_date,
        payment_date=payload.payment_date,
        payment_method=payload.payment_method,
        paid=payload.paid,
        reverse_charge=payload.reverse_charge,
        sort_key=sort_key,
    )
    session.add(flow)
    await session.flush()
    _add_lines(session, flow.id, payload.lines)
    await session.commit()
    return _serialize(flow, await _load_lines(session, flow.id))


@router.patch("/{flow_id}", response_model=FlowRead)
async def update_flow(
    payload: FlowUpdate,
    flow: Flow = Depends(_get_flow),
    session: AsyncSession = Depends(get_session),
) -> FlowRead:
    await _validate_category(session, flow.account_id, payload.category_id)
    flow.name = payload.name
    flow.kind = payload.kind
    flow.category_id = payload.category_id
    flow.invoice_date = payload.invoice_date
    flow.payment_date = payload.payment_date
    flow.payment_method = payload.payment_method
    flow.paid = payload.paid
    flow.reverse_charge = payload.reverse_charge
    # Full replace of the line set.
    await session.execute(delete(FlowLine).where(FlowLine.flow_id == flow.id))
    _add_lines(session, flow.id, payload.lines)
    await session.commit()
    return _serialize(flow, await _load_lines(session, flow.id))


@router.patch("/{flow_id}/paid", response_model=FlowRead)
async def set_flow_paid(
    payload: FlowPaidSet,
    flow: Flow = Depends(_get_flow),
    session: AsyncSession = Depends(get_session),
) -> FlowRead:
    flow.paid = payload.paid
    await session.commit()
    return _serialize(flow, await _load_lines(session, flow.id))


@router.patch("/{flow_id}/move", response_model=FlowRead)
async def move_flow(
    payload: MoveRequest,
    flow: Flow = Depends(_get_flow),
    session: AsyncSession = Depends(get_session),
) -> FlowRead:
    flow.sort_key = await move_sort_key(session, Flow, payload.after_id, payload.before_id)
    await session.commit()
    return _serialize(flow, await _load_lines(session, flow.id))


@router.delete("/{flow_id}", status_code=204)
async def delete_flow(
    flow: Flow = Depends(_get_flow),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(flow)
    await session.commit()
