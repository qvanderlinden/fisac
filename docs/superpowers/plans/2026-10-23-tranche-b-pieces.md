# Tranche B — pieces, register, journals, VAT and result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type sales and purchases (invoices and credit notes), put purchase lines in the fixed-asset register, and read the computed journals, VAT periods and result, desktop and mobile.

**Architecture:** Migration 0006 simplifies categories and ties fixed assets to a purchase line. Every computation lives in pure Python modules under `backend/src/fisac/books/` (no database), called by thin routers; the React screens only display. The frontend reuses slice A's shell, list kit (`src/lists/`), edit session and autosave.

**Tech Stack:** Python 3.14, FastAPI ≥ 0.138, SQLAlchemy 2 async, Alembic, Pydantic v2, pytest; React 19, Vite, TypeScript, `@qvanderlinden/ui`, react-router 7, vitest, Playwright 1.56.1.

**Spec:** `docs/superpowers/specs/2026-10-23-tranche-b-pieces-design.md` (read it; it is the authority). Canvas artboards: https://claude.ai/artifact/WCB1RgFkBKViXKzZBWC6tV (`Ventes`, `Achats`, `Immobilisations`, `Main` = the journal, `Tva`, `Resultat`, and `Mobile…` versions); the controller provides local copies.

## Global Constraints

- Environment as in slice A: Postgres 16 local (`pg_ctlcluster 16 main start`), role `fisac`/`fisac` with CREATEDB; `NODE_AUTH_TOKEN` set; `frontend/node_modules` installed.
- Routes under `/api`; money and rates as decimal strings, dates `YYYY-MM-DD`; error bodies exactly as slice A (404 `{"detail"}`, 409 `{"detail","code","uses"?}`, 422 `{"detail":[{"loc","msg","type"}]}`).
- Amounts in cents, half-up, line by line: `net = round(unit_price × quantity, 2)`, `vat = round(net × rate / 100, 2)`, `recovered = round(vat × recoverable_rate / 100, 2)` (0 when no recoverable rate), `charge = net + vat − recovered`. A credit note's effects use its amounts × −1.
- Result: revenue = Σ signed sale-line net; charges = Σ signed charge of purchase lines no fixed asset takes over; depreciation = each asset's schedule row for the year; result = revenue − charges − depreciation. Pieces count by booking date (`booking_date` NULL = document date).
- References: sales `S-0001`, purchases `A-0001`, fixed assets `I-001`.
- Payment status: `paid` → `paid`; else `planned` if `payment_date >= today`, `late` otherwise.
- Journals start every fiscal year at 0; a movement is `planned` while its piece is unpaid (a card statement while its payment date is after today).
- VAT due date: the 20th of the month after the period's end; status `filed` (filed_on set), `current` (period not ended), `to_file`.
- Autosave: PATCH one field, on blur or 500 ms; a failed PATCH restores the server value and shows the error.
- UI per `frontend/node_modules/@qvanderlinden/ui/SKILL.md` and `docs/brand.md`; French copy, lowercase nav/tabs/tags/eyebrows; money, rates, dates via `src/format.ts`; mobile below 640 px via `useMediaQuery('(max-width: 640px)')`.
- End of every backend task: `uv run pytest -q` passes. End of every frontend task: `npm run test && npm run build && npm run check:design` pass.
- One commit per task, ending with the repository's attribution lines.

## Review Focus

- A piece whose booking date falls in no fiscal year answers a 422 "Aucun exercice ne couvre cette date", not a 500 — test in Task 3.
- Moving a piece's booking date into the next fiscal year renumbers it there without a duplicate number, also when two pieces are created at once — test in Task 3.
- A credit note reverses result, VAT and journal effects (no sign mistake on recovered VAT) — test in Task 7's end-to-end test.
- Changing a taken-over purchase line's price recomputes the asset's non-edited schedule rows and leaves edited ones — test in Task 4.
- A card purchase on the 26th lands in the next month's statement, and February with closing day 31 closes on the 28th — test in Task 2.

---

### Task 1: Migration 0006 and simplified categories

