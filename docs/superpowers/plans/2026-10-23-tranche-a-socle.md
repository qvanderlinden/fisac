# Tranche A — foundation and configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `/api` routes and the React screens of the canvas's seven configuration screens (Structure société, Tiers, Catégories, Régimes de TVA, Régimes ISOC, Modèles d'amortissement, Moyens de paiement), on the new shell, desktop and mobile, with the first Python test suite.

**Architecture:** One FastAPI router and one Pydantic schema module per resource, sharing three small modules (errors, uses counts, conversion to the read schema). The React app is rewritten on `react-router`: a shell (sidebar, fiscal-year switcher, mobile drawer) and one folder per screen, whose layout switches between a desktop table with a dialog and a mobile card list with a full-screen form; pure calculations live in tested `.ts` modules.

**Tech Stack:** Python 3.14, FastAPI ≥ 0.138, SQLAlchemy 2 async + asyncpg, Pydantic v2, pytest + pytest-asyncio + httpx; React 19, Vite, TypeScript, `@qvanderlinden/ui`, `react-router` 7, vitest, Playwright (Chromium preinstalled at `/opt/pw-browsers`).

**Spec:** `docs/superpowers/specs/2026-10-23-tranche-a-socle-design.md` (and the data model it builds on, `docs/superpowers/specs/2026-10-23-compta-simplifiee-data-model.md`). The canvas the screens reproduce: https://claude.ai/artifact/WCB1RgFkBKViXKzZBWC6tV — read an artboard with the Artifact tool (`action: "read"`, `path: "project/<Name>.dc.html"`) before building its screen.

## Global Constraints

- Before any frontend task: `env | grep -c '^NODE_AUTH_TOKEN='` prints `1`; then `cd frontend && npm ci`. If it prints `0`, stop and tell the user the session does not have the token.
- Every route under `/api`; money and rates travel as decimal strings (Pydantic v2 serialises `Decimal` as a string), dates as `YYYY-MM-DD`.
- Error bodies exactly: 404 `{"detail"}`; 409 `{"detail", "code": "in_use", "uses": N}`, `{"detail", "code": "system"}`, `{"detail", "code": "last_partner"}`; 422 FastAPI's `{"detail": [{"loc", "msg", "type"}]}`.
- `uses` counts span all fiscal years.
- No server-side pagination, sorting or filtering of configuration lists; the client pages by 25.
- Autosave: PATCH one field, on blur or 500 ms after the last keystroke; a failed PATCH restores the server value and shows the error.
- UI follows `frontend/node_modules/@qvanderlinden/ui/SKILL.md` and its `docs/brand.md` (read both first): package components first, brand utilities only, no raw colour, Lucide icons, no emoji, one `primary` Button per view, light only.
- Copy is French: lowercase navigation, tabs, tags and eyebrows; sentence case for headings and buttons. Money, rates and dates go through `src/format.ts`.
- Mobile layout below 640 px: `useMediaQuery('(max-width: 640px)')`.
- `npm run test`, `npm run build` and `npm run check:design` pass at the end of every frontend task; `uv run pytest` passes at the end of every backend task.
- Commits end with the repository's attribution lines; one commit per task, pushed to `claude/charming-mayer-m27ouj`.

## Review Focus

- An IBAN typed with spaces and lower case (`be68 5390 0754 7034`) is stored normalised and accepted — test in Task 4.
- Deleting a VAT or ISOC scheme that only a category's default points at succeeds and clears that default — test in Task 5.
- A second card method whose name has the same initials gets a distinct account code (`CV`, then `CV2`) — test in Task 6.
- Two POSTs to open a fiscal year give two consecutive years, never a duplicate or an overlap — test in Task 3.
- Creating or renaming a category to an existing label answers a 422 on `label` ("Ce libellé existe déjà"), not a 500 — test in Task 7.

---

### Task 1: API test harness and shared modules

**Files:**
- Modify: `pyproject.toml` (dev dependencies, pytest config), `uv.lock` (by `uv lock`), `backend/src/fisac/main.py`
- Create: `backend/src/fisac/errors.py`, `backend/src/fisac/uses.py`, `backend/src/fisac/schemas/__init__.py`, `backend/src/fisac/schemas/financial_accounts.py`, `backend/src/fisac/routers/financial_accounts.py`, `backend/tests/conftest.py`, `backend/tests/test_financial_accounts.py`, `backend/tests/test_errors.py`

**Interfaces:**
- Produces:
  - `errors.not_found(what: str) -> HTTPException` (404, `detail` = `f"{what} introuvable"`)
  - `errors.in_use(uses: int) -> HTTPException` (409 `in_use`, detail `"Porté par {uses} pièce(s) : impossible de le supprimer"`)
  - `errors.conflict(code: str, detail: str) -> HTTPException` (409 with that code)
  - `errors.field_error(field: str, msg: str) -> HTTPException` (422, `detail=[{"loc": ["body", field], "msg": msg, "type": "value_error"}]`)
  - `async errors.commit(session: AsyncSession) -> None` — commits; on `IntegrityError` rolls back and raises: a foreign-key violation (`sqlstate == "23503"`) → `in_use(0)` with detail "Utilisé par d'autres données"; a check or unique violation → `field_error` from `CONSTRAINT_MESSAGES[name]`, or `field_error("__root__", name)` when unmapped. Read the name and sqlstate from `exc.orig.__cause__` (the asyncpg exception: `.constraint_name`, `.sqlstate`).
  - `errors.CONSTRAINT_MESSAGES: dict[str, tuple[str, str]]` (name → field, message), at least:
    `ck_company_fiscal_year_start_month_range` → (`fiscal_year_start_month`, "Un mois de 1 à 12");
    `ck_partners_shares_positive` → (`shares`, "Un nombre entier de parts"); `ck_partners_contribution_positive` → (`contribution`, "Un montant positif");
    `uq_vat_schemes_label`, `uq_isoc_schemes_label`, `uq_depreciation_models_label`, `uq_categories_label` → (`label`, "Ce libellé existe déjà");
    `ck_vat_schemes_rate_range` → (`rate`, "Un taux de 0 à 100 %"); `ck_vat_schemes_recoverable_rate_range` → (`recoverable_rate`, "Un taux de 0 à 100 %"); `ck_vat_schemes_some_side` → (`for_sales`, "Proposé sur les ventes, les achats ou les deux"); `ck_vat_schemes_recoverable_iff_purchases` → (`recoverable_rate`, "La part récupérable se donne pour les achats, et seulement pour eux");
    `ck_isoc_schemes_deductible_rate_range` → (`deductible_rate`, "Un taux de 0 à 100 %");
    `ck_depreciation_models_years_range` → (`years`, "De 1 à 50 ans");
    `ck_payment_methods_card_statement` → (`statement_closing_day`, "Une carte a un jour de clôture et un jour de paiement"); `ck_payment_methods_closing_day_range` → (`statement_closing_day`, "Un jour de 1 à 31"); `ck_payment_methods_payment_day_range` → (`statement_payment_day`, "Un jour de 1 à 31");
    `ck_categories_settlement_outside` → (`settlement`, "Seule une catégorie hors résultat règle une dette ou une créance").
  - `uses.uses_expr(id_col, *refs) -> ColumnElement[int]` — the sum of `select(func.count()).where(ref == id_col).scalar_subquery()` over each referencing column, `0` when no refs.
  - `schemas.to_read(schema: type[T], obj, **extra) -> T` — `schema.model_validate({**{c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs}, **extra})`.
  - `conftest` fixtures: `client: httpx.AsyncClient` (ASGI transport on `fisac.main.app`, base `http://test`) and `session: AsyncSession` (for inserting pieces through the ORM); a fresh database per test session, reset per test.
  - `GET /api/financial-accounts` → `list[FinancialAccountRead]` (`id, code, name, kind`), ordered by code.

