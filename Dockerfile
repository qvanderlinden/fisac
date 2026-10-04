# syntax=docker/dockerfile:1.10

FROM node:22-slim AS frontend-build
WORKDIR /src
# .npmrc maps @qvanderlinden to GitHub Packages and reads NODE_AUTH_TOKEN.
# The token is a build secret, mounted as an env var for this one step only,
# so it never lands in a layer (secret env mounts need dockerfile:1.10+). The
# secret id is the variable's own name, which is what Coolify's build secrets
# pass (--secret id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN).
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim AS backend-build
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /uvx /usr/local/bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
# backend/ holds the package source (pyproject points hatchling at
# backend/src/fisac), so it has to be in place before uv builds the project.
COPY backend/ ./backend/
RUN uv sync --frozen --no-dev

FROM python:3.14-slim AS final
WORKDIR /app
COPY --from=backend-build /app/.venv /app/.venv
# Same path as in backend-build: the venv holds an editable install pointing
# at /app/backend/src, so moving this would break the import.
COPY --from=backend-build /app/backend /app/backend
COPY --from=frontend-build /src/dist /app/dist
ENV PATH="/app/.venv/bin:${PATH}" \
    FRONTEND_DIST_DIR=/app/dist
EXPOSE 8000
# Migrations are applied on every container start, then uvicorn serves both
# the built frontend and /api/*.
CMD ["sh", "-c", "cd /app/backend && alembic upgrade head && cd /app && uvicorn fisac.main:app --host 0.0.0.0 --port 8000"]