**Files:**
- Create: `backend/migrations/versions/0006_tranche_b.py`
- Modify: `backend/src/fisac/models.py`, `backend/src/fisac/errors.py`, `backend/src/fisac/schemas/categories.py`, `backend/src/fisac/routers/categories.py`, `backend/tests/conftest.py`, `backend/tests/test_categories.py`, and any slice-A test touching category kinds/roles

**Interfaces:**
- Produces: `models.CategoryDirection(StrEnum)` `SALES="sales"`, `PURCHASES="purchases"`; `Category.direction`; `models.PieceKind(StrEnum)` `INVOICE="invoice"`, `CREDIT_NOTE="credit_note"` (replaces `PurchaseKind`; DB enum renamed `piece_kind`); `Sale.kind`; `Sale.payment_date` / `Purchase.payment_date` non-null; `PurchaseLine.isoc_scheme_id` nullable; `FixedAsset` without `acquisition_date`/`acquisition_value`, `purchase_line_id` non-null, FK `ON DELETE RESTRICT`.
- `CategoryRead` = `id, label, direction, archived, uses`; `GET /api/categories?direction=sales|purchases`.
- conftest `add_sale` / `add_purchase_line` default `payment_date=date(2026, 3, 1)`; `add_purchase_line` default `isoc_scheme_id=None`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_categories.py` (replace the role/kind tests)

```python
async def test_seed_after_0006(client):
    cats = (await client.get("/api/categories")).json()
    assert {c["label"] for c in cats if c["direction"] == "sales"} == {"Prestations de services", "Autres recettes"}
    assert {c["label"] for c in cats if c["direction"] == "purchases"} == {
        "Honoraires", "Logiciels et abonnements", "Petit matériel", "Formation",
        "Restaurant", "Déplacements", "Frais de voiture", "Frais bancaires"}
    assert set(cats[0]) == {"id", "label", "direction", "archived", "uses"}
async def test_filter_by_direction(client):
    assert all(c["direction"] == "sales" for c in (await client.get("/api/categories?direction=sales")).json())
async def test_direction_of_used_category_is_fixed(client, session):
    await add_purchase_line(session, category_id=6)
    r = await client.patch("/api/categories/6", json={"direction": "sales"})
    assert r.status_code == 422 and r.json()["detail"][0]["loc"] == ["body", "direction"]
async def test_any_category_can_be_deleted_when_unused(client):
    sales = next(c for c in (await client.get("/api/categories")).json() if c["label"] == "Prestations de services")
    assert (await client.delete(f"/api/categories/{sales['id']}")).status_code == 204