- [ ] **Step 1: Add the dev dependencies and pytest config**

In `pyproject.toml`: `[dependency-groups] dev = ["pytest>=8", "pytest-asyncio>=0.24", "httpx>=0.27"]`; `[tool.pytest.ini_options]` with `testpaths = ["backend/tests"]`, `asyncio_mode = "auto"`. Run `uv lock && uv sync`.

- [ ] **Step 2: Write `backend/tests/conftest.py`**

Decisions the code must follow:
- At import, before any `fisac` import: `os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://fisac:fisac@localhost:5432/fisac_test")`.
- Session fixture (sync, autouse): connect to the server's `postgres` database with asyncpg (in `asyncio.run`), `DROP DATABASE IF EXISTS` + `CREATE DATABASE` the test database, then `alembic.command.upgrade(Config("backend/alembic.ini"), "head")` with `script_location` set to `backend/migrations` (absolute path).
- After the upgrade, snapshot the rows of the seeded tables (`vat_schemes`, `isoc_schemes`, `depreciation_models`, `financial_accounts`, `payment_methods`, `categories`).
- Per-test autouse async fixture, teardown: `TRUNCATE` every table of `Base.metadata` `RESTART IDENTITY CASCADE`, re-insert the snapshot in `Base.metadata.sorted_tables` order with their ids, `setval` each serial sequence to `max(id)`, then `await fisac.db.engine.dispose()` (pytest-asyncio gives each test its own loop; pooled asyncpg connections must not cross loops).

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_financial_accounts.py
async def test_lists_the_seeded_bank(client):
    r = await client.get("/api/financial-accounts")
    assert r.status_code == 200
    assert r.json() == [{"id": 1, "code": "BQ", "name": "Banque · compte courant", "kind": "bank"}]

# backend/tests/test_errors.py
async def test_unmapped_and_mapped_constraints(session):
    session.add(DepreciationModel(label="X", years=60))
    with pytest.raises(HTTPException) as e:
        await errors.commit(session)
    assert e.value.status_code == 422
    assert e.value.detail == [{"loc": ["body", "years"], "msg": "De 1 à 50 ans", "type": "value_error"}]

async def test_uses_expr_counts_each_reference(session):
    # one category referenced by nothing → 0
    q = select(uses_expr(Category.id, SaleLine.category_id, PurchaseLine.category_id)).where(Category.id == 1)
    assert (await session.execute(q)).scalar_one() == 0
```

- [ ] **Step 4: Run them to see them fail**

Run: with Postgres running (`pg_ctlcluster 16 main start`) and a `fisac` role allowed to create databases, `uv run pytest -q`
Expected: FAIL (`404` / import errors).

- [ ] **Step 5: Implement `errors.py`, `uses.py`, `schemas/__init__.py` (`to_read`), the financial-accounts schema and router, and mount it in `main.py`**

`main.py` includes each router with `prefix="/api"` before the frontend mount; routers declare paths without `/api`.

- [ ] **Step 6: Run the tests**

Run: `uv run pytest -q` — Expected: PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(api): test harness, shared errors and uses counts, financial accounts"`

---

### Task 2: Company and partners

**Files:**
- Create: `backend/src/fisac/iban.py`, `backend/src/fisac/schemas/company.py`, `backend/src/fisac/schemas/partners.py`, `backend/src/fisac/routers/company.py`, `backend/src/fisac/routers/partners.py`, `backend/tests/test_iban.py`, `backend/tests/test_company.py`, `backend/tests/test_partners.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Consumes: Task 1's `errors`, `to_read`, fixtures.
- Produces:
  - `iban.normalize(value: str | None) -> str | None` — spaces removed, upper case, `""` → `None`.
  - `iban.problem(value: str) -> str | None` — `None` when valid, else the French message `"IBAN invalide : vérifiez les chiffres"` plus `" (Belgique)"` etc. when the country is known. Lengths `{"BE": 16, "NL": 18, "LU": 20, "DE": 22, "FR": 27}`, names `{"BE": "Belgique", "NL": "Pays-Bas", "LU": "Luxembourg", "DE": "Allemagne", "FR": "France"}`; format `^[A-Z]{2}[0-9]{2}[A-Z0-9]+$`; mod 97 of the rearranged number equals 1.
  - `GET /api/company`, `PATCH /api/company` → `CompanyRead` (all `Company` columns but `id`).
  - `GET/POST /api/partners`, `PATCH/DELETE /api/partners/{id}` → `PartnerRead` (`id, name, shares, contribution`), ordered by `sort_key`; POST appends with `ordering.next_sort_key`.

- [ ] **Step 1: Write the failing tests**

```python
# test_iban.py
@pytest.mark.parametrize("value", ["NL91ABNA0417164300", "BE68539007547034", "DE89370400440532013000", "FR1420041010050500013M02606", "LU280019400644750000"])
def test_specimens_are_valid(value): assert iban.problem(value) is None
def test_wrong_digit(): assert iban.problem("BE68539007547035") == "IBAN invalide : vérifiez les chiffres (Belgique)"
def test_wrong_length(): assert iban.problem("BE6853900754703") == "IBAN invalide : vérifiez les chiffres (Belgique)"
def test_normalize(): assert iban.normalize(" be68 5390 0754 7034 ") == "BE68539007547034" and iban.normalize("  ") is None

