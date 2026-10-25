import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI

from fisac.auth import auth
from fisac.errors import ApiError, api_error_handler
from fisac.routers import (
    categories,
    company,
    depreciation_models,
    financial_accounts,
    fixed_assets,
    fiscal_years,
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
async def lifespan(app: FastAPI):
    # Refuse to start rather than answer every call with a 401.
    auth.check()
    yield


app = FastAPI(title="fisac", lifespan=lifespan)
app.add_exception_handler(ApiError, api_error_handler)
auth.install(app)

# Routers declare their paths without /api; each is mounted here as its
# screen gets its endpoints, behind the signed-in user (see auth.py).
AUTH = [Depends(auth.current_user)]
app.include_router(auth.router, prefix="/api/auth")
app.include_router(company.router, prefix="/api", dependencies=AUTH)
app.include_router(financial_accounts.router, prefix="/api", dependencies=AUTH)
app.include_router(fiscal_years.router, prefix="/api", dependencies=AUTH)
app.include_router(partners.router, prefix="/api", dependencies=AUTH)
app.include_router(payment_methods.router, prefix="/api", dependencies=AUTH)
app.include_router(third_parties.router, prefix="/api", dependencies=AUTH)
app.include_router(vat_schemes.router, prefix="/api", dependencies=AUTH)
app.include_router(isoc_schemes.router, prefix="/api", dependencies=AUTH)
app.include_router(depreciation_models.router, prefix="/api", dependencies=AUTH)
app.include_router(categories.router, prefix="/api", dependencies=AUTH)
app.include_router(sales.router, prefix="/api", dependencies=AUTH)
app.include_router(purchases.router, prefix="/api", dependencies=AUTH)
app.include_router(fixed_assets.router, prefix="/api", dependencies=AUTH)
app.include_router(journals.router, prefix="/api", dependencies=AUTH)
app.include_router(vat_periods.router, prefix="/api", dependencies=AUTH)
app.include_router(result.router, prefix="/api", dependencies=AUTH)

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