```

- [ ] **Step 2: Run** `uv run pytest -q backend/tests/test_categories.py` — FAIL.
- [ ] **Step 3: Write migration 0006** — per the spec's "Data model changes": drop the category columns, constraints, index `uq_categories_role` and the three enum types; add `direction` filled from the old kind (`revenue` → `sales`, else `purchases`); delete the nine listed seeded categories only where no `sale_lines`/`purchase_lines`/`misc_entries` row uses them; rename enum `purchase_kind` → `piece_kind` and add `sales.kind` (default `invoice`); set NULL payment dates to `document_date`, then NOT NULL, and drop `ck_sales_paid_has_date` / `ck_purchases_paid_has_date`; `purchase_lines.isoc_scheme_id` nullable; delete fixed assets without a line, drop `acquisition_date`, `acquisition_value` and `ck_fixed_assets_acquisition_value_positive`, make `purchase_line_id` NOT NULL with the FK recreated `ON DELETE RESTRICT`. No downgrade (as 0005).
- [ ] **Step 4: Update** `models.py` to match; remove `CategoryKind`, `CategoryRole`, `CategorySettlement`; update `errors.CONSTRAINT_MESSAGES` (drop the category settlement entry); rewrite the categories schema and router (no `system` 409; direction change of a category with `uses > 0` → `field_error("direction", "Une catégorie utilisée garde son sens")`); update conftest helpers; fix any slice-A test broken by the model change.
- [ ] **Step 5: Run** `uv run pytest -q` — PASS.
- [ ] **Step 6: Commit** — `feat(api): migration 0006, categories as labels with a direction`

---

### Task 2: Pure computation modules — amounts, depreciation, card statements

**Files:**
- Create: `backend/src/fisac/books/__init__.py`, `books/amounts.py`, `books/depreciation.py`, `books/card_statements.py`, `backend/tests/books/test_amounts.py`, `test_depreciation.py`, `test_card_statements.py`

**Interfaces:**
- `amounts.cents(x: Decimal) -> Decimal` (half-up to 0.01)
- `amounts.LineAmounts` (frozen dataclass: `net, vat, recovered, charge: Decimal`)
- `amounts.line_amounts(unit_price: Decimal, quantity: Decimal, rate: Decimal, recoverable_rate: Decimal | None) -> LineAmounts`
- `amounts.sign(kind: PieceKind) -> int` (+1 / −1)
- `depreciation.fiscal_year_of(day: date, start_month: int) -> tuple[date, date]` (the fiscal year containing `day`)
- `depreciation.schedule(value: Decimal, acquired: date, years: int, method: DepreciationMethod, first_year: FirstYearRule, start_month: int) -> list[tuple[int, Decimal]]` — `(year, amount)`, `year` = calendar year the fiscal period ends in. The slice-A frontend algorithm (`frontend/src/depreciation.ts`) with periods = fiscal years: the first period's fraction is days from `acquired` to its fiscal-year end inclusive over 365, capped at 1, when `prorata`; 1 when `full`.
- `card_statements.Statement` (dataclass `start: date, end: date, payment: date`); `card_statements.statement_for(day: date, closing_day: int, payment_day: int) -> Statement` — the statement that contains `day`, same rules as `frontend/src/statements.ts` (day 31 / beyond month length = the month's last day; payment day clamped in the payment month).

- [ ] **Step 1: Write the failing tests**

```python
# test_amounts.py
def test_purchase_line_partly_recoverable():
    a = line_amounts(Decimal("100"), Decimal("1"), Decimal("21"), Decimal("50"))
    assert (a.net, a.vat, a.recovered, a.charge) == (Decimal("100.00"), Decimal("21.00"), Decimal("10.50"), Decimal("110.50"))
def test_non_recoverable_and_quantity_rounding():
    a = line_amounts(Decimal("33.33"), Decimal("3"), Decimal("12"), None)
    assert (a.net, a.vat, a.recovered, a.charge) == (Decimal("99.99"), Decimal("12.00"), Decimal("0.00"), Decimal("111.99"))
def test_half_up(): assert cents(Decimal("0.125")) == Decimal("0.13")
def test_sign(): assert (sign(PieceKind.INVOICE), sign(PieceKind.CREDIT_NOTE)) == (1, -1)

# test_depreciation.py
def amounts(rows): return [str(a) for _, a in rows]
def test_linear_prorata_calendar():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 3, DepreciationMethod.LINEAR, FirstYearRule.PRORATA, 1)
    assert [y for y, _ in rows] == [2026, 2027, 2028, 2029] and amounts(rows) == ["168.04", "333.33", "333.33", "165.30"]
def test_linear_full(): assert amounts(schedule(Decimal("1000"), date(2026, 7, 1), 3, DepreciationMethod.LINEAR, FirstYearRule.FULL, 1)) == ["333.33", "333.33", "333.34"]
def test_declining():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 5, DepreciationMethod.DECLINING, FirstYearRule.PRORATA, 1)
    assert amounts(rows)[:2] == ["201.64", "319.34"] and sum(a for _, a in rows) == Decimal("1000.00")
def test_fiscal_year_from_july():
    rows = schedule(Decimal("1000"), date(2026, 7, 1), 3, DepreciationMethod.LINEAR, FirstYearRule.PRORATA, 7)
    assert [y for y, _ in rows] == [2027, 2028, 2029] and amounts(rows) == ["333.33", "333.33", "333.34"]
def test_fiscal_year_of(): assert fiscal_year_of(date(2026, 3, 1), 7) == (date(2025, 7, 1), date(2026, 6, 30))