# test_company.py
async def test_get_creates_the_row(client):
    r = await client.get("/api/company")
    assert r.status_code == 200 and r.json()["legal_form"] == "srl" and r.json()["fiscal_year_start_month"] == 1
async def test_patch_one_field(client):
    r = await client.patch("/api/company", json={"name": "Ma SRL"})
    assert r.json()["name"] == "Ma SRL" and r.json()["vat_regime"] == "quarterly"
async def test_iban_is_normalised_and_checked(client):
    assert (await client.patch("/api/company", json={"iban": "be68 5390 0754 7034"})).json()["iban"] == "BE68539007547034"
    r = await client.patch("/api/company", json={"iban": "BE00 0000 0000 0000"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "iban"]
async def test_start_month_out_of_range(client):
    assert (await client.patch("/api/company", json={"fiscal_year_start_month": 13})).status_code == 422

# test_partners.py
async def test_crud_and_last_partner(client):
    a = (await client.post("/api/partners", json={"name": "A", "shares": 100, "contribution": "1000"})).json()
    assert a["contribution"] == "1000.00"
    b = (await client.post("/api/partners", json={"name": "B", "shares": 0, "contribution": "0"})).json()
    assert [p["name"] for p in (await client.get("/api/partners")).json()] == ["A", "B"]
    assert (await client.patch(f"/api/partners/{b['id']}", json={"shares": 10})).json()["shares"] == 10
    assert (await client.delete(f"/api/partners/{b['id']}")).status_code == 204
    r = await client.delete(f"/api/partners/{a['id']}")
    assert r.status_code == 409 and r.json()["code"] == "last_partner"
async def test_negative_shares(client):
    assert (await client.post("/api/partners", json={"name": "A", "shares": -1, "contribution": "0"})).status_code == 422
```

- [ ] **Step 2: Run them to see them fail** — `uv run pytest -q backend/tests/test_iban.py backend/tests/test_company.py backend/tests/test_partners.py` → FAIL.
- [ ] **Step 3: Implement** `iban.py`, the schemas (IBAN validated in a Pydantic `field_validator` that normalises then raises `ValueError(problem)`; Pydantic's 422 then carries `loc = ["body", "iban"]`), the two routers; mount them.
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `feat(api): company and partners`

---

### Task 3: Fiscal years

**Files:**
- Create: `backend/src/fisac/fiscal_years.py`, `backend/src/fisac/schemas/fiscal_years.py`, `backend/src/fisac/routers/fiscal_years.py`, `backend/tests/test_fiscal_years.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Consumes: Task 2's `/api/company` row (created on demand: the router reads the start month through the same get-or-create helper, exported as `routers.company.get_or_create(session) -> Company`).
- Produces:
  - `fiscal_years.next_period(start_month: int, latest_end: date | None, today: date) -> tuple[date, date]`
  - `GET /api/fiscal-years` → `list[FiscalYearRead]` (`id, start_date, end_date, state, isoc_small_company, isoc_minimum_pay, isoc_shares_owned`), newest first.
  - `GET /api/fiscal-years/next` → `{"start_date", "end_date"}` (what POST would open; the empty state labels its button from `end_date`'s year).
  - `POST /api/fiscal-years` (no body) → 201 `FiscalYearRead`.
  - `PATCH /api/fiscal-years/{id}` — `state` and the three ISOC booleans only.
  - `GET /api/fiscal-years/{id}/equity-lines` → `list[EquityLineRead]` (`id, label, amount`), by `sort_key`.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize("month, latest, today, expected", [
    (1, None, date(2026, 10, 23), (date(2026, 1, 1), date(2026, 12, 31))),
    (7, None, date(2026, 3, 1), (date(2025, 7, 1), date(2026, 6, 30))),
    (7, None, date(2026, 7, 1), (date(2026, 7, 1), date(2027, 6, 30))),
    (1, date(2026, 12, 31), date(2026, 10, 23), (date(2027, 1, 1), date(2027, 12, 31))),
])
def test_next_period(month, latest, today, expected): assert next_period(month, latest, today) == expected

async def test_two_posts_open_consecutive_years(client):
    first = (await client.post("/api/fiscal-years")).json()
    second = (await client.post("/api/fiscal-years")).json()
    assert date.fromisoformat(second["start_date"]) == date.fromisoformat(first["end_date"]) + timedelta(days=1)
    assert [y["id"] for y in (await client.get("/api/fiscal-years")).json()] == [second["id"], first["id"]]
async def test_next_matches_post(client):
    nxt = (await client.get("/api/fiscal-years/next")).json()
    made = (await client.post("/api/fiscal-years")).json()
    assert (made["start_date"], made["end_date"]) == (nxt["start_date"], nxt["end_date"])
async def test_patch_isoc_conditions_not_dates(client):
    y = (await client.post("/api/fiscal-years")).json()
    assert (await client.patch(f"/api/fiscal-years/{y['id']}", json={"isoc_small_company": False})).json()["isoc_small_company"] is False
    assert (await client.patch(f"/api/fiscal-years/{y['id']}", json={"start_date": "2020-01-01"})).status_code == 422
async def test_equity_lines(client, session):  # insert two lines through the ORM, read them back in sort order with amounts as strings
    ...
```

The last test: insert `EquityLine(label="Perte reportée", amount=Decimal("-33428.16"), sort_key="a1")` and one with `sort_key="a0"`; assert the order and `"amount": "-33428.16"`.

- [ ] **Step 2: Run them to see them fail** — FAIL.
- [ ] **Step 3: Implement** `next_period` (the first year: the 1st of `start_month` in `today.year`, or the year before when that date is after `today`; end = start + 1 year − 1 day, via `dateutil.relativedelta`), the schemas (`FiscalYearUpdate` with `model_config = ConfigDict(extra="forbid")` so unknown fields such as `start_date` are a 422), the router; use `datetime.date.today()` through a module-level `today()` function the tests can monkeypatch if needed.
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `feat(api): fiscal years`

---

### Task 4: Third parties

**Files:**
- Create: `backend/src/fisac/schemas/third_parties.py`, `backend/src/fisac/routers/third_parties.py`, `backend/tests/test_third_parties.py`
- Modify: `backend/src/fisac/main.py`, `backend/tests/conftest.py` (the `add_sale` and `add_purchase_line` helpers)

**Interfaces:**
- Consumes: `iban` (Task 2), `uses_expr`, `to_read`, `errors.in_use`, `errors.commit`.
- Produces: `GET/POST /api/third-parties`, `GET/PATCH/DELETE /api/third-parties/{id}` → `ThirdPartyRead` (`id, name, iban, uses`), by name. `uses = uses_expr(ThirdParty.id, Sale.third_party_id, Purchase.third_party_id)`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_crud(client):
    t = (await client.post("/api/third-parties", json={"name": "Langerman", "iban": "nl91 abna 0417 1643 00"})).json()
    assert t == {"id": t["id"], "name": "Langerman", "iban": "NL91ABNA0417164300", "uses": 0}
    assert (await client.patch(f"/api/third-parties/{t['id']}", json={"iban": ""})).json()["iban"] is None
    assert (await client.delete(f"/api/third-parties/{t['id']}")).status_code == 204
async def test_invalid_iban(client):
    r = await client.post("/api/third-parties", json={"name": "X", "iban": "DE89370400440532013001"})
    assert r.status_code == 422 and r.json()["detail"][0]["msg"].endswith("(Allemagne)")
async def test_in_use(client, session):
    t = (await client.post("/api/third-parties", json={"name": "Client"})).json()
    # insert a FiscalYear and a Sale(third_party_id=t["id"], payment_method_id=1, number=1, document_date=…) through session
    assert (await client.get(f"/api/third-parties/{t['id']}")).json()["uses"] == 1
    r = await client.delete(f"/api/third-parties/{t['id']}")
    assert r.status_code == 409 and (r.json()["code"], r.json()["uses"]) == ("in_use", 1)
```

Put the "a fiscal year plus one sale" insertion in a `conftest` helper `async def add_sale(session, **kw) -> Sale` (creates the fiscal year 2026 when missing); Tasks 5–7 reuse it, plus `add_purchase_line(session, **kw) -> PurchaseLine` (purchase + one line, category 6 "Honoraires", VAT scheme 4, ISOC scheme 1 by default).

- [ ] **Step 2: Run them to see them fail** — FAIL.
- [ ] **Step 3: Implement** the schemas (IBAN validator as in Task 2), the router: list/get select `ThirdParty` with `uses_expr(...).label("uses")`; DELETE reads `uses` first and raises `in_use(uses)` when > 0, else deletes and `errors.commit`.
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `feat(api): third parties`

---

### Task 5: VAT schemes, ISOC schemes, depreciation models

**Files:**
- Create: `backend/src/fisac/schemas/{vat_schemes,isoc_schemes,depreciation_models}.py`, `backend/src/fisac/routers/{vat_schemes,isoc_schemes,depreciation_models}.py`, `backend/tests/test_schemes.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Produces:
  - `/api/vat-schemes` → `VatSchemeRead` (`id, label, rate, recoverable_rate, for_sales, for_purchases, uses`), uses = sale lines + purchase lines.
  - `/api/isoc-schemes` → `IsocSchemeRead` (`id, label, deductible_rate, rubric, uses`), uses = purchase lines.
  - `/api/depreciation-models` → `DepreciationModelRead` (`id, label, years, method, first_year, uses`), uses = fixed assets.
  - Each: `GET` list by label, `POST`, `GET/PATCH/DELETE /{id}`, same in-use rule as Task 4.

- [ ] **Step 1: Write the failing tests**

```python
async def test_vat_lists_the_seed(client):
    labels = [v["label"] for v in (await client.get("/api/vat-schemes")).json()]
    assert len(labels) == 10 and "Achats 21 % · voiture 50 %" in labels
async def test_vat_purchase_needs_recoverable(client):
    r = await client.post("/api/vat-schemes", json={"label": "Z", "rate": "21", "for_sales": False, "for_purchases": True})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "recoverable_rate"]
async def test_vat_in_use(client, session):
    await add_purchase_line(session, vat_scheme_id=4)
    assert (await client.delete("/api/vat-schemes/4")).json()["code"] == "in_use"
async def test_scheme_only_a_default_points_at_is_deletable(client):
    r = await client.delete("/api/vat-schemes/3")      # "Ventes 0 % · cocontractant": no line, no default
    assert r.status_code == 204
    r = await client.delete("/api/isoc-schemes/2")     # "69 % · restaurant", default of "Restaurant"
    assert r.status_code == 204
    # then: the "Restaurant" category's default_isoc_scheme_id, read through the session fixture, is None
async def test_isoc_rate_range(client):
    assert (await client.post("/api/isoc-schemes", json={"label": "X", "deductible_rate": "101", "rubric": "other"})).status_code == 422
async def test_model_years_and_duplicate_label(client):
    assert (await client.post("/api/depreciation-models", json={"label": "X", "years": 0, "method": "linear", "first_year": "prorata"})).status_code == 422
    r = await client.post("/api/depreciation-models", json={"label": "Mobilier · 5 ans", "years": 5, "method": "linear", "first_year": "full"})
    assert r.status_code == 422 and r.json()["detail"][0]["msg"] == "Ce libellé existe déjà"
```

- [ ] **Step 2: Run them to see them fail** — FAIL.
- [ ] **Step 3: Implement** the three schema modules and routers on the Task 4 pattern. Range and side rules are left to the database constraints, translated by `errors.commit` — no duplicate validation in Pydantic.
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `feat(api): VAT schemes, ISOC schemes and depreciation models`

---

### Task 6: Payment methods

**Files:**
- Create: `backend/src/fisac/schemas/payment_methods.py`, `backend/src/fisac/routers/payment_methods.py`, `backend/tests/test_payment_methods.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Produces: `/api/payment-methods` → `PaymentMethodRead` (`id, name, type, financial_account_id, financial_account_name, statement_closing_day, statement_payment_day, settlement_account_id, uses`), by name. `uses` = sales + purchases + misc entries + pay schedules + ISOC prepayments. `PaymentMethodCreate`: `name, type, financial_account_id: int | None, statement_closing_day, statement_payment_day`. `PaymentMethodUpdate`: `name, statement_closing_day, statement_payment_day` only, `extra="forbid"` (type and account changes are a 422).
- Helper in the router: `card_account_code(name: str, taken: set[str]) -> str` — upper-case initials of the name's words (`"Carte Visa"` → `"CV"`), then `CV2`, `CV3`… until free; at most 8 characters.

- [ ] **Step 1: Write the failing tests**

```python
def test_card_account_code():
    assert card_account_code("Carte Visa", {"BQ"}) == "CV"
    assert card_account_code("Carte Visa", {"BQ", "CV"}) == "CV2"
async def test_card_brings_its_account(client):
    m = (await client.post("/api/payment-methods", json={"name": "Carte Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5})).json()
    assert m["financial_account_name"] == "Carte Visa" and m["settlement_account_id"] == 1
    accounts = (await client.get("/api/financial-accounts")).json()
    assert {"code": "CV", "kind": "card"}.items() <= next(a for a in accounts if a["id"] == m["financial_account_id"]).items()
async def test_second_card_same_initials(client):
    await client.post("/api/payment-methods", json={"name": "Carte Visa", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5})
    m = (await client.post("/api/payment-methods", json={"name": "Crédit Volvo", "type": "card", "statement_closing_day": 1, "statement_payment_day": 10})).json()
    assert next(a for a in (await client.get("/api/financial-accounts")).json() if a["id"] == m["financial_account_id"])["code"] == "CV2"
async def test_card_needs_days(client):
    r = await client.post("/api/payment-methods", json={"name": "C", "type": "card"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "statement_closing_day"]
async def test_day_range(client):
    m = (await client.post("/api/payment-methods", json={"name": "C", "type": "card", "statement_closing_day": 25, "statement_payment_day": 5})).json()
    assert (await client.patch(f"/api/payment-methods/{m['id']}", json={"statement_closing_day": 32})).json()["detail"][0]["msg"] == "Un jour de 1 à 31"
async def test_type_is_fixed(client):
    assert (await client.patch("/api/payment-methods/1", json={"type": "cash"})).status_code == 422
async def test_transfer_needs_an_account(client):
    assert (await client.post("/api/payment-methods", json={"name": "V2", "type": "transfer"})).status_code == 422
async def test_in_use(client, session):
    await add_sale(session, payment_method_id=1)
    assert (await client.delete("/api/payment-methods/1")).json()["code"] == "in_use"
```

- [ ] **Step 2: Run them to see them fail** — FAIL.
- [ ] **Step 3: Implement** — POST for a card with no `financial_account_id`: create `FinancialAccount(kind=card, name=name, code=card_account_code(...))` and set `settlement_account_id` to the lowest-id bank account (`field_error("type", "Aucun compte bancaire pour régler la carte")` when none); a non-card without `financial_account_id` is `field_error("financial_account_id", "Choisissez le compte financier")`. Deleting a card method leaves its account (other data may point at it).
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `feat(api): payment methods`

---

### Task 7: Categories

**Files:**
- Create: `backend/src/fisac/schemas/categories.py`, `backend/src/fisac/routers/categories.py`, `backend/tests/test_categories.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Produces: `/api/categories` → `CategoryRead` (`id, label, kind, role, settlement, default_vat_scheme_id, default_isoc_scheme_id, archived, uses`), by label; uses = sale lines + purchase lines + misc entries. `CategoryUpdate` has no `role`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_seed(client):
    cats = (await client.get("/api/categories")).json()
    assert len(cats) == 19 and {c["role"] for c in cats} >= {"sales", "corporate_tax", "fixed_asset"}
async def test_system_rules(client):
    sales = next(c for c in (await client.get("/api/categories")).json() if c["role"] == "sales")
    for call in (client.delete(f"/api/categories/{sales['id']}"),
                 client.patch(f"/api/categories/{sales['id']}", json={"archived": True}),
                 client.patch(f"/api/categories/{sales['id']}", json={"kind": "expense"})):
        r = await call
        assert r.status_code == 409 and r.json()["code"] == "system"
    assert (await client.patch(f"/api/categories/{sales['id']}", json={"label": "Prestations"})).status_code == 200
async def test_in_use_archives_but_does_not_delete(client, session):
    await add_purchase_line(session, category_id=6)
    assert (await client.delete("/api/categories/6")).json()["code"] == "in_use"
    assert (await client.patch("/api/categories/6", json={"archived": True})).json()["archived"] is True
async def test_settlement_on_expense(client):
    r = await client.post("/api/categories", json={"label": "X", "kind": "expense", "settlement": "vat_return"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "settlement"]
async def test_duplicate_label(client):
    r = await client.post("/api/categories", json={"label": "Honoraires", "kind": "expense"})
    assert r.status_code == 422 and r.json()["detail"][0] == {"loc": ["body", "label"], "msg": "Ce libellé existe déjà", "type": "value_error"}
    r = await client.patch("/api/categories/7", json={"label": "Honoraires"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run them to see them fail** — FAIL.
- [ ] **Step 3: Implement** — PATCH on a category with a `role`: `archived=True` or a `kind` different from the current one → `errors.conflict("system", "Une catégorie utilisée par un écran ne s'archive pas et garde son type")`; DELETE with a role → same code, "… ne se supprime pas".
- [ ] **Step 4: Run all API tests** — `uv run pytest -q` → PASS.
- [ ] **Step 5: Commit** — `feat(api): categories`

---

### Task 8: Frontend shell

**Files:**
- Delete: everything under `frontend/src/components/`, `frontend/src/api/`, `frontend/src/accountingDisplay*.ts`, `frontend/src/reportFigures*.ts`
- Modify: `frontend/package.json` (add `react-router` ^7), `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/errors.ts` (+ its test)
- Create: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, `frontend/src/hooks/useResource.ts`, `frontend/src/hooks/useMediaQuery.ts`, `frontend/src/hooks/useAutosave.ts`, `frontend/src/shell/nav.ts`, `frontend/src/shell/AppShell.tsx`, `frontend/src/shell/FiscalYearSwitcher.tsx`, `frontend/src/shell/FiscalYearContext.tsx`, `frontend/src/shell/OpenFirstYear.tsx`, `frontend/src/shell/MobileHeader.tsx`, `frontend/src/screens/Placeholder.tsx`, `frontend/src/shell/nav.test.ts`

**Interfaces:**
- Consumes: the API of Tasks 1–7; read the canvas artboards `Main`, `FiscalYear`, `MobileMenu`, `MobileJournal` for the shell.
- Produces:
  - `types.ts`: one `XRead` type per API schema (amounts `string`), plus `ApiError = { status: number; code?: 'in_use' | 'system' | 'last_partner'; uses?: number; message: string; fields: Record<string, string> }`.
  - `client.ts`: `api.get<T>(path)`, `api.post<T>(path, body?)`, `api.patch<T>(path, body)`, `api.del(path)` — prefix `/api`, throw `ApiError` (422 `detail[]` → `fields[loc.at(-1)] = msg`).
  - `errors.ts`: `messageOf(e: unknown): string` (the French message for a toast).
  - `useResource<T>(path: string | null)` → `{ data: T | undefined; error: ApiError | undefined; loading: boolean; reload(): Promise<void>; setData(fn: (d: T) => T): void }`.
  - `useAutosave(save: (value: string) => Promise<void>, delay = 500)` → `{ onChange(value), onBlur() }`.
  - `useMediaQuery(query: string): boolean`.
  - `nav.ts`: `NAV: { group: string; items: { path: string | null; label: string; icon: LucideIcon }[] }[]` — groups `mouvements` (ventes, achats, divers, immobilisations, journaux), `dirigeant` (rémunération), `taxes` (tva, isoc), `clôture` (résultat, inventaire), `configuration` (structure société `/societe`, inventaire d'ouverture, tiers `/tiers`, catégories `/categories`, régimes de tva `/regimes-tva`, régimes isoc `/regimes-isoc`, modèles d'amortissement `/modeles-amortissement`, moyens de paiement `/moyens-paiement`); `path: null` = not in slice A (shown disabled, "bientôt"); icons as in the canvas's `navItems`.
  - `FiscalYearContext`: `useFiscalYear()` → `{ years: FiscalYearRead[]; current: FiscalYearRead | undefined; setCurrent(id: number): void; openNext(): Promise<void>; next: { start_date: string; end_date: string } | undefined }`; the picked id kept under `localStorage['fisac.fiscalYear']` inside try/catch.
  - `AppShell` renders the sidebar (desktop) or `MobileHeader` + drawer (mobile) around an `<Outlet />`; with no fiscal year it renders `OpenFirstYear` on routes other than configuration routes.

- [ ] **Step 1: Write the failing test**

```ts
// shell/nav.test.ts
it('lists the canvas groups and only slice A routes enabled', () => {
  expect(NAV.map((g) => g.group)).toEqual(['mouvements', 'dirigeant', 'taxes', 'clôture', 'configuration'])
  expect(NAV.flatMap((g) => g.items).filter((i) => i.path).map((i) => i.path)).toEqual(
    ['/societe', '/tiers', '/categories', '/regimes-tva', '/regimes-isoc', '/modeles-amortissement', '/moyens-paiement'])
  expect(NAV.flatMap((g) => g.items).every((i) => i.label === i.label.toLowerCase())).toBe(true)
})
// errors.test.ts — replace the old cases with: a 422 ApiError gives its first field message; a 409 in_use gives "Porté par 2 pièces : impossible de le supprimer"
```

- [ ] **Step 2: Run** `npm run test` — FAIL (module not found).
- [ ] **Step 3: Delete the old app, add `react-router`, implement the modules above;** `App.tsx` declares the routes (`/` → `<Navigate to="/societe" />`, each slice-A path → its screen, `Placeholder` until Tasks 10–15 land), wrapped in `BrowserRouter` and `FiscalYearProvider`.
- [ ] **Step 4: Run** `npm run test && npm run build && npm run check:design` — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): new shell on react-router, API client and hooks`

---

### Task 9: Shared list kit

**Files:**
- Create: `frontend/src/lists/listView.ts`, `frontend/src/lists/listView.test.ts`, `frontend/src/lists/SortHeader.tsx`, `frontend/src/lists/Pager.tsx`, `frontend/src/lists/BulkBar.tsx`, `frontend/src/lists/RowMenu.tsx`, `frontend/src/lists/EditDialog.tsx`, `frontend/src/lists/FullScreenForm.tsx`, `frontend/src/lists/DeleteConfirm.tsx`, `frontend/src/lists/useSelection.ts`

**Interfaces:**
- Produces:
  - `listView<T>(rows: T[], o: { query: string; matches: (row: T, q: string) => boolean; sort: { key: string; dir: 'asc' | 'desc' }; compare: Record<string, (a: T, b: T) => number>; page: number; per?: number }): { rows: T[]; total: number; page: number; pages: number; label: string }` — `per` 25; `page` clamped to `[1, pages]`, `pages ≥ 1`; `label` "lignes 1–25 sur 30" or "aucune ligne"; ties broken by the first compare key.
  - `useSelection<Id>()` → `{ selected: Set<Id>; toggle(id): void; toggleAll(ids: Id[]): void; clear(): void }`.
  - `EditDialog` (desktop `Dialog`, description "Enregistré automatiquement", `onClose`) and `FullScreenForm` (mobile, title + back button + footer "Fermer") both render `children` — each screen's `XForm`.
  - `DeleteConfirm({ title, description, rows, action, onConfirm, onCancel })` — shown inside the same dialog, as the canvas does.
  - `RowMenu({ items: ({ label; icon; danger?; disabled?; run } | 'separator')[] })`, `BulkBar({ label; note?; actions; onClear })`, `SortHeader({ label; active; dir; onToggle })`, `Pager({ label; page; pages; onPrev; onNext })`.

- [ ] **Step 1: Write the failing tests** — `listView`: 30 rows, page 2 → 5 rows, `label` "lignes 26–30 sur 30"; page 9 clamps to 2; empty → `pages` 1 and "aucune ligne"; query filters before paging; `desc` reverses; equal keys keep the tie-break order.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the function and the components from the canvas's `Tiers` artboard markup (bulk bar, row menu, sort heads, pager), with `@qvanderlinden/ui` components.
- [ ] **Step 4: Run** `npm run test && npm run build && npm run check:design` — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): shared list kit`

---

### Task 10: Tiers screen

**Files:**
- Create: `frontend/src/screens/tiers/{TiersScreen,TiersTable,TiersCards,TiersForm}.tsx`, `frontend/src/iban.ts`, `frontend/src/iban.test.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: Tasks 8–9; `ThirdPartyRead`; artboards `Tiers`, `TiersEdition`, `MobileTiers`, `MobileTiersForm`.
- Produces: `checkIban(value: string): { state: 'missing' | 'valid' | 'invalid'; country?: string }`, `groupIban(value: string): string` (the same rules as `backend/src/fisac/iban.py`). Every later screen copies this folder's split: `XScreen` (data + layout switch), `XTable`, `XCards`, `XForm`.

