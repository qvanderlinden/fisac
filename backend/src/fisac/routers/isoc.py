from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import isoc_inputs
from fisac.db import get_session
from fisac.errors import not_found
from fisac.models import FiscalYear, IsocRubric
from fisac.schemas.isoc import IsocRead

router = APIRouter(tags=["isoc"])


def _exempt_reason(loaded: isoc_inputs.IsocYear) -> str:
    if loaded.isoc.exempt:
        return "first_years"
    if not loaded.conditions[0]:
        return "not_small_company"
    if loaded.incorporated_on is None:
        return "no_incorporation_date"
    return "after_first_years"


@router.get("/fiscal-years/{year_id}/isoc", response_model=IsocRead)
async def read_isoc(year_id: int, session: AsyncSession = Depends(get_session)):
    year = await session.get(FiscalYear, year_id)
    if year is None:
        raise not_found("Exercice")
    loaded = await isoc_inputs.load(session, year)
    r, params = loaded.isoc, loaded.params
    lines = sorted(loaded.disallowed, key=lambda line: (line.date, line.reference))
    disallowed = {
        rubric.value: {
            "total": r.disallowed_by_rubric[rubric],
            "lines": [
                {
                    "reference": line.reference, "date": line.date, "label": line.label, "amount": line.base,
                    "deductible_rate": line.deductible_rate, "disallowed": line.disallowed,
                }
                for line in lines
                if line.rubric == rubric
            ],
        }
        for rubric in IsocRubric
    }
    small, minimum_pay, shares_owned = loaded.conditions
    return {
        "before_tax": r.before_tax,
        "disallowed": {"total": r.disallowed_total, **disallowed},
        "taxable_base": r.taxable_base,
        "conditions": {"small_company": small, "minimum_pay": minimum_pay, "shares_owned": shares_owned},
        "reduced": r.reduced,
        "reduced_rate": params.reduced_rate,
        "reduced_ceiling": params.reduced_ceiling,
        "normal_rate": params.normal_rate,
        "tax_reduced": r.tax_reduced,
        "tax_normal": r.tax_normal,
        "tax": r.tax,
        "majoration": {
            "rate": params.majoration_rate,
            "gross": r.majoration_gross,
            "bonification_total": r.bonification_total,
            "threshold": r.threshold,
            "amount": r.majoration,
            "exempt": r.exempt,
            "exempt_reason": _exempt_reason(loaded),
        },
        "prepayments": [asdict(p) for p in loaded.prepayments],
        "paid_total": r.paid_total,
        "balance": r.balance,
        "estimated_tax": r.estimated_tax,
        "after_tax": r.after_tax,
        "assessment_year": loaded.assessment_year,
        "parameters_fallback": loaded.fallback,
    }