# test_card_statements.py
def test_statement_open_today(): assert statement_for(date(2026, 10, 22), 25, 5) == Statement(date(2026, 9, 26), date(2026, 10, 25), date(2026, 11, 5))
def test_after_closing_goes_to_next(): assert statement_for(date(2026, 10, 26), 25, 5).end == date(2026, 11, 25)
def test_february_closing_31(): assert statement_for(date(2027, 2, 10), 31, 5) == Statement(date(2027, 2, 1), date(2027, 2, 28), date(2027, 3, 5))
def test_december_rolls_year(): assert statement_for(date(2026, 12, 28), 25, 5).payment == date(2027, 2, 5)
```

- [ ] **Step 2: Run** `uv run pytest -q backend/tests/books` — FAIL (module not found).
- [ ] **Step 3: Implement** the three modules (no database, no FastAPI imports).
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(books): line amounts, depreciation schedule, card statements`

---

### Task 3: Sales and purchases API

**Files:**
- Create: `backend/src/fisac/pieces.py` (shared numbering, status, read building), `backend/src/fisac/schemas/sales.py`, `schemas/purchases.py`, `routers/sales.py`, `routers/purchases.py`, `backend/tests/test_sales.py`, `test_purchases.py`
- Modify: `backend/src/fisac/main.py`

**Interfaces:**
- Consumes: Task 1 models; Task 2 `line_amounts`, `sign`; slice A `errors`, `uses`, `ordering.next_sort_key`, `routers.company.get_or_create`.
- Produces:
  - `pieces.fiscal_year_for(session, day: date) -> FiscalYear` (raises `field_error(field, "Aucun exercice ne couvre cette date")`; caller passes the field name)
  - `pieces.next_number(session, model, fiscal_year_id: int) -> int` (takes `pg_advisory_xact_lock` keyed per model and fiscal year)
  - `pieces.status(paid: bool, payment_date: date, today: date) -> Literal["paid", "planned", "late"]`; `pieces.today()` module-level, monkeypatchable
  - `pieces.reference(prefix: str, number: int, width: int) -> str` (`reference("S", 1, 4) == "S-0001"`, `reference("I", 4, 3) == "I-004"`)
  - Routes and read shapes exactly as the spec's "Sales and purchases" section (`SaleRead`, `PurchaseRead` with lines; `PurchaseLineRead` carries `fixed_asset_id`, `fixed_asset_number`).
  - `GET /api/purchase-lines/available?q=` per the spec.

- [ ] **Step 1: Write the failing tests** (`test_sales.py`; mirror the relevant ones in `test_purchases.py`)

```python
async def open_2026(client): await client.post("/api/fiscal-years")   # FY 2026 (today() is 2026)
# SALES_CAT: the id of "Prestations de services", read from GET /api/categories?direction=sales in a fixture
async def test_create_numbers_and_totals(client):
    await open_2026(client)
    s = (await client.post("/api/sales", json={"kind": "invoice", "document_date": "2026-02-10", "payment_method_id": 1, "payment_date": "2026-03-01"})).json()
    assert s["number"] == 1 and s["lines"] == [] and s["total"] == "0.00"
    s = (await client.post(f"/api/sales/{s['id']}/lines", json={"description": "Conseil", "unit_price": "1000", "quantity": "1", "category_id": SALES_CAT, "vat_scheme_id": 1})).json()
    assert (s["net"], s["vat"], s["total"]) == ("1000.00", "210.00", "1210.00")
async def test_no_fiscal_year(client):
    r = await client.post("/api/sales", json={"kind": "invoice", "document_date": "2030-01-01", "payment_method_id": 1, "payment_date": "2030-01-01"})
    assert r.status_code == 422 and r.json()["detail"][0] == {"loc": ["body", "document_date"], "msg": "Aucun exercice ne couvre cette date", "type": "value_error"}
async def test_booking_date_moves_and_renumbers(client):
    # open 2026 and 2027; create two sales in 2026; move the second's booking_date to 2027-01-05
    # → its number is 1 in FY2027; patching booking_date back equal to document_date stores NULL (read shows the document date)
async def test_status(client, monkeypatch):
    # unpaid, payment_date tomorrow → "planned"; yesterday → "late"; paid → "paid"
async def test_card_refused_on_sales(client):
    # create a card method via /api/payment-methods; POST a sale with it → 422 loc ["body","payment_method_id"], msg "Une vente ne se paie pas par carte"
async def test_line_category_direction(client):
    # a purchase category on a sale line → 422 loc ["body","category_id"], msg "Choisissez une catégorie de vente"
async def test_concurrent_creates_get_distinct_numbers(client):
    # asyncio.gather of 4 POST /api/sales in FY2026 → numbers {1,2,3,4}
```