- [ ] **Step 1: Write the failing tests** — `checkIban('NL91ABNA0417164300')` → `{ state: 'valid', country: 'Pays-Bas' }`; `checkIban('BE68539007547035')` → `{ state: 'invalid', country: 'Belgique' }`; `checkIban('')` → `{ state: 'missing' }`; `groupIban('be68539007547034')` → `'BE68 5390 0754 7034'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the screen as the artboards show: search on name and IBAN, IBAN filter (valide · sans IBAN · invalide), sort on nom / IBAN / pièces, badges, row menu (copier l'IBAN, voir les pièces disabled, dupliquer, supprimer or the in-use line), bulk bar (exporter disabled "bientôt", supprimer for unused ones), "Nouveau tiers"; the form autosaves name and IBAN through `useAutosave`; a new tiers left without a name is deleted on close; duplicate = POST of `{ name: name + ' (copie)', iban }`.
- [ ] **Step 4: Run** `npm run test && npm run build && npm run check:design` — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): tiers screen`

---

### Task 11: Catégories screen

**Files:** Create `frontend/src/screens/categories/{CategoriesScreen,CategoriesTable,CategoriesCards,CategoriesForm}.tsx`, `frontend/src/screens/categories/kinds.ts`, `kinds.test.ts`; modify `App.tsx`.

