import os
from pathlib import Path

from fastapi import FastAPI

from fisac.errors import ApiError, api_error_handler
from fisac.routers import (
    categories,
    company,
    depreciation_models,
    financial_accounts,
    fixed_assets,
    fiscal_years,
    isoc_prepayments,
    isoc_schemes,
    journals,
    partners,
    payment_methods,
    purchases,
    result,
    sales,
    third_parties,
    vat_periods,
    vat_schemes,
)

app = FastAPI(title="fisac")
app.add_exception_handler(ApiError, api_error_handler)

# Routers declare their paths without /api; each is mounted here as its
# screen gets its endpoints.
app.include_router(company.router, prefix="/api")
app.include_router(financial_accounts.router, prefix="/api")
app.include_router(fiscal_years.router, prefix="/api")
app.include_router(partners.router, prefix="/api")
app.include_router(payment_methods.router, prefix="/api")
app.include_router(third_parties.router, prefix="/api")
app.include_router(vat_schemes.router, prefix="/api")
app.include_router(isoc_schemes.router, prefix="/api")
app.include_router(depreciation_models.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(purchases.router, prefix="/api")
app.include_router(fixed_assets.router, prefix="/api")
app.include_router(journals.router, prefix="/api")
app.include_router(vat_periods.router, prefix="/api")
app.include_router(result.router, prefix="/api")
app.include_router(isoc_prepayments.router, prefix="/api")

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