Purchases add: credit note kind; `recovered`/`charge` totals (`Achats 21 % · voiture 50 %` line of 100 → recovered `"10.50"`, charge `"110.50"`); `available` lists an invoice line, not a credit-note line.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `pieces.py`, schemas, routers; mount in `main.py`. Line routes answer the whole parent piece. Deleting a sale or purchase deletes its lines (CASCADE).
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): sales and purchases with lines`

---

### Task 4: Fixed assets API

**Files:**
- Create: `backend/src/fisac/schemas/fixed_assets.py`, `routers/fixed_assets.py`, `backend/src/fisac/register.py` (store/refresh a schedule), `backend/tests/test_fixed_assets.py`
- Modify: `routers/purchases.py` (lock on taken-over lines; refresh schedules on change), `main.py`

**Interfaces:**
- Consumes: Task 2 `schedule`, `line_amounts`; Task 3 `pieces.reference`.
- Produces:
  - `register.asset_value(line: PurchaseLine, scheme: VatScheme) -> Decimal` (the line's charge) and `register.refresh_schedule(session, asset: FixedAsset, *, reset: bool = False) -> None` (rewrites non-edited rows; `reset=True` rewrites all and clears `edited`)
  - Routes and `FixedAssetRead` exactly as the spec's "Fixed assets" section; `FixedAssetRead.schedule: list[{year, amount, edited}]`.
  - Purchases: deleting a taken-over line or its purchase → 409 `in_use` with detail `"Reprise par l'immobilisation I-004"`; making its purchase a credit note → 422 on `kind`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_create_from_line(client, session):
    line = await add_purchase_line(session, unit_price=1500, vat_scheme_id=4)  # Achats 21 % · récupérable
    a = (await client.post("/api/fixed-assets", json={"purchase_line_id": line.id, "description": "Portable", "depreciation_model_id": 1})).json()
    assert (a["number"], a["value"], a["acquired_on"]) == (1, "1500.00", "2026-03-01")
    assert sum(Decimal(r["amount"]) for r in a["schedule"]) == Decimal("1500.00")
async def test_line_taken_once(client, session): # a second POST with the same line → 422 loc ["body","purchase_line_id"]
async def test_edit_then_price_change(client, session):
    # PUT depreciations/2027 {"amount": "400"} → edited; PATCH the purchase line unit_price 3000
    # → 2027 stays "400.00" edited, the other rows recomputed for 3000
async def test_recompute_resets(client, session): # after an edit, POST recompute → no row edited, rows == schedule(...)
async def test_line_lock(client, session):
    # DELETE /api/purchase-lines/{id} and DELETE /api/purchases/{id} → 409, detail "Reprise par l'immobilisation I-001"
async def test_register_for_year(client, session):
    # GET /api/fiscal-years/{fy}/fixed-assets → depreciated_before "0.00", depreciation == row 2026, remaining, status "in_service", schedule_balanced True
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; the purchase and purchase-line PATCH handlers call `register.refresh_schedule` for an affected asset (price, quantity, VAT scheme, booking date).
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): fixed-asset register from purchase lines`

---

### Task 5: Journals

**Files:**
- Create: `backend/src/fisac/books/journals.py`, `backend/src/fisac/routers/journals.py`, `schemas/journals.py`, `backend/tests/books/test_journals.py`, `backend/tests/test_journals_api.py`
- Modify: `main.py`