**Interfaces:**
- Consumes: `CategoryRead`, `VatSchemeRead`, `IsocSchemeRead`; artboards `Categories`, `CategorieEdition`, `MobileCategories`, `MobileCategorieForm`.
- Produces: `KINDS: Record<CategoryKind, { label: string; tone: string; hint: string }>` with the canvas's labels and hints (recette · positive, dépense · warning, impôt · info, immobilisation · info, hors résultat · neutral); `ROLE_SCREENS: Record<CategoryRole, string>` (sales "ventes", net_salary / social_contributions / withholding_tax "rémunération", corporate_tax "taxe ISOC", card_statement "décompte Visa", fixed_asset "registre").

- [ ] **Step 1: Failing test** — every `CategoryKind` and `CategoryRole` has an entry; `KINDS.outside.label === 'hors résultat'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — kind tabs with counts (toutes · recettes · dépenses · hors résultat), "afficher les archivées", archive / restore (row menu and bulk, system rows skipped with their note), system rows show their screen and no delete, the form's VAT default offers "hors TVA" plus the schemes and the ISOC default the ISOC schemes; a role category's kind select is disabled.
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): catégories screen`

---

### Task 12: Régimes de TVA and Régimes ISOC screens

**Files:** Create `frontend/src/screens/vat-schemes/…` and `frontend/src/screens/isoc-schemes/…` (Screen, Table, Cards, Form each), `frontend/src/schemeExamples.ts`, `schemeExamples.test.ts`; modify `App.tsx`.

