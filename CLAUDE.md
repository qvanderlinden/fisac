# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**fisac** — simplified books for one Belgian company ("Compta simplifiée"):
sales, purchases, divers and fixed assets, the director's pay, VAT returns,
corporate tax (ISOC), the result and the opening and closing inventory.

The app was rebuilt from the "fisac - Compta simplifiée" design canvas. The data
model is done (`backend/src/fisac/models.py`, migrations 0005 and 0006, spec
`docs/superpowers/specs/2026-10-23-compta-simplifiee-data-model.md`). Slice A
("socle", spec `docs/superpowers/specs/2026-10-23-tranche-a-socle-design.md`)
and slice B ("pièces", spec
`docs/superpowers/specs/2026-10-23-tranche-b-pieces-design.md`) are done. The
routers are mounted under `/api`:

- slice A: company, fiscal years, third parties, categories, VAT and ISOC
  schemes, depreciation models, payment methods;
- slice B: `/fiscal-years/{id}/sales|purchases` and `/sales`, `/purchases`
  with their `/lines`, `/sale-lines/{id}`, `/purchase-lines/{id}`,
  `/purchase-lines/available`; `/fiscal-years/{id}/fixed-assets` and
  `/fixed-assets` (`PUT /{id}/depreciations/{year}`, `POST /{id}/recompute`);
  `/fiscal-years/{id}/journals`; `/fiscal-years/{id}/vat-periods` and
  `PATCH /vat-periods/{id}`; `/fiscal-years/{id}/result`.
- auth, from qv-auth under `/api/auth`: `GET /auth/me` (the signed-in user)
  and `/auth/users` (administration of accounts, admins only).

Sign-in is not done here, and access is decided per app. Dex
(`id.quentinvanderlinden.dev`) says who you are, the shared oauth2-proxy at
`auth.quentinvanderlinden.dev` (repository `qvanderlinden/auth`, spec
`docs/superpowers/specs/2026-10-24-sso-google-design.md`) holds the session
for every `*.quentinvanderlinden.dev` app and passes the ID token on. The
`qv-auth` module of that repository (`backend/src/fisac/auth.py`) verifies
the token on every `/api` route (`main.py` mounts each router with
`dependencies=AUTH`) and keeps the `users` table (`User` in `models.py`,
migration 0008): a new account is `pending` until an admin accepts it in
« utilisateurs » (admins only; the nav shows a pending badge); a rejected one
is refused. `AUTH_ADMIN_EMAILS` bootstraps the admins (approved on sight).
`tests/test_auth.py` calls every operation unauthenticated and expects 401,
and checks the pending, approved and admin paths. In the frontend, `AuthGate`
from `@qvanderlinden/auth-ui` wraps the app in `main.tsx`; a 401 goes through
`handleUnauthorized` (in `src/api/client.ts`) to the sign-in service, a 403
pending or rejected reloads the page once so the gate shows its screen; the
shell shows `UserCard` from the same package. Authentication is on unless
`AUTH_DISABLED=true`; on, the app refuses to start without `AUTH_ADMIN_EMAILS`.

