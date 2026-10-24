"""Loads a fiscal year's ISOC: the result, the disallowed lines, the advance payments.

Shared by the ISOC and result reads so the two never disagree.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.books import isoc, isoc_params, result
from fisac.books.amounts import sign
from fisac.models import (
    Category,
    Company,
    FiscalYear,
    FixedAsset,
    FixedAssetDepreciation,
    IsocPrepayment,
    IsocRubric,
    IsocScheme,
    Purchase,
    PurchaseLine,
)

_ZERO = Decimal("0.00")  # adding it turns the -0.00 of a credit note on nothing into 0.00
_FULL = (Decimal(100), IsocRubric.OTHER)


@dataclass(frozen=True)
class PrepaymentView:
    """One advance payment as the ISOC read shows it, paid or not."""

    id: int | None  # None: the row is not created yet (an unpaid zero VA)
    number: int
    due_date: date
    amount: Decimal
    payment_method_id: int | None
    paid: bool
    payment_date: date | None
    quarter: int | None
    bonification_rate: Decimal | None
    bonification: Decimal


@dataclass(frozen=True)
class IsocYear:
    book: result.Result
    disallowed: list[isoc.DisallowedLine]
    conditions: tuple[bool, bool, bool]
    prepayments: list[PrepaymentView]
    assessment_year: int  # isoc_params.assessment_year of the fiscal year's end
    params: isoc_params.Params  # that year's, or the latest known (fallback)
    fallback: bool
    incorporated_on: date | None
    isoc: isoc.IsocResult


async def _schemes(session: AsyncSession) -> dict[int | None, tuple[Decimal, IsocRubric]]:
    """Deductible rate and rubric by scheme id; None (no scheme) reads as "100 %"."""
    out: dict[int | None, tuple[Decimal, IsocRubric]] = {None: _FULL}
    for scheme in await session.scalars(select(IsocScheme)):
        out[scheme.id] = (scheme.deductible_rate, scheme.rubric)
        if scheme.label == pieces.FULL_DEDUCTION_LABEL:
            out[None] = out[scheme.id]
    return out


async def _prepayments(
    session: AsyncSession, year_id: int, due: list[date], params: isoc_params.Params
) -> list[PrepaymentView]:
    """The stored VAs with their attribution, a missing one read as an unpaid zero VA; never writes."""
    rows = {
        row.number: row
        for row in await session.scalars(select(IsocPrepayment).where(IsocPrepayment.fiscal_year_id == year_id))
    }
    out = []
    for number, due_date in enumerate(due, start=1):
        row = rows.get(number)
        prepayment = isoc.Prepayment(
            number, row.amount if row else _ZERO, row.paid if row else False, row.payment_date if row else None
        )
        quarter, rate, bonification = isoc.attribute(prepayment, due, params)
        out.append(PrepaymentView(
            id=row.id if row else None,
            number=number,
            due_date=row.due_date if row else due_date,
            amount=prepayment.amount,
            payment_method_id=row.payment_method_id if row else None,
            paid=prepayment.paid,
            payment_date=prepayment.payment_date,
            quarter=quarter,
            bonification_rate=rate,
            bonification=bonification,
        ))
    return out


async def load(session: AsyncSession, fiscal_year: FiscalYear) -> IsocYear:
    year_id, start, end = fiscal_year.id, fiscal_year.start_date, fiscal_year.end_date
    conditions = (fiscal_year.isoc_small_company, fiscal_year.isoc_minimum_pay, fiscal_year.isoc_shares_owned)
    # A read never writes: no company row yet reads as its defaults
    company = await session.get(Company, 1)
    start_month = company.fiscal_year_start_month if company else 1
    incorporated_on = company.incorporated_on if company else None
    assessment_year = isoc_params.assessment_year(end)
    params, fallback = isoc_params.params_for(assessment_year)
    due = isoc_params.due_dates(start)
    prepayments = await _prepayments(session, year_id, due, params)
    schemes = await _schemes(session)
    labels = {c.id: c.label for c in await session.scalars(select(Category))}

    disallowed: list[isoc.DisallowedLine] = []
    built: dict[str, list[result.ResultLine]] = {"sales": [], "purchases": []}
    for spec, prefix, key in ((pieces.SALES, "S", "sales"), (pieces.PURCHASES, "A", "purchases")):
        for read in await pieces.read_pieces(session, spec, spec.piece.fiscal_year_id == year_id):
            s = sign(read["kind"])  # reads are unsigned: the kind carries the sign, applied once here
            reference = pieces.reference(prefix, read["number"], 4)
            for line in read["lines"]:
                if spec.purchase and line["fixed_asset_id"] is not None:
                    continue  # the asset's depreciation counts instead
                amount = s * (line["charge"] if spec.purchase else line["net"]) + _ZERO
                built[key].append(result.ResultLine(
                    line["category_id"], labels[line["category_id"]], read["id"], reference,
                    read["booking_date"], read["third_party_name"], amount,
                ))
                if spec.purchase:
                    rate, rubric = schemes.get(line["isoc_scheme_id"], _FULL)
                    if rate < 100:
                        disallowed.append(isoc.DisallowedLine(
                            rubric, reference, read["booking_date"], read["third_party_name"] or "",
                            amount, rate, isoc.disallowed_part(amount, rate), piece_id=read["id"],
                        ))

    assets = await session.execute(
        select(
            FixedAsset.id, FixedAsset.number, FixedAsset.description, FixedAssetDepreciation.amount,
            PurchaseLine.isoc_scheme_id,
            func.coalesce(Purchase.booking_date, Purchase.document_date).label("acquired_on"),
        )
        .join(FixedAssetDepreciation, FixedAssetDepreciation.fixed_asset_id == FixedAsset.id)
        .join(PurchaseLine, PurchaseLine.id == FixedAsset.purchase_line_id)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(FixedAssetDepreciation.year == end.year)
    )
    depreciation = []
    for asset_id, number, description, amount, scheme_id, acquired_on in assets:
        reference = pieces.reference("I", number, 3)
        depreciation.append(result.AssetDepreciation(asset_id, reference, description, amount))
        rate, rubric = schemes.get(scheme_id, _FULL)
        if rate < 100:
            disallowed.append(isoc.DisallowedLine(
                rubric, reference, acquired_on, description, amount, rate, isoc.disallowed_part(amount, rate),
                asset_id=asset_id,
            ))
    book = result.compute(built["sales"], built["purchases"], depreciation)

    exempt = isoc.is_exempt(conditions[0], incorporated_on, start, start_month)
    inputs = [isoc.Prepayment(p.number, p.amount, p.paid, p.payment_date) for p in prepayments]
    computed = isoc.compute(book.result, disallowed, conditions, inputs, due, params, exempt)
    return IsocYear(
        book, disallowed, conditions, prepayments, assessment_year, params, fallback, incorporated_on, computed
    )