**Interfaces:**
- Consumes: Task 2 `statement_for`, `sign`; Task 3 piece amounts.
- Produces:
  - `journals.CashPiece` (dataclass: `date, kind: Literal["sale","purchase"], piece_id, reference, label, amount: Decimal (signed, in > 0), account_id, paid: bool, card_method_id: int | None`)
  - `journals.Card` (dataclass: `method_id, name, account_id, settlement_account_id, closing_day, payment_day`)
  - `journals.build(accounts: list[Account], pieces: list[CashPiece], cards: list[Card], start: date, end: date, today: date) -> list[Journal]` — `Journal` has `account, opening, receipts, payments, closing, movements` with running `balance`; statements per the spec (one per statement with purchases; out of the settlement account, in to the card account, on the payment date; reference `"Décompte {card name} · {mois}"` with the French month of the statement's end, e.g. `"Décompte Carte Visa · octobre"`; `planned` while its payment date is after today). Only movements dated within `[start, end]`.
  - `GET /api/fiscal-years/{fy}/journals` per the spec.

- [ ] **Step 1: Write the failing unit tests** — a sale paid by transfer (in), a purchase credit note (in), two card purchases on 2026-10-22 and 2026-10-26 → two statements (`2026-11-05`, `2026-12-05`), the card journal closes at 0 after both, running balances, `planned` flags with `today = 2026-10-23`; pieces paid outside the fiscal year are excluded.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `journals.py` and the router (loads pieces of any fiscal year whose payment date falls in this one).
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): computed journals with card statements`

---

### Task 6: VAT periods

**Files:**
- Create: `backend/src/fisac/books/vat.py`, `routers/vat_periods.py`, `schemas/vat_periods.py`, `backend/tests/books/test_vat.py`, `backend/tests/test_vat_api.py`
- Modify: `main.py`

**Interfaces:**
- Produces:
  - `vat.periods(start: date, end: date, regime: VatRegime) -> list[tuple[date, date]]` (quarters or months clipped to the fiscal year; `[]` for franchise / none)
  - `vat.due_date(period_end: date) -> date`; `vat.status(period_end: date, filed_on: date | None, today: date) -> Literal["current","to_file","filed"]`
  - `vat.summarize(lines: list[VatLine]) -> VatSummary` (`VatLine`: `booking_date, net, vat, recovered, side: Literal["sale","purchase"]`, already signed; `VatSummary`: `sales_net, sales_vat, purchases_net, purchases_vat_recovered, balance`)
  - `GET /api/fiscal-years/{fy}/vat-periods` (response `{regime, periods: [...]}`) and `PATCH /api/vat-periods/{id}` `{filed_on}` per the spec; `vat_returns` rows created on first read.

- [ ] **Step 1: Write the failing tests** — `periods` quarterly 2026 → four quarters; monthly → twelve; franchise → `[]`; `due_date(date(2026, 12, 31)) == date(2027, 1, 20)`; status cases; a sale line 1000/210 and a purchase line 100/21 recovered 21 in Q1 → balance `"189.00"`; API: PATCH `filed_on` → status `filed`; company switched to monthly → twelve periods.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): VAT periods`

---

### Task 7: Result and the end-to-end API year

**Files:**
- Create: `backend/src/fisac/books/result.py`, `routers/result.py`, `schemas/result.py`, `backend/tests/books/test_result.py`, `backend/tests/test_year_end_to_end.py`
- Modify: `main.py`

**Interfaces:**
- Produces: `result.compute(sale_lines: list[ResultLine], purchase_lines: list[ResultLine], depreciation: list[AssetDepreciation]) -> Result` (`ResultLine`: `category_id, category_label, piece reference/date/tiers, amount` signed — net for sales, charge for purchase lines not taken over; `Result`: `revenue {total, by_category}`, `charges {total, by_category}`, `depreciation {total, by_asset}`, `result`); `GET /api/fiscal-years/{fy}/result` per the spec.

