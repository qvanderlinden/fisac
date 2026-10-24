# fisac

Simplified books for one Belgian company: sales, purchases, divers and fixed
assets, the director's pay, VAT returns, corporate tax (ISOC), the result and
the opening and closing inventory. The data model is in place
(`docs/superpowers/specs/2026-10-23-compta-simplifiee-data-model.md`) and
slices A and B are done. The API (mounted under `/api`) and the frontend cover
the company, fiscal years, tiers, categories, VAT and ISOC schemes,
depreciation models and payment methods (slice A), then sales, purchases, the
fixed-asset register, the journals, the VAT periods and the result (slice B,
`docs/superpowers/specs/2026-10-23-tranche-b-pieces-design.md`), then the
corporate tax (ISOC slice,
`docs/superpowers/specs/2026-10-24-tranche-isoc-design.md`). Divers, the
director's pay and the opening and closing inventory are still to come.

Slice B in short:
- A category is a label with a direction (sales or purchases); it carries no
  VAT or ISOC default, type or role.
- The result follows three rules: every sale line increases it; a purchase
  line no fixed asset takes over decreases it by its net plus the VAT that is
  not recovered; a purchase line a fixed asset takes over decreases it only by
  that asset's depreciation of the year.
- Journals are computed (bank and card, running balance) and start at 0; the
  VAT periods and the result are computed too.
- Routes: `/fiscal-years/{id}/sales|purchases|fixed-assets|journals|vat-periods|result`,
  `/sales`, `/purchases` and their `/lines`, `/sale-lines/{id}`,
  `/purchase-lines/{id}` and `/purchase-lines/available`, `/fixed-assets`
  (with `/depreciations/{year}` and `/recompute`), `PATCH /vat-periods/{id}`.

ISOC slice in short:
- Taxable base = result before tax + the disallowed expenses (each purchase
  line's ISOC scheme, by rubric: restaurant, car, other). Tax: 20 % on the
  first €100 000 when the three conditions are met, 25 % otherwise, plus the
  majoration for insufficient advance payments (exempt for a small company in
  its first three fiscal years).
- Result after tax = result before tax − (tax + majoration). The advance
  payments (VA1-VA4) reduce the balance to pay, not the result; a paid one is
  a journal movement.
- The legal parameters are in `backend/src/fisac/books/isoc_params.py`, one
  `Params` entry per assessment year (the year after the fiscal year's end).
  To add a year, add its entry to `_PARAMS`; a missing year falls back to the
  latest one and the ISOC read flags it (`parameters_fallback`).
- Routes: `/fiscal-years/{id}/isoc`, `/fiscal-years/{id}/isoc-prepayments`,
  `PATCH /isoc-prepayments/{id}`; `/fiscal-years/{id}/result` also returns
  `estimated_tax`, `majoration` and `after_tax`.

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
(`tsc -b && vite build`); `npm run test` runs its vitest suites.

Tests and smoke:

- `uv run pytest` runs the API tests against `TEST_DATABASE_URL` (default
  `postgresql+asyncpg://fisac:fisac@localhost:5432/fisac_test`, a role allowed
  to create databases).
- `cd frontend && npm run smoke` is an end-to-end check in Chromium
  (Playwright) of slices A and B and the ISOC slice: the configuration
  screens, then a sale, a purchase and the fixed asset taking it over, a
  restaurant purchase and a paid VA1 of 2 000, checked in the journal, the VAT
  period, the ISOC screen and the result; it needs the stack above running on a fresh database (a second run fails: the
  first fiscal year is already open) and saves
  screenshots to `frontend/smoke/` (gitignored).

There is no linter or type checker on the Python side.

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
