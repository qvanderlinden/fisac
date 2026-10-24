from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# Constraint name -> (field, message): what a check or unique violation says
# to the form that sent it.
CONSTRAINT_MESSAGES: dict[str, tuple[str, str]] = {
    "ck_company_fiscal_year_start_month_range": ("fiscal_year_start_month", "Un mois de 1 à 12"),
    "ck_partners_shares_positive": ("shares", "Un nombre entier de parts"),
    "ck_partners_contribution_positive": ("contribution", "Un montant positif"),
    "uq_vat_schemes_label": ("label", "Ce libellé existe déjà"),
    "uq_isoc_schemes_label": ("label", "Ce libellé existe déjà"),
    "uq_depreciation_models_label": ("label", "Ce libellé existe déjà"),
    "uq_categories_label": ("label", "Ce libellé existe déjà"),
    "uq_fixed_assets_purchase_line": ("purchase_line_id", "Cette ligne est déjà au registre"),
    "ck_isoc_prepayments_paid_has_date": ("payment_date", "Une date de paiement est requise"),
    "ck_isoc_prepayments_amount_positive": ("amount", "Un montant positif"),
    "ck_vat_schemes_rate_range": ("rate", "Un taux de 0 à 100 %"),
    "ck_vat_schemes_recoverable_rate_range": ("recoverable_rate", "Un taux de 0 à 100 %"),
    "ck_vat_schemes_some_side": ("for_sales", "Proposé sur les ventes, les achats ou les deux"),
    "ck_vat_schemes_recoverable_iff_purchases": (
        "recoverable_rate",
        "La part récupérable se donne pour les achats, et seulement pour eux",
    ),
    "ck_isoc_schemes_deductible_rate_range": ("deductible_rate", "Un taux de 0 à 100 %"),
    "ck_depreciation_models_years_range": ("years", "De 1 à 50 ans"),
    "ck_payment_methods_card_statement": (
        "statement_closing_day",
        "Une carte a un jour de clôture et un jour de paiement",
    ),
    "ck_payment_methods_closing_day_range": ("statement_closing_day", "Un jour de 1 à 31"),
    "ck_payment_methods_payment_day_range": ("statement_payment_day", "Un jour de 1 à 31"),
}


class ApiError(HTTPException):
    """An HTTPException whose body carries extra top-level fields (`code`, ...)."""

    def __init__(self, status_code: int, detail, **extra) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.extra = extra


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        {"detail": exc.detail, **exc.extra}, status_code=exc.status_code, headers=exc.headers
    )


def not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} introuvable")


def in_use(uses: int, detail: str | None = None) -> HTTPException:
    if detail is None:
        detail = f"Porté par {uses} pièce(s) : impossible de le supprimer"
    return ApiError(409, detail, code="in_use", uses=uses)


def conflict(code: str, detail: str) -> HTTPException:
    return ApiError(409, detail, code=code)


def field_error(field: str, msg: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=[{"loc": ["body", field], "msg": msg, "type": "value_error"}],
    )


async def commit(session: AsyncSession) -> None:
    """Commit, turning database constraint violations into API errors."""
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        driver = getattr(exc.orig, "__cause__", None)
        sqlstate = getattr(driver, "sqlstate", None)
        name = getattr(driver, "constraint_name", None)
        if sqlstate == "23503":
            raise in_use(0, "Utilisé par d'autres données") from exc
        field, msg = CONSTRAINT_MESSAGES.get(name, ("__root__", name))
        raise field_error(field, msg) from exc