- [ ] **Step 1: Write the failing tests** — unit cases, then `test_year_end_to_end.py` through the API only (FY2026, quarterly, `today()` = 2026-10-23):
  - S-0001 invoice booked 2026-02-10, 1000 at "Ventes 21 %", paid 2026-03-01 by transfer;
  - S-0002 credit note booked 2026-04-15, 100 at "Ventes 21 %", paid 2026-04-20;
  - A-0001 invoice 2026-03-05, 1500 at "Achats 21 % · récupérable", paid 2026-03-20, its line registered with "Informatique · 3 ans";
  - A-0002 invoice 2026-05-10, 100 at "Achats 12 % · non récupérable", "Restaurant", paid 2026-05-10;
  - A-0003 invoice 2026-10-22, 50 at "Achats 21 % · récupérable", paid by a new card (closing 25, payment 5) on 2026-10-22.
  - Assert: result revenue `"900.00"`, charges `"162.00"`, depreciation = the asset's 2026 row, result = 738 − that row; VAT Q1 balance `"-105.00"`, Q2 `"-21.00"`, Q4 `"-10.50"`; bank journal movements +1210, −1815, −121, −112, −60.50 (planned, 2026-11-05) closing `"-898.50"`; card journal −60.50 then +60.50, closing `"0.00"`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): result, and a fiscal year end to end`

---

### Task 8: Frontend data layer, categories screen and nav

**Files:**
- Modify: `frontend/src/api/types.ts` (new Read types from the backend schemas; `CategoryRead` with `direction`), `frontend/src/shell/nav.ts` (+ test), `frontend/src/screens/categories/*` (tabs ventes / achats, no defaults, no system rows; delete `kinds.ts`/`kinds.test.ts` if unused), `frontend/src/App.tsx` (routes for the new screens, rendering a small "en construction" stub component until their tasks land)
- Create: `frontend/src/pieces/pieceStatus.ts` (+ test)

**Interfaces:**
- Produces: nav paths `/ventes`, `/achats`, `/immobilisations`, `/journaux`, `/tva`, `/resultat` enabled; `statusLabel(status: 'paid'|'planned'|'late'): { label: 'payée'|'planifiée'|'en retard'; tone: 'positive'|'neutral'|'negative' }`; `reference(prefix: 'S'|'A'|'I', n: number): string` (`S-0001`, `A-0001`, `I-001`).

- [ ] **Step 1: Failing tests** — nav enabled paths now include the six new ones before the configuration ones, in nav order; `statusLabel('late').label === 'en retard'`; `reference('I', 4) === 'I-004'`.
- [ ] **Step 2: Run** `npm run test` — FAIL.
- [ ] **Step 3: Implement**; the Catégories screen follows the new API (the edit session rules from slice A unchanged).
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): categories as labels, piece helpers, nav for slice B`

---

### Task 9: Shared piece editor and the Ventes screen

**Files:**
- Create: `frontend/src/pieces/LineEditor.tsx`, `pieces/PieceHeader.tsx`, `pieces/EffectCards.tsx`, `pieces/piecesList.ts` (+ test), `frontend/src/screens/sales/{SalesScreen,SalesTable,SalesCards,SalesForm}.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: Task 8 helpers; slice A `src/lists/*`, edit session, `useAutosave`, `format.ts`.
- Produces: `LineEditor` (props: `lines`, `side: 'sale'|'purchase'`, `categories`, `vatSchemes`, `onAdd()`, `onPatch(lineId, field, value)`, `onRemove(lineId)`), `PieceHeader` (kind, tiers, description, the two dates with "Rétablir", payment method filtered by side, payment date, payée), `EffectCards` (from a `SaleRead`/`PurchaseRead`), `piecesList.filterPieces(rows, { tiers, status, period, kind, query })` and `piecesList.totals(rows) -> { net, vat, total }` — reused by Task 10.

- [ ] **Step 1: Failing tests** — `filterPieces` on status and period (by booking date quarter), `totals` sums signed credit notes.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the shared pieces and the Ventes screen per the spec (list, row menu: dupliquer, marquer payée, créer la note de crédit, supprimer; form; new piece created at once; a piece closed with no line and no tiers is deleted).
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): ventes screen and shared piece editor`

---

### Task 10: Achats screen

**Files:** Create `frontend/src/screens/purchases/{PurchasesScreen,PurchasesTable,PurchasesCards,PurchasesForm}.tsx`; modify `App.tsx`.

**Interfaces:** Consumes Task 9's `LineEditor`, `PieceHeader`, `EffectCards`, `piecesList`. A taken-over line shows "au registre · I-004" linking to `/immobilisations` with that asset open, and is not removable; the purchase's delete shows the API's 409 text.

- [ ] **Step 1: Failing test** — extend `piecesList.test.ts`: the invoice / credit-note filter.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the screen per the spec (recovered VAT and charge in the effect card).
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): achats screen`