**Interfaces:**
- Consumes: artboards `RegimesTva`, `RegimeTvaEdition`, `MobileRegimesTva`, `MobileRegimeTvaForm`, `RegimesIsoc`, `RegimeIsocEdition`, `MobileRegimesIsoc`, `MobileRegimeIsocForm`.
- Produces:
  - `vatExample(s: { rate: string; recoverable_rate: string | null; for_sales: boolean; for_purchases: boolean }): { side: 'sale' | 'purchase'; vat: string; second: string; third: string }[]` — for €100 net, decimal strings: sale → vat, invoiced (`100 + vat`), revenue `"100.00"`; purchase → vat, recovered (`vat × recoverable / 100`, cents), charge (`100 + vat − recovered`).
  - `isocExample(deductibleRate: string): { admitted: string; disallowed: string }` for a €100 expense.

- [ ] **Step 1: Failing tests** — `vatExample({ rate: '21', recoverable_rate: '50', for_sales: false, for_purchases: true })` → `[{ side: 'purchase', vat: '21.00', second: '10.50', third: '110.50' }]`; `vatExample({ rate: '21', recoverable_rate: null, for_sales: true, for_purchases: false })` → `[{ side: 'sale', vat: '21.00', second: '121.00', third: '100.00' }]`; "Exonéré 0 %" (both sides) gives two rows; `isocExample('69')` → `{ admitted: '69.00', disallowed: '31.00' }`. Compute in integer cents, never with `toFixed(` (check:design rejects it).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both screens: VAT sens filter (toutes · ventes · achats) and the example panel in the form; ISOC rubric filter (restaurant · voiture · autres) and its example.
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): VAT and ISOC scheme screens`

---

### Task 13: Modèles d'amortissement screen

**Files:** Create `frontend/src/screens/depreciation-models/…` (Screen, Table, Cards, Form), `frontend/src/depreciation.ts`, `depreciation.test.ts`; modify `App.tsx`.

**Interfaces:**
- Consumes: artboards `ModelesAmortissement`, `ModeleAmortissementEdition`, `MobileModelesAmortissement`, `MobileModeleAmortissementForm`.
- Produces: `schedule(value: string, acquired: string, years: number, method: 'linear' | 'declining', firstYear: 'prorata' | 'full'): { year: number; amount: string; rest: string }[]` — the canvas's `example(m)` algorithm generalised to any date: the first-year fraction is the days from `acquired` to 31 December inclusive over 365 when `prorata`, 1 when `full`; linear: `value / years` a year, the first one scaled, the last row takes the remainder; declining: twice the linear rate on what remains, switching to linear over the remaining life once that gives more, the last row takes the remainder. The form shows `schedule('1000', '<current year>-07-01', …)`.

- [ ] **Step 1: Failing tests**
  - `schedule('1000', '2026-07-01', 3, 'linear', 'prorata')` → amounts `['168.04', '333.33', '333.33', '165.30']`, years 2026–2029, last `rest` `'0.00'`;
  - `schedule('1000', '2026-07-01', 3, 'linear', 'full')` → `['333.33', '333.33', '333.34']`;
  - `schedule('1000', '2026-07-01', 5, 'declining', 'prorata')`: the first two amounts are `'201.64'` and `'319.34'`, the amounts sum to `'1000.00'`, the last `rest` is `'0.00'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `schedule` in integer cents, and the screen: filter "utilisés / non utilisés", method and first-year selects, the €1 000 example table.
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): depreciation models screen`

---

### Task 14: Moyens de paiement screen

**Files:** Create `frontend/src/screens/payment-methods/…` (Screen, Table, Cards, Form), `frontend/src/statements.ts`, `statements.test.ts`; modify `App.tsx`.

**Interfaces:**
- Consumes: `PaymentMethodRead`, `FinancialAccountRead`; artboards `MoyensPaiement`, `MoyensPaiementVisa`, `MobileMoyensPaiement`, `MobileMoyenPaiementForm`.
- Produces: `nextStatements(closingDay: number, paymentDay: number, today: string, count: number): { month: string; start: string; end: string; payment: string }[]` — ISO dates; the statement still open today, then the next ones; day 31 means the month's last day; the canvas's `statements()` rules.

- [ ] **Step 1: Failing tests**
  - `nextStatements(25, 5, '2026-10-22', 3)` →
    `[{ month: '2026-10', start: '2026-09-26', end: '2026-10-25', payment: '2026-11-05' }, { month: '2026-11', start: '2026-10-26', end: '2026-11-25', payment: '2026-12-05' }, { month: '2026-12', start: '2026-11-26', end: '2026-12-25', payment: '2027-01-05' }]`;
  - `nextStatements(25, 5, '2026-10-26', 1)[0].month` → `'2026-11'`;
  - `nextStatements(31, 5, '2027-02-10', 1)` → `[{ month: '2027-02', start: '2027-02-01', end: '2027-02-28', payment: '2027-03-05' }]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `nextStatements` and the screen: type and account read-only once created, the statement-day fields and the three next statements for a card, "Nouveau moyen de paiement" with type and (non-card) account selects.
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): payment methods screen`

---

### Task 15: Structure société screen

**Files:** Create `frontend/src/screens/company/{CompanyScreen,CompanyIdentity,ManagerCard,PartnersTable,PartnersCards,PartnerForm,EquityCard}.tsx`, `frontend/src/screens/company/fiscalYearHint.ts`, `fiscalYearHint.test.ts`; modify `App.tsx`.

**Interfaces:**
- Consumes: `/api/company`, `/api/partners`, `/api/fiscal-years/{id}/equity-lines` for `useFiscalYear().current`; artboards `Societe`, `SocieteAssocie`, `MobileSociete`, `MobileSocieteAssocie`.
- Produces: `fiscalYearHint(startMonth: number): string` and `sharePercent(parts: number, total: number): string`.

- [ ] **Step 1: Failing tests** — `fiscalYearHint(1)` → `"L’exercice court du 1er janvier au 31 décembre"`; `fiscalYearHint(7)` → `"L’exercice court du 1er juillet au 30 juin"`; `fiscalYearHint(3)` → `"L’exercice court du 1er mars au 28 février"`; `sharePercent(1, 3)` → `"33,3 %"`; `sharePercent(0, 0)` → `"—"`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the page as the artboards show: identity (dénomination, forme, BCE, régime TVA with its hint, siège, IBAN with the live check from Task 10, début d'exercice with the hint), manager card ("rémunéré" switch and its note), partners table with totals and the partner dialog (the delete button hidden for the last partner), equity card read only (apport = partners' total, then the current year's lines; nothing more without a year).
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): structure société screen`

