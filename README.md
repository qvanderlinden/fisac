# fisac

A personal accounting app: accounts, categorised revenue and expense flows with
invoice lines, VAT reporting per quarter, and a balance projection over time.

Stack:
- Backend: [FastAPI](https://fastapi.tiangolo.com), SQLAlchemy 2.x (async) +
  asyncpg, [Alembic](https://alembic.sqlalchemy.org) for migrations
- Frontend: React + [Vite](https://vite.dev), Tailwind, shadcn/ui components,
  installable as a PWA via [vite-plugin-pwa](https://vite-pwa-org.netlify.app)
- Python: 3.14 (`requires-python` in `pyproject.toml`, pinned via
  `.python-version`), deps managed by [uv](https://docs.astral.sh/uv/)
- Database: Postgres

## Layout

```
fisac/
  frontend/              # React + Vite, own package.json
  backend/
    alembic.ini
    migrations/
    src/fisac/           # FastAPI app
  scripts/
    init-postgres.sh     # role + schema bootstrap SQL
  Dockerfile              # multi-stage: frontend build -> uv sync -> final
  pyproject.toml         # the single Python project (name = "fisac")
```

The Python project is declared by the root `pyproject.toml`, while the package
source sits at `backend/src/fisac/` (hatchling is pointed there explicitly), so
`uv run` works from anywhere in the repo.

The container image runs one uvicorn process serving both the built React
static assets and the `/api/*` routes — a single service, and no CORS
configuration anywhere.

## Local development

You need a Postgres you provide yourself and a `DATABASE_URL` pointing at it:

```bash
cp .env.example .env      # then set DATABASE_URL and FISAC_DB_PASSWORD

cd backend && uv run alembic upgrade head   # once, and after each new migration

# terminal 1 - backend
uv run uvicorn fisac.main:app --reload --port 8000

# terminal 2 - frontend
cd frontend && npm install && npm run dev
```

Vite proxies `/api/*` to the local uvicorn, so no CORS setup is needed. Two
things to know:

- A bare `uvicorn --reload` serves the API only. The frontend mount is skipped
  unless a built `dist/` is present, which only happens inside the container
  image.
- `uvicorn --reload` does not apply migrations; run `alembic upgrade head`
  yourself. The container image does run them on start.

Typecheck + build the frontend with `cd frontend && npm run build`
(`tsc -b && vite build`). There is no linter or test suite on the Python side.

## Database

Tables live in a dedicated `fisac` schema rather than `public`. Schema
creation is automatic — `backend/migrations/env.py` creates it on the
connection before Alembic touches anything else, so a fresh database needs no
manual setup beyond a `DATABASE_URL`. The connecting role just needs `CREATE`
privilege on the database (true by default for a database's own owner).

- `scripts/init-postgres.sh` is optional: it creates a dedicated
  least-privilege `fisac` role plus schema, for setups where the app should
  connect as a role narrower than the database's owner. Not required
  otherwise — the migration bootstraps the schema itself.
- `backend/src/fisac/db.py` binds `MetaData(schema="fisac")` so tables are
  always schema-qualified regardless of the connection's `search_path`.
- `backend/migrations/env.py` sets `version_table_schema="fisac"` and an
  `include_name` filter scoping autogenerate to that schema. The filter is not
  optional: without it, `alembic revision --autogenerate` reflects everything
  else visible in the database and can propose destructive changes.

## Building the image

```bash
docker build -t fisac .
```

The image expects `DATABASE_URL` in the environment and reaches Postgres over
the network — it does not start one. Its CMD applies migrations, then serves on
`:8000`.

## Deployment

Not configured. The image built above is the only deployable artifact; how it
gets TLS, a hostname, and a production Postgres instance is not settled.