---

### Task 11: Immobilisations screen

**Files:** Create `frontend/src/screens/fixed-assets/{FixedAssetsScreen,FixedAssetsTable,FixedAssetsCards,FixedAssetForm,ScheduleTable,PurchaseLinePicker}.tsx`, `fixedAssetsList.ts` (+ test); modify `App.tsx`. Remove `frontend/src/depreciation.ts` usage only if the Modèles d'amortissement example still needs it (keep it there).

**Interfaces:** `PurchaseLinePicker` (searchable select over `GET /api/purchase-lines/available?q=`); new asset = pick a line, then description (prefilled from the line) and model; value, date and linked piece read only; schedule rows editable (`PUT …/depreciations/{year}`), badge "modifié", "Recalculer", warning "Le tableau ne tombe pas juste" when `schedule_balanced` is false.

- [ ] **Step 1: Failing test** — `fixedAssetsList.totals` and the status filter.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): immobilisations screen`

---

### Task 12: Journaux screen

**Files:** Create `frontend/src/screens/journals/{JournalsScreen,JournalTable,JournalCards,MovementDetail}.tsx`, `journalsView.ts` (+ test); modify `App.tsx`.

**Interfaces:** one tab per journal (`account.name`), four tiles, movements with running balance, "prévu" badge, réalisés / prévus filter (`journalsView.filterMovements(movements, 'all'|'done'|'planned')`); a sale or purchase movement opens its piece's form (reusing Task 9/10 forms), a card statement shows its purchases.

- [ ] **Step 1: Failing test** — `filterMovements` keeps the server's running balance values.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): journaux screen`

---

### Task 13: TVA and Résultat screens

**Files:** Create `frontend/src/screens/vat/{VatScreen,VatPeriodView,VatCards}.tsx`, `frontend/src/screens/result/{ResultScreen,ResultTable,ResultCards,ResultDetail}.tsx`, `vatView.ts` (+ test); modify `App.tsx`.

**Interfaces:** TVA: one tab per period labelled `T1 · déposée` / `octobre · en cours` (`vatView.periodLabel(period, regime)`), the summary, `filed_on` typed in place (PATCH), the period's pieces opening their forms; franchise / none → a Callout. Résultat: tiles, revenue by category, charges by category, depreciation by asset, result; each row opens its pieces.

- [ ] **Step 1: Failing test** — `periodLabel` for a quarter (`T1`) and a month (`octobre`), with the French status word (`en cours`, `à déposer`, `déposée`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both screens.
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): TVA and résultat screens`

---

### Task 14: Smoke and documentation

**Files:** Modify `frontend/scripts/smoke.mjs`, `CLAUDE.md`, `README.md`.

- [ ] **Step 1: Extend the smoke** — after the configuration screens: create a sale (one line 1000 at Ventes 21 %), a purchase (one line 1500 at Achats 21 % · récupérable), register that purchase line as a fixed asset with "Informatique · 3 ans", then check the journal shows the two movements, the TVA period shows sales VAT `210,00` and recovered `315,00`, and the result's revenue is `1 000,00`; screenshot `ventes`, `achats`, `immobilisations`, `journaux`, `tva`, `resultat` at 1440 and 390.
- [ ] **Step 2: Run** on a fresh database (drop/recreate `fisac`, `alembic upgrade head`, uvicorn + `npm run dev`) — `npm run smoke` exits 0 with the new screenshots.
- [ ] **Step 3: Update docs** — slice B done, new routes listed, the category model change, the three result rules.
- [ ] **Step 4: Commit** — `test(frontend): smoke of slice B; docs`