---

### Task 16: End-to-end check and documentation

**Files:**
- Create: `frontend/scripts/smoke.mjs`
- Modify: `frontend/package.json` (devDependency `playwright`, pinned to the version whose Chromium is in `/opt/pw-browsers`; script `"smoke": "node scripts/smoke.mjs"`), `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start the stack** — `uv run alembic upgrade head` on a fresh `fisac` database, `uv run uvicorn fisac.main:app --port 8000` and `npm run dev` (both in the background).
- [ ] **Step 2: Write `smoke.mjs`** — launches Chromium (`executablePath: '/opt/pw-browsers/chromium'` if the pinned Playwright does not find it), and at 1440×1000 then 390×844: opens `/`, saves `smoke/empty-<width>.png`, clicks "Ouvrir l'exercice 2026" (first width only), visits the seven screens and saves `smoke/<screen>-<width>.png`; on `/tiers` creates "Langerman" with IBAN `NL91 ABNA 0417 1643 00` and checks "IBAN valide · Pays-Bas", types `BE68539007547035` and checks the error text; on `/categories` archives "Frais bancaires" and checks it leaves the default list; exits non-zero on any failed check or console error.
- [ ] **Step 3: Run it** — `npm run smoke` — Expected: exit 0 and 16 screenshots (the empty state and the 7 screens, at both widths).
- [ ] **Step 4: Send the screenshots to the user** (SendUserFile), and say that the container exposes no port.
- [ ] **Step 5: Update `CLAUDE.md` and `README.md`** — slice A done; routes mounted under `/api`; `uv run pytest` runs the API tests against `TEST_DATABASE_URL` (default `postgresql+asyncpg://fisac:fisac@localhost:5432/fisac_test`, a role allowed to create databases); `npm run smoke` needs the stack running; the frontend now targets the new API.
- [ ] **Step 6: Commit and push** — `test(frontend): end-to-end smoke of slice A; docs`