The frontend targets this API for the shell, the seven configuration screens
(société, tiers, catégories, régimes de TVA, régimes ISOC, modèles
d'amortissement, moyens de paiement) and the six slice B screens (ventes,
achats, immobilisations, journaux, tva, résultat). The other nav entries
(divers, rémunération, isoc, inventaire, inventaire d'ouverture) are
placeholders ("bientôt") and still to come. Only typed facts are stored;
journals, VAT/ISOC figures, the result and the closing inventory are computed.

Slice B rules to keep in mind:

- A category is only a label with a direction (sales or purchases); it has no
  kind, role, settlement or default VAT/ISOC scheme. The Catégories screen has
  ventes / achats tabs.
- The result follows three rules: every sale line increases it; a purchase
  line no fixed asset takes over decreases it by its net plus the VAT that is
  not recovered; a purchase line a fixed asset takes over decreases it only by
  that asset's depreciation of the year.
- A fixed asset is created from the register by first picking an available
  purchase line; its value and date follow from the line (read only).
- Journals start at 0 (no opening balance yet).

Auth dependencies: `qv-auth` (Python, `[tool.uv.sources]`) and
`@qvanderlinden/auth-ui` (npm) come from `qvanderlinden/auth`. For now they
point at local sources, `path = "../auth/python"` and `file:../../auth/ui`, so
the repo builds only next to a checkout of that repository; they become the
`v0.1.0` tag and `^0.1.0` once released.

Stack: FastAPI backend on Python 3.14 (`requires-python = ">=3.14"` in
`pyproject.toml`, pinned via `.python-version`), React + Vite frontend
(PWA-capable via vite-plugin-pwa) built on the `@qvanderlinden/ui` design
system (React 19, Tailwind CSS v4), Postgres via SQLAlchemy 2.x async +
asyncpg + Alembic, uv for Python deps.

There is no linter or type checker configured for the Python side; the API has
a pytest suite (`uv run pytest`, see below).
The frontend is typechecked by `tsc -b` as part of `npm run build`;
`npm run test` runs its vitest suites (`src/**/*.test.ts(x)`, in two time
zones) and `npm run check:design` its design-system compliance guard.

## Layout

```
fisac/
  frontend/              # React + Vite, own package.json
    src/
    scripts/
      check-design.mjs   # design-system compliance guard (npm run check:design)
      smoke.mjs          # Playwright end-to-end smoke of slices A and B (npm run smoke)
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
Nothing in this repo starts one. Set `AUTH_DISABLED=true` in `.env` (as in
`.env.example`): there is no sign-in service locally, and the API then answers
as an approved admin, `dev@localhost`, created in the database.

```bash
# once, and after any migration is added
cd backend && uv run alembic upgrade head

# terminal 1 - backend
uv run uvicorn fisac.main:app --reload --port 8000

# terminal 2 - frontend
cd frontend && npm install && npm run dev   # Vite on :5173, HMR
```

The frontend depends on `@qvanderlinden/ui`, published to GitHub Packages:
`frontend/.npmrc` maps the `@qvanderlinden` scope there and reads
`NODE_AUTH_TOKEN`, so `npm install` / `npm ci` need `NODE_AUTH_TOKEN` set and
exported, as a GitHub token with `read:packages`. The repo root's gitignored
`.envrc` sets it; direnv loads it in an interactive shell, otherwise run
`set -a && . ./.envrc && set +a` first (plain `source` leaves it unexported).

Vite's dev server proxies `/api/*` to the local uvicorn on `:8000` (see
`server.proxy` in `frontend/vite.config.ts`), so no CORS setup is needed.
Serving vite from a remote workspace behind a proxy needs `host`,
`allowedHosts`, and an `hmr` override added there — there is a comment marking
the spot.

Frontend build/typecheck: `cd frontend && npm run build` (`tsc -b && vite build`).
Frontend checks: `npm run test` (vitest, run twice: default TZ, then
`TZ=America/New_York`) and `npm run check:design`.

Backend tests: `uv run pytest` runs the API tests against `TEST_DATABASE_URL`
(default `postgresql+asyncpg://fisac:fisac@localhost:5432/fisac_test`; the role
must be allowed to create databases, the suite creates and drops its own).
The conftest sets `AUTH_DISABLED=true`; `test_auth.py` turns authentication
back on and signs tokens with its own key.

End-to-end smoke: `cd frontend && npm run smoke` drives Chromium (Playwright,
pinned to the version matching `/opt/pw-browsers` Chromium 1194) through the
empty state, opening the first fiscal year, the seven configuration screens,
then a sale (1 000 at Ventes 21 %), a purchase (1 500 at Achats 21 % ·
récupérable) and the fixed asset taking that line over, checked in the journal,
the VAT period of today's quarter and the result, with ventes, achats, immobilisations,
journaux, tva and résultat (and utilisateurs, with `dev@localhost` as admin) at 1440 and 390 px, writing screenshots to the
gitignored `frontend/smoke/`. It needs the
stack running (uvicorn on :8000 with `AUTH_DISABLED=true`, `npm run dev` on
:5173) on a fresh database
(it opens the first fiscal year, so a second run on the same database fails).

## Frontend design system

Every screen is built from `@qvanderlinden/ui` (the Ledger UI kit). Read
`frontend/node_modules/@qvanderlinden/ui/SKILL.md` and its `docs/brand.md`
before changing UI. In short: the package's components first, then the
restyled primitives from `@qvanderlinden/ui/primitives`; brand utilities only
(`bg-surface-*`, `text-fg-*`, `border-line-*`, `type-*`, `numeric`), never a
raw colour; Lucide icons, no emoji; one `primary` Button per view; light only.
Copy is French: lowercase navigation, tabs, tags and eyebrows, sentence case
for headings and buttons. Money, rates and dates go through `src/format.ts`
(the system's `formatDate` is English-only; `format.ts` has the French one).
`npm run check:design` fails on the mechanical slips (emoji, hex colours,
`toFixed(`, …).

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

The frontend stage installs `@qvanderlinden/ui` from GitHub Packages, and the
backend stage installs `qv-auth` from the private `qvanderlinden/auth`
repository, so the build needs `NODE_AUTH_TOKEN` in the environment (a token
that also reads that repository). The backend stage hands it to git through
`GIT_CONFIG_*` variables of the one `uv sync` RUN. It is passed as a BuildKit
secret, mounted for the `npm ci` step only, and never lands in an image layer.
The secret id is `NODE_AUTH_TOKEN`, the variable's own name, because that is
the id Coolify uses when it passes build variables as secrets.

```bash
docker build --secret id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN -t fisac .
```

## Deployment

Coolify on a VPS, behind Coolify's Traefik, at `fisac.quentinvanderlinden.dev`,
with the sign-in service of `qvanderlinden/auth` deployed on the same server
(its README explains how to protect an app, and its deployment order: fisac
must run qv-auth in production before the sign-in service switches to
any-account sign-in). Nothing in this repo defines a
production Postgres instance; ask before assuming one.

fisac's resource in Coolify needs:

- the environment: `DATABASE_URL`, `AUTH_ISSUER`
  (`https://id.quentinvanderlinden.dev`), `AUTH_AUDIENCE` (`oauth2-proxy`),
  `AUTH_ADMIN_EMAILS` (comma-separated), and never `AUTH_DISABLED`;
- no published host port, so Traefik is the only way in;
- the labels below, `<router>` being the name of the router Coolify generated
  for fisac (and its entrypoint and resolver names copied from it). Pages go
  through `sso` (no session: a redirect to sign-in), `/api` through `sso-api`
  (no session: a 401 the frontend turns into that redirect). `sso@docker` is
  appended to the middlewares Coolify already put on its router (`gzip`
  below), not put in their place:

```
traefik.http.routers.<router>.middlewares=gzip,sso@docker
traefik.http.routers.<router>-api.rule=Host(`fisac.quentinvanderlinden.dev`) && PathPrefix(`/api`)
traefik.http.routers.<router>-api.priority=100
traefik.http.routers.<router>-api.entrypoints=https
traefik.http.routers.<router>-api.tls=true
traefik.http.routers.<router>-api.tls.certresolver=letsencrypt
traefik.http.routers.<router>-api.service=<router>
traefik.http.routers.<router>-api.middlewares=sso-api@docker
```
