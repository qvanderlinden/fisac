import os
from pathlib import Path

from fastapi import FastAPI

from fisac.errors import ApiError, api_error_handler
from fisac.routers import company, financial_accounts, fiscal_years, partners

app = FastAPI(title="fisac")
app.add_exception_handler(ApiError, api_error_handler)

# Routers declare their paths without /api; each is mounted here as its
# screen gets its endpoints.
app.include_router(company.router, prefix="/api")
app.include_router(financial_accounts.router, prefix="/api")
app.include_router(fiscal_years.router, prefix="/api")
app.include_router(partners.router, prefix="/api")

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
