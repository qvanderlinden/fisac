import os
from pathlib import Path

from fastapi import FastAPI

from fisac.routers import accounts, categories, flows, projection, vat

app = FastAPI(title="fisac")

app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(flows.router)
app.include_router(projection.router)
app.include_router(vat.router)

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
