# Tranche A — foundation and configuration

Date: 2026-10-23
Status: design approved in conversation; spec awaiting review
Builds on: `2026-10-23-compta-simplifiee-data-model.md` (models + migration 0005)

## Intent

fisac is being rebuilt from the "fisac - Compta simplifiée" design canvas
(https://claude.ai/artifact/WCB1RgFkBKViXKzZBWC6tV). The work is cut into four
slices, each usable on its own and each with its own spec, plan and
implementation:

- **A — foundation and configuration** (this spec)
- B — pieces: ventes, achats, divers, immobilisations, inventaire d'ouverture
- C — computed reads: journaux, TVA, résultat, ISOC, inventaire de clôture
- D — rémunération

What the user asked for, in their words: start with A; the app opens on an
empty company and a minimal guided step to open the first fiscal year (no
sample data); desktop and mobile layouts of the canvas in every slice; at the
end, boot the backend and Vite and show the result.

Success for A: every configuration screen of the canvas works end to end on
desktop and mobile, against the real API and database, with the canvas's
rules (in-use rows cannot be deleted, system categories cannot be deleted or
re-kinded, IBAN and statement-day validation, autosave), and the API is
covered by tests.

## Scope

In:

- the API conventions every later slice reuses (schemas, errors, uses counts)
- `/api` routes for the company, partners, fiscal years (and their equity
  lines, read only), third parties, VAT schemes, ISOC schemes, depreciation
  models, financial accounts (read only), payment methods, categories
- the new React shell: router, sidebar, fiscal-year switcher, mobile drawer,
  the "open the first fiscal year" empty state
- seven screens, each with its desktop and mobile artboards:
  Structure société, Tiers, Catégories, Régimes de TVA, Régimes ISOC,
  Modèles d'amortissement, Moyens de paiement
- the first Python test suite
- removal of the old personal-accounting frontend

Out (later slices): every piece screen, the opening inventory, journals, VAT,
ISOC, result, closing inventory, pay; editing equity lines (no artboard edits
them); a financial-accounts screen (the canvas has none); exports (the
"Exporter" bulk action is shown disabled with "bientôt").

## Environment prerequisite

The frontend installs `@qvanderlinden/ui` from GitHub Packages, which needs
`NODE_AUTH_TOKEN` in the environment. It was added to the cloud environment
after the session that wrote this spec started, so implementation runs in a
new session where the variable is present. Verify with
`env | grep -c '^NODE_AUTH_TOKEN='` before starting the frontend tasks.

## API

### Conventions

- Every route lives under `/api`; one router module per resource in
  `backend/src/fisac/routers/`.
- Each resource has explicit Pydantic schemas in `backend/src/fisac/schemas/`
  (one module per resource): `XCreate`, `XUpdate` (every field optional, a
  PATCH sends only what changed) and `XRead`.
- Money and rates travel as decimal strings (`"550.00"`, `"21.00"`), never
  floats: `Decimal` fields serialised as strings. Dates are ISO `YYYY-MM-DD`.
- Lists return every row, ordered by their natural key (label, name, number);
  sorting, filtering and the 25-row pages are done client side, as the canvas
  does. A configuration table holds tens of rows at most.
- Autosave: the frontend PATCHes one field at a time; the API accepts any
  subset of `XUpdate` fields and returns the full `XRead`.

### Errors

One module, `backend/src/fisac/errors.py`, owns the error shapes:

| status | body | when |
| --- | --- | --- |
| 404 | `{"detail": "…"}` | the row does not exist |
| 409 | `{"detail": "…", "code": "in_use", "uses": N}` | delete of a row pieces reference |
| 409 | `{"detail": "…", "code": "system"}` | delete, archive or re-kind of a category with a role |
| 409 | `{"detail": "…", "code": "last_partner"}` | delete of the only partner |
| 422 | FastAPI's `{"detail": [{"loc": […], "msg": "…"}]}` | validation, including translated constraints |

Delete checks `uses` first and answers 409 without touching the row; an
`IntegrityError` from a RESTRICT foreign key (a race) is translated to the
same 409. A `CheckViolation` or `UniqueViolation` is translated to a 422 on
the field the constraint concerns, through a table mapping constraint names
(`ck_payment_methods_closing_day_range`, `uq_categories_label`, …) to a field
and a French message ("Un jour de 1 à 31", "Ce libellé existe déjà"). An
unmapped constraint falls back to a 422 on the body with the constraint name.

### Uses counts

Every `XRead` of a referenced resource carries `uses: int`, the number of
pieces that reference it, counted by correlated subqueries in the list and
get queries, across all fiscal years (that is what blocks a deletion; the
canvas's "en 2026" wording becomes "pièces"):

| resource | counted from |
| --- | --- |
| third party | sales, purchases |
| VAT scheme | sale lines, purchase lines |
| ISOC scheme | purchase lines |
| depreciation model | fixed assets |
| payment method | sales, purchases, divers, pay schedules, ISOC prepayments |
| category | sale lines, purchase lines, divers |

Category defaults pointing at a scheme do not count: a default is only a
suggestion and is SET NULL on delete.

### Resources

**`/api/company`** — `GET`, `PATCH`. The single row is created on first `GET`
with the model's defaults (empty name, SRL, quarterly VAT, January). Fields:
name, legal_form, bce_number, vat_regime, registered_office, iban (normalised
and checked as for third parties), fiscal_year_start_month, manager_name,
manager_since, manager_paid.

**`/api/partners`** — `GET`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Fields:
name, shares (integer ≥ 0), contribution (≥ 0). Read adds nothing computed;
the share percentage is computed client side. Deleting the last partner is a
409 `last_partner`.

**`/api/fiscal-years`** — `GET` lists them, newest first, with id,
start_date, end_date, state and the three ISOC conditions. `POST` (empty
body) opens the next one:

- none exists yet: it starts on the 1st of the company's start month in the
  current calendar year, or the year before when that date is still in the
  future, and ends the day before one year later;
- otherwise it starts the day after the latest end_date and lasts one year.

`PATCH /{id}` changes state and the three ISOC conditions (used by slice C).
Dates are never patched. `GET /{id}/equity-lines` lists that year's equity
lines, read only in this slice.

**`/api/third-parties`** — CRUD. Fields: name, iban. The IBAN is normalised
(spaces removed, upper case) and checked with ISO 13616 — the country's
length for the countries the canvas knows (BE 16, NL 18, LU 20, DE 22, FR 27),
then mod 97 equal to 1; an empty IBAN is stored as NULL. Read adds `uses`.

**`/api/vat-schemes`** — CRUD. Fields: label, rate, recoverable_rate,
for_sales, for_purchases. A scheme with for_purchases and no recoverable
rate, or with a rate on a sales-only scheme, is a 422 on recoverable_rate.
Read adds `uses`.

**`/api/isoc-schemes`** — CRUD. Fields: label, deductible_rate, rubric. Read
adds `uses`.

**`/api/depreciation-models`** — CRUD. Fields: label, years (1–50), method,
first_year. Read adds `uses`.

**`/api/financial-accounts`** — `GET` only: id, code, name, kind.

**`/api/payment-methods`** — CRUD. Fields: name, type, financial_account_id,
statement_closing_day, statement_payment_day, settlement_account_id.

- Creating a `card` method without a financial account creates its card
  account: kind card, name taken from the method, a code made of the
  method's initials, made unique with a digit, and settled by the first bank
  account. A card needs both statement days (422 otherwise).
- After creation, type and financial account cannot change (422): the canvas
  edits only the name and the statement days ("Seuls les jours du décompte
  se modifient").
- Read adds `uses` and the account's name.

**`/api/categories`** — CRUD. Fields: label, kind, settlement,
default_vat_scheme_id, default_isoc_scheme_id, archived. `role` is read only
(set by the migration's seed).

- A category with a role: delete, archive and a kind change are a 409
  `system`.
- A category with uses: delete is a 409 `in_use`; it can be archived.
- A settlement on a kind other than outside is a 422.
- Read adds `uses`.

## Frontend

### What goes and what stays

Removed: every component of the old app (flows, lines editor, projection,
balance chart, ledger accounts, annual accounts, VAT view, flow generator) and
their tests, `accountingDisplay.ts`, `reportFigures.ts`, the old
`api/client.ts` and `api/types.ts`.

Kept: `format.ts` and its tests (French money, rates and dates), `errors.ts`
(adapted to the new error shapes), `serialQueue.ts` (one row's PATCHes are
sent in order), `scripts/check-design.mjs`, the PWA setup, the Vite proxy.

Added dependency: `react-router` (v7, `BrowserRouter`), whose path routes the
backend's `app.frontend(..., fallback="index.html")` already serves.

### Shell

- Routes: `/societe`, `/tiers`, `/categories`, `/regimes-tva`,
  `/regimes-isoc`, `/modeles-amortissement`, `/moyens-paiement`; `/`
  redirects to `/societe` in this slice.
- Sidebar as in the canvas: `SidebarNav` in the ink tone, the five groups
  (mouvements, dirigeant, taxes, clôture, configuration) with their lowercase
  labels and Lucide icons; the entries of slices B–D are present but
  disabled, marked "bientôt".
- Under the logo, the fiscal-year switcher (`FiscalYear` artboard): "FY2026"
  with each year's state, and the year picked kept in the URL-independent app
  state (localStorage, guarded).
- No fiscal year: the main area shows an empty state whose one primary button
  is "Ouvrir l'exercice 2026" (the year the API would open), which POSTs and
  then shows the app. Configuration screens stay reachable without a year.
- Mobile (below 640 px): the sidebar becomes a drawer behind a header menu
  button (`MobileMenu` artboard).

### Configuration screens

Each screen has its own folder, e.g. `src/screens/tiers/`:

- `TiersScreen.tsx` loads the data and picks the desktop or mobile layout with
  `useMediaQuery('(max-width: 640px)')`;
- `TiersTable.tsx` — desktop: display title, search and filters of the
  artboard, sortable columns, selection checkboxes with the bulk bar, a row
  menu (dupliquer, supprimer…), pagination by 25, the primary
  "Nouveau tiers" button;
- `TiersCards.tsx` — mobile: the card list of the mobile artboard;
- `TiersForm.tsx` — the fields, shared by the desktop `Dialog`
  ("Enregistré automatiquement") and the mobile full-screen form.

Shared across screens (in `src/components/`): the bulk bar, the row menu, the
delete confirmation shown in the same dialog (as the canvas does), the
"Porté par N pièces : impossible de le supprimer" state that replaces delete,
the sort header, the pager. A new row left without its name is deleted when
the dialog closes, as the canvas drops it.

Per screen, beyond the common pattern:

- **Structure société**: one page, not a list — identity, VAT regime and
  start month (with the "L'exercice court du … au …" hint), the manager with
  "rémunéré", the partners table with its own dialog and share percentages,
  the equity card read only (apport = the partners' total, then the year's
  equity lines).
- **Tiers**: live IBAN check with the country, "sans IBAN" / "IBAN invalide"
  badges and filter, "Copier l'IBAN".
- **Catégories**: kind tabs with counts, "afficher les archivées", archive
  and restore, system categories shown with their screen ("ventes",
  "rémunération"…) and no delete.
- **Régimes de TVA**: sens filter, the "Pour une ligne de €100 HTVA" example.
- **Régimes ISOC**: rubric filter, the €100 example.
- **Modèles d'amortissement**: the €1 000 schedule example, linear and
  declining.
- **Moyens de paiement**: for a card, the statement days and the next three
  statements.

The examples (VAT, ISOC, depreciation schedule, card statements) and the IBAN
check are pure functions in `.ts` modules with vitest tests; slice C will port
the schedule and statement logic to the API for the real figures.

### Data on the client

- `api/client.ts` and `api/types.ts` are rewritten by hand from the `XRead`
  schemas; amounts stay strings and go through `format.ts`.
- `useResource<T>(path)` returns `{ data, error, loading, reload, patch }`;
  `patch` applies the change optimistically, sends it through the row's
  serial queue, and on failure restores the server's value and shows the
  translated error.
- Autosave fires on blur, or 500 ms after the last keystroke.

## Testing

API (new):

- dev dependencies `pytest`, `pytest-asyncio`, `httpx`, locked with `uv lock`;
  tests in `backend/tests/`, run with `uv run pytest`;
- a session fixture creates a throwaway database on the Postgres named by
  `TEST_DATABASE_URL`, runs `alembic upgrade head` (so the reference data is
  there) and truncates the non-reference tables between tests;
- per resource: create, read, partial patch, delete; 409 `in_use` with a
  piece inserted through the ORM (piece routes come in slice B); 409 `system`
  and `last_partner`; the translated 422s (invalid IBAN, statement day out of
  1–31, purchases scheme without recoverable rate, settlement on an expense,
  type change of a payment method); opening the first and the next fiscal
  year, with a start month other than January; the card account created with
  a card method.

Frontend: vitest on the pure functions (IBAN, VAT and ISOC examples,
depreciation schedule, card statements, the generic sort/filter/paginate);
`npm run test` (both time zones), `npm run build` (`tsc -b`) and
`npm run check:design` pass.

End to end: uvicorn and Vite run in the container; a Playwright script visits
every screen at 1440 and 390 px, creates a tiers, triggers the IBAN error,
archives a category and opens the fiscal year, and saves screenshots that are
sent to the user. The container exposes no port, so no live link can be
given.

## Delivery

One commit per plan step, pushed to the branch. At the end, `CLAUDE.md` and
the README say slice A is done, which routes are mounted, and how to run the
Python tests.

## Decisions taken in the design

- Uses counts span all fiscal years, not only the displayed one.
- Payment-method type and account are fixed after creation; a card method
  brings its own financial account.
- System categories cannot be archived either, as the canvas's bulk archive
  skips them.
- Duplicate is a client-side GET then POST of the copy; no endpoint.
- No pagination, sorting or filtering on the server for configuration lists.
