# Tranche ISOC — corporate tax and the result after tax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the Belgian corporate tax (ISOC) from the books — disallowed expenses, rates, advance payments, majoration — and show it on a new ISOC screen and in the result after tax.

**Architecture:** Two pure modules (`books/isoc_params.py`, `books/isoc.py`) hold the legal parameters and the computation; thin routers load data and call them; the result read and the journals reuse them. The frontend adds the ISOC screen and extends Achats, Structure société, Résultat and Journaux with slice A/B building blocks.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2 async, Alembic, pytest; React 19, TypeScript, `@qvanderlinden/ui`, vitest, Playwright 1.56.1.

**Spec:** `docs/superpowers/specs/2026-10-24-tranche-isoc-design.md` (the authority). Canvas artboards `Isoc`, `MobileIsoc`, `Resultat` (summary in the controller's copies).

## Global Constraints

- Conventions of slices A/B: routes under `/api`, decimal strings, ISO dates, error bodies as before, autosave one field per PATCH (dates on blur), money via `src/format.ts`, French copy, design system first, mobile below 640 px.
- Amounts in cents, half-up, line by line.
- Assessment year = calendar year after the fiscal year's end; 2027 parameters: reduced 20 % on the first €100 000, normal 25 %, majoration 6.75 % of the tax, bonifications VA1 9 %, VA2 7.5 %, VA3 6 %, VA4 4.5 %, threshold max(0.5 % × tax, €80), exemption = small company in its first three fiscal years since `incorporated_on`.
- Due dates: the 10th of the 4th, 7th, 10th month and the 20th of the 12th month of the fiscal year, moved to the next Monday on a weekend.
- The three conditions are read as "condition met": `isoc_small_company`, `isoc_minimum_pay`, `isoc_shares_owned` (= not held ≥ 50 % by another company).
- Purchase-line `isoc_scheme_id` NULL is read as the "100 %" scheme.
- End of every backend task: `uv run pytest -q`; of every frontend task: `npm run test && npm run build && npm run check:design`. One commit per task with the repository's attribution lines.

## Review Focus

- A negative result before tax gives base 0, tax 0, majoration 0, and the balance equals − the paid VAs ("Excédent de versements") — test in Task 2.
- A VA paid after the fourth due date earns no bonification but still reduces the balance — test in Task 2.
- A credit note on a restaurant purchase lowers the disallowed amount (signed) — test in Task 2.
- A fiscal year without parameters for its assessment year uses the latest known and says so — test in Task 2.
- A VA cannot use a card method, and paid without a date is refused — test in Task 3.

---

### Task 1: Migration 0008, ISOC scheme on purchase lines, incorporation date

**Files:**
- Create: `backend/migrations/versions/0008_tranche_isoc.py`, `backend/tests/test_isoc_inputs.py`
- Modify: `backend/src/fisac/models.py`, `schemas/company.py`, `schemas/purchases.py` (line create/update/read), `fisac/pieces.py` (purchase line create/patch), `backend/tests/test_depreciation` cases in `backend/tests/books/test_depreciation.py`

**Interfaces:**
- Produces: `Company.incorporated_on: date | None` (read/PATCH via `/api/company`); purchase lines accept `isoc_scheme_id: int | None` on create/PATCH and return `isoc_scheme_id` (a new line defaults to the id of the "100 %" scheme when omitted; NULL stays readable as 100 %).

- [ ] **Step 1: Failing tests**

```python
async def test_company_incorporation_date(client):
    assert (await client.patch("/api/company", json={"incorporated_on": "2025-03-01"})).json()["incorporated_on"] == "2025-03-01"
async def test_purchase_line_isoc_scheme(client, ...):
    # create a purchase + line without isoc_scheme_id → the line's isoc_scheme_id is the "100 %" scheme's id
    # PATCH the line {"isoc_scheme_id": <id of "69 % · restaurant">} → returned
    # an unknown id → 422 loc ["body","isoc_scheme_id"]
```

Add to `tests/books/test_depreciation.py` (slice-B deferred edge cases, values from the reviewer's hand run):
`schedule(Decimal("1000"), date(2027,1,15), 3, LINEAR, PRORATA, 7)` → years `[2027, 2028, 2029, 2030]`, amounts `["152.51", "333.33", "333.33", "180.83"]`; `schedule(Decimal("1000"), date(2026,12,31), 3, LINEAR, PRORATA, 1)[0]` amount `"0.91"`.

- [ ] **Step 2: Run** — FAIL (the depreciation cases may already pass; record it).
- [ ] **Step 3: Implement** migration 0008 (add `company.incorporated_on DATE NULL`), models, schemas, line handling.
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): ISOC scheme on purchase lines, incorporation date`

---

### Task 2: Pure ISOC modules

**Files:**
- Create: `backend/src/fisac/books/isoc_params.py`, `backend/src/fisac/books/isoc.py`, `backend/tests/books/test_isoc_params.py`, `backend/tests/books/test_isoc.py`

**Interfaces:**
- `isoc_params.Params` (frozen dataclass: `assessment_year: int, reduced_rate: Decimal, reduced_ceiling: Decimal, normal_rate: Decimal, majoration_rate: Decimal, bonifications: tuple[Decimal, Decimal, Decimal, Decimal], threshold_rate: Decimal, threshold_min: Decimal`)
- `isoc_params.params_for(assessment_year: int) -> tuple[Params, bool]` (bool = fallback used)
- `isoc_params.due_dates(fy_start: date) -> list[date]` (4 dates)
- `isoc.DisallowedLine` (`rubric: IsocRubric, reference, date, label, base: Decimal (signed), deductible_rate: Decimal, disallowed: Decimal`)
- `isoc.disallowed_part(amount: Decimal, deductible_rate: Decimal) -> Decimal`
- `isoc.Prepayment` (`number: int, amount: Decimal, paid: bool, payment_date: date | None`)
- `isoc.compute(before_tax: Decimal, disallowed: list[DisallowedLine], conditions: tuple[bool, bool, bool], prepayments: list[Prepayment], due: list[date], params: Params, exempt: bool) -> IsocResult` — `IsocResult` fields: `before_tax, disallowed_by_rubric: dict[IsocRubric, Decimal], disallowed_total, taxable_base, reduced: bool, tax_reduced, tax_normal, tax, majoration_gross, bonifications: list[(number, quarter|None, amount)], bonification_total, threshold, majoration, exempt, paid_total, balance, estimated_tax, after_tax`
- `isoc.is_exempt(small_company: bool, incorporated_on: date | None, fy_start: date, start_month: int) -> bool` (the fiscal year is among the first three counted from the one containing `incorporated_on`)

- [ ] **Step 1: Failing tests** (hand-computed)

```python
P, _ = params_for(2027)
def test_due_dates_2026(): assert due_dates(date(2026,1,1)) == [date(2026,4,10), date(2026,7,10), date(2026,10,12), date(2026,12,21)]
def test_fallback(): assert params_for(2031)[1] is True and params_for(2027)[1] is False
def test_disallowed_restaurant(): assert disallowed_part(Decimal("112.00"), Decimal("69")) == Decimal("34.72")
def test_car_asset_depreciation(): assert disallowed_part(Decimal("1000.00"), Decimal("75")) == Decimal("250.00")
def test_reduced_bracket():
    r = compute(Decimal("120000"), [], (True, True, True), [], due, P, False)
    assert (r.tax_reduced, r.tax_normal, r.tax) == (Decimal("20000.00"), Decimal("5000.00"), Decimal("25000.00"))
def test_normal_rate_when_a_condition_fails(): assert compute(Decimal("120000"), [], (True, False, True), [], due, P, False).tax == Decimal("30000.00")
def test_majoration_without_va(): assert compute(Decimal("50000"), [], (True,)*3, [], due, P, False).majoration == Decimal("675.00")   # tax 10000
def test_va1_on_time(): r = compute(Decimal("50000"), [], (True,)*3, [Prepayment(1, Decimal("2000"), True, date(2026,4,1))], due, P, False); assert (r.majoration, r.balance) == (Decimal("495.00"), Decimal("8495.00"))
def test_late_va_moves_to_next_quarter(): assert compute(Decimal("50000"), [], (True,)*3, [Prepayment(1, Decimal("2000"), True, date(2026,4,15))], due, P, False).majoration == Decimal("525.00")
def test_va_after_last_due_earns_nothing(): r = compute(Decimal("50000"), [], (True,)*3, [Prepayment(4, Decimal("2000"), True, date(2026,12,28))], due, P, False); assert (r.majoration, r.balance) == (Decimal("675.00"), Decimal("8675.00"))
def test_below_threshold(): assert compute(Decimal("5000"), [], (True,)*3, [], due, P, False).majoration == Decimal("0.00")   # tax 1000, gross 67.50 < 80
def test_exempt(): assert compute(Decimal("50000"), [], (True,)*3, [], due, P, True).majoration == Decimal("0.00")
def test_is_exempt(): assert is_exempt(True, date(2025,3,1), date(2026,1,1), 1) is True and is_exempt(True, date(2022,3,1), date(2026,1,1), 1) is False and is_exempt(False, date(2025,3,1), date(2026,1,1), 1) is False and is_exempt(True, None, date(2026,1,1), 1) is False
def test_loss(): r = compute(Decimal("-500"), [], (True,)*3, [Prepayment(1, Decimal("100"), True, date(2026,4,1))], due, P, False); assert (r.taxable_base, r.tax, r.majoration, r.balance) == (Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("-100.00"))
def test_credit_note_lowers_disallowed(): # two restaurant lines, +112.00 and −112.00 (credit note) → disallowed_total 0.00
def test_after_tax(): r = compute(Decimal("50000"), [], (True,)*3, [], due, P, False); assert (r.estimated_tax, r.after_tax) == (Decimal("10675.00"), Decimal("39325.00"))
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement** both modules; `isoc_params` documents its sources in a comment (spec "Legal parameters").
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(books): ISOC parameters and computation`

---

### Task 3: Advance payments API and their journal movements

**Files:**
- Create: `backend/src/fisac/routers/isoc_prepayments.py`, `schemas/isoc_prepayments.py`, `backend/tests/test_isoc_prepayments.py`
- Modify: `backend/src/fisac/main.py`, `routers/journals.py`, `books/journals.py` (a third movement kind `isoc_prepayment`), `backend/tests/test_journals_api.py`

**Interfaces:**
- `GET /api/fiscal-years/{fy}/isoc-prepayments` → `list[{id, number, due_date, amount, payment_method_id, paid, payment_date}]`, created on first read with `ON CONFLICT (fiscal_year_id, number) DO NOTHING` (amount 0, the first non-card payment method by id, unpaid, due dates from `isoc_params.due_dates`).
- `PATCH /api/isoc-prepayments/{id}` (`amount`, `payment_method_id`, `payment_date`, `paid`): card method → 422 on `payment_method_id` ("Un versement anticipé ne se paie pas par carte"); paid without a date → 422 on `payment_date` (the existing check constraint mapped in `errors.CONSTRAINT_MESSAGES`).
- Journals: a prepayment with amount > 0 is a movement `kind: "isoc_prepayment"`, `reference: "VA1 · ISOC"`, `piece_id: null`, label "Versement anticipé", amount −amount, on its payment method's account, dated `payment_date` if set else `due_date`, `planned` = not paid.

- [ ] **Step 1: Failing tests** — creation of four rows with 2026 due dates; concurrent first reads both 200 (as `test_vat_api`); PATCH amount and paid; card → 422; paid without date → 422; journal shows `VA1 · ISOC` −2000.00 on the bank, planned while unpaid.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): ISOC advance payments and their journal movements`

---

### Task 4: ISOC read, result after tax, and a year end to end

**Files:**
- Create: `backend/src/fisac/routers/isoc.py`, `schemas/isoc.py`, `backend/tests/test_isoc_api.py`
- Modify: `routers/result.py`, `schemas/result.py`, `main.py`

**Interfaces:**
- A shared loader `fisac/isoc_inputs.py: async def isoc_for_year(session, fiscal_year) -> IsocResult` (loads the result inputs as `routers/result.py` does, the purchase lines' ISOC schemes, the taken-over assets' depreciation with their line's scheme, conditions, prepayments, company start month and `incorporated_on`, params) — used by both routers so they never disagree.
- `GET /api/fiscal-years/{fy}/isoc` per the spec's API section (disallowed lines included; `assessment_year`, `parameters_fallback`).
- `ResultRead` adds `estimated_tax`, `majoration`, `after_tax`.

- [ ] **Step 1: Failing end-to-end test** through the API only (FY2026, quarterly, `pieces.today` patched to 2026-10-24, no incorporation date):
  - a sale of 100000 at "Ventes 21 %";
  - a restaurant purchase of 1000 at "Achats 12 % · non récupérable" with ISOC scheme "69 % · restaurant" → charge 1120.00, disallowed 347.20;
  - VA1 5000 paid 2026-04-01; VA3 5000 paid 2026-10-20 (after its due date → VA4 rate).
  - Assert: `before_tax` "98880.00", `taxable_base` "99227.20", `tax` "19845.44", `majoration` "664.57" (gross 1339.57 − bonifications 450.00 − 225.00), `balance` "10510.01", `estimated_tax` "20510.01", `after_tax` "78369.99"; the result read shows the same `estimated_tax` and `after_tax`; unticking `isoc_minimum_pay` gives `tax` "24806.80".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest -q` — PASS.
- [ ] **Step 5: Commit** — `feat(api): ISOC read and the result after tax`

---

### Task 5: Frontend inputs — ISOC scheme on lines, incorporation date, invalid amounts

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/pieces/LineEditor.tsx`, `pieces/EffectCards.tsx`, `pieces/usePieceRefs.ts` (load ISOC schemes), `screens/company/CompanyIdentity.tsx` (or the fitting company file), tests beside the helpers touched

**Interfaces:**
- Purchase lines show a "Régime ISOC" select (ISOC schemes, a NULL value shown as the "100 %" scheme); the "Dans le résultat" effect card shows the non-deductible part ("dont non admis à l'ISOC : €…"), computed with a pure helper `nonDeductible(charge: string, deductibleRate: string): string` in `src/pieces/` (cents, half-up; `nonDeductible('112.00', '69') === '34.72'`).
- Structure société: "Date de constitution" (date input, saves on blur).
- Line amount/quantity fields: an unreadable value shows the field error and a toast "Montant invalide : il n'a pas été enregistré" on blur instead of silently reverting.

- [ ] **Step 1: Failing test** — `nonDeductible` cases (`'112.00','69' → '34.72'`; `'100.00','100' → '0.00'`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): ISOC scheme on purchase lines, incorporation date`

---

### Task 6: ISOC screen

**Files:** Create `frontend/src/screens/isoc/{IsocScreen,IsocComputation,IsocConditions,IsocPrepayments,IsocCards,DisallowedDetail}.tsx`, `isocView.ts` (+ test); modify `src/shell/nav.ts` (+ test: `isoc` enabled at `/isoc`), `App.tsx`.

**Interfaces:** reads `GET /api/fiscal-years/{fy}/isoc` and `…/isoc-prepayments`; conditions PATCH the fiscal year; VA rows PATCH `/api/isoc-prepayments/{id}` (amount on blur/500 ms, date on blur, method select, paid checkbox) and reload the ISOC read after each save; a disallowed rubric opens its lines (pieces open in `PurchasePanel`, assets go to `/immobilisations?asset=ID`); "estimation" badge; a Callout when `parameters_fallback`. `isocView.balanceLabel(balance: string): 'Solde à payer' | 'Excédent de versements'` and `isocView.conditionLabels` (the three French condition texts) tested.

- [ ] **Step 1: Failing tests** — `balanceLabel('-100.00') === 'Excédent de versements'`; nav enables `/isoc`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (canvas `Isoc` / `MobileIsoc`, spec wins).
- [ ] **Step 4: Run** the three frontend checks — PASS.
- [ ] **Step 5: Commit** — `feat(frontend): ISOC screen`

---

### Task 7: Résultat after tax, Journaux VA, smoke and docs

**Files:** Modify `frontend/src/screens/result/*` (rows "Résultat avant impôt", "Impôt des sociétés estimé" linking to `/isoc`, "Résultat de l'exercice"; tiles), `frontend/src/screens/journals/*` (a `isoc_prepayment` movement opens `/isoc`), `frontend/scripts/smoke.mjs`, `CLAUDE.md`, `README.md`.

- [ ] **Step 1: Failing test** — the result view helper orders the three after-tax rows and labels them (extend `resultView.test.ts`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; extend the smoke: after the slice-B steps, add a restaurant purchase (1000 at "Achats 12 % · non récupérable", ISOC "69 % · restaurant") and VA1 2000 paid, then check the ISOC screen shows the base, the tax and the VA, and Résultat shows "Impôt des sociétés estimé"; screenshots `isoc-1440`, `isoc-390`; the overflow check covers `/isoc`.
- [ ] **Step 4: Run** the three frontend checks and the smoke on a fresh database (`alembic upgrade head`, uvicorn :8000, `npm run dev`) — PASS.
- [ ] **Step 5: Docs** — CLAUDE.md and README: ISOC done, the parameters module and how to update it, the new routes.
- [ ] **Step 6: Commit** — `feat(frontend): result after tax, VA in journals; smoke and docs`
