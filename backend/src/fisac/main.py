import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI

from fisac.auth import check_auth_config, require_user
from fisac.errors import ApiError, api_error_handler
from fisac.routers import (
    categories,
    company,
    depreciation_models,
    financial_accounts,
    fixed_assets,
    fiscal_years,
    isoc,
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    check_auth_config()
    yield


app = FastAPI(title="fisac", lifespan=lifespan)
app.add_exception_handler(ApiError, api_error_handler)

# Routers declare their paths without /api; each is mounted here as its
# screen gets its endpoints, behind the one check every /api route goes through.
api = APIRouter(prefix="/api", dependencies=[Depends(require_user)])
api.include_router(company.router)
api.include_router(financial_accounts.router)
api.include_router(fiscal_years.router)
api.include_router(partners.router)
api.include_router(payment_methods.router)
api.include_router(third_parties.router)
api.include_router(vat_schemes.router)
api.include_router(isoc_schemes.router)
api.include_router(depreciation_models.router)
api.include_router(categories.router)
api.include_router(sales.router)
api.include_router(purchases.router)
api.include_router(fixed_assets.router)
api.include_router(journals.router)
api.include_router(vat_periods.router)
api.include_router(result.router)
api.include_router(isoc_prepayments.router)
api.include_router(isoc.router)
app.include_router(api)

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
