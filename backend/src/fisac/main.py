import os
from pathlib import Path

from fastapi import FastAPI

app = FastAPI(title="fisac")

# The API of the Compta simplifiée model is not written yet: routers will be
# mounted here as each screen gets its endpoints.

# Only present inside the built container image (see Dockerfile).
# Guarded so local `uvicorn --reload` (no frontend build present) still starts.
dist_dir = Path(os.getenv("FRONTEND_DIST_DIR", "/app/dist"))
if dist_dir.exists():
    app.frontend("/", directory=dist_dir, fallback="index.html")
