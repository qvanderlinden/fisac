# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**fisac** — a single personal accounting app: accounts, categorised revenue
and expense flows with invoice lines, VAT reporting per quarter, and a balance
projection over time.

Stack: FastAPI backend on Python 3.14 (`requires-python = ">=3.14"` in
`pyproject.toml`, pinned via `.python-version`), React + Vite frontend
(PWA-capable via vite-plugin-pwa), Postgres via SQLAlchemy 2.x async + asyncpg
+ Alembic, uv for Python deps.

There is no linter, type checker, or test suite configured for the Python side.
The frontend is typechecked by `tsc -b` as part of `npm run build`.

## Layout

```
fisac/
  frontend/              # React + Vite, own package.json
    src/
  backend/
    alembic.ini
    migrations/
    src/fisac/           # FastAPI app; main.py mounts routers + frontend
      routers/
  scripts/
    init-postgres.sh     # role + schema bootstrap SQL
  Dockerfile              # multi-stage: frontend build -> uv sync -> final
  pyproject.toml         # the single Python project (name = "fisac")
  uv.lock
```

**The Python project root is `pyproject.toml` at the repo root, but the package
source lives at `backend/src/fisac/`** — hatchling is pointed there via
`[tool.hatch.build.targets.wheel] packages = ["backend/src/fisac"]`. So
`uv run` works from anywhere in the repo, and the venv holds an editable
install resolving to `backend/src`. The Dockerfile's final stage copies
`backend/` to the identical path it had at build time (`/app/backend`) for
exactly this reason — relocating it silently breaks the import.

The container runs one uvicorn process serving both the built React static
assets (via FastAPI's `app.frontend()` — note: this requires the FastAPI
version pinned here, `>=0.138`; it is not a universally available method) and
the `/api/*` routes. `main.py` guards the frontend mount with
`if dist_dir.exists()`, since `FRONTEND_DIST_DIR` is only populated inside the
built image — local `uvicorn --reload` runs API-only.

## Local development

Needs a reachable Postgres and `DATABASE_URL` pointing at it (see `.env`).
Nothing in this repo starts one.

```bash
# once, and after any migration is added
cd backend && uv run alembic upgrade head

# terminal 1 - backend
uv run uvicorn fisac.main:app --reload --port 8000

# terminal 2 - frontend
cd frontend && npm install && npm run dev   # Vite on :5173, HMR
```

Vite's dev server proxies `/api/*` to the local uvicorn on `:8000` (see
`server.proxy` in `frontend/vite.config.ts`), so no CORS setup is needed.
Serving vite from a remote workspace behind a proxy needs `host`,
`allowedHosts`, and an `hmr` override added there — there is a comment marking
the spot.

Frontend build/typecheck: `cd frontend && npm run build` (`tsc -b && vite build`).

## Database

Tables live in a dedicated `fisac` schema rather than `public`. Schema
creation is automatic: `backend/migrations/env.py` runs `CREATE SCHEMA IF NOT
EXISTS fisac` on the connection before Alembic does anything else — including
before Alembic creates its own `alembic_version` bookkeeping table, which also
lives in that schema, so the schema has to exist first. A fresh database
needs no manual setup beyond `DATABASE_URL` pointing at it; the connecting
role just needs `CREATE` privilege on the database (true by default for a
database's own owner — e.g. a managed Postgres provider's auto-created user).

- `scripts/init-postgres.sh` is optional. It creates a dedicated
  least-privilege `fisac` role plus the schema, for setups where the app
  should connect as a role narrower than the database's owner. It's not
  required otherwise — the migration bootstraps the schema itself.
- `backend/src/fisac/db.py` binds `MetaData(schema="fisac")` so tables are
  always schema-qualified regardless of the connection's `search_path`.
- `backend/migrations/env.py` sets `version_table_schema="fisac"` plus an
  `include_name` filter. **Keep the filter.** It scopes `alembic revision
  --autogenerate` to this schema and excludes alembic's own `alembic_version`
  table from the diff; without it autogenerate reflects everything else visible
  in the database and can propose destructive changes. Note the subtlety it
  encodes: `fisac` can be the connecting role's own default schema, which
  Alembic represents internally as `None`, not by name — the filter must
  allow both.
- Migrations are **not** applied by `uvicorn --reload`; run `alembic upgrade
  head` yourself. The container image does run them on start.

## Building the image

The root `Dockerfile` builds a self-contained image (frontend build → uv
sync → final), whose CMD runs `alembic upgrade head` then uvicorn on `:8000`.
It expects `DATABASE_URL` in the environment and reaches Postgres over the
network — it does not start one.

```bash
docker build -t fisac .
```

## Deployment

Not configured. The image built above is the only deployable artifact;
nothing in this repo defines TLS, a hostname, or a production Postgres
instance. Ask before assuming any of it.
