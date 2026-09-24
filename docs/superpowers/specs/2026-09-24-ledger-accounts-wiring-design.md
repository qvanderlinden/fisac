# Wiring up ledger accounts — design

Date: 2026-09-24
Status: approved, not yet implemented
Depends on: `2026-09-24-ledger-accounts-design.md` (the schema), branch
`feat/ledger-accounts`

## Purpose

The schema for general ledger accounts exists but nothing reaches it: no API
can create one, no line can be booked, nothing aggregates. This spec covers
making it usable end to end — a CRUD surface for the chart, a booking control
on invoice lines, and an annual accounts report.

## Scope: three slices, strictly ordered

1. **Chart CRUD** — router, schemas, a `Ledger` tab. Nothing depends on it
   existing first, and nothing else works until it does.
2. **Booking** — `ledger_account_id` on the flow-line schemas, the
   same-Account validation, a picker in `LinesEditor`. Needs a chart to pick
   from.
3. **Annual accounts** — an aggregation endpoint and a view. Needs booked
   lines to aggregate.

Each slice is independently useful and independently reviewable.

## Slice 1 — chart CRUD

### Router

`backend/src/fisac/routers/ledger_accounts.py`, prefix
`/api/accounts/{account_id}/ledger-accounts`, mounted in `main.py`. It mirrors
`routers/categories.py` with one omission: **no `/move` endpoint**, because
`ledger_accounts` has no `sort_key`. Listing is `ORDER BY code`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `` | ordered by `code` |
| POST | `` | 201 |
| PATCH | `/{ledger_account_id}` | partial |
| DELETE | `/{ledger_account_id}` | 204; booked lines survive with NULL |

Scoping follows `_get_category`: a ledger account not belonging to the
path's Account is a 404, never another Account's row.

### Schemas

```python
class LedgerAccountCreate(BaseModel):
    # Digits only, first digit a real PCMN class. Validating here turns a bad
    # code into a 422 instead of letting it reach the database's
    # ck_ledger_accounts_code_digits / _class_range as a 500.
    code: str = Field(pattern=r"^[1-7][0-9]*$", max_length=20)
    name: str = Field(min_length=1, max_length=200)


class LedgerAccountUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[1-7][0-9]*$", max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=200)


class LedgerAccountRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    account_id: int
    code: str
    name: str
    pcmn_class: int
```

**`pcmn_class` is never accepted from the client.** The router derives it as
`int(code[0])` on create and on any update that changes `code`. The column's
check constraint requires the two to agree, so deriving it is the only way
they cannot disagree.

A duplicate `(account_id, code)` maps to **409 Conflict**, not a 500. This
means catching `IntegrityError` around the commit.

### Frontend

`frontend/src/components/LedgerAccountsView.tsx`, modelled on
`CategoriesView.tsx`: rows ordered by code, an inline add row, inline edit,
delete. The PCMN class renders as a read-only badge derived from the code as
the user types, so the rule is visible without being a field to fill in.

A new tab in `App.tsx`: `ledger`, labelled `📒 Ledger`, placed after
`Categories`. It is a wide tab (`page page-wide`), like Categories.

`api/client.ts` gains list/create/update/delete; `api/types.ts` gains the
three hand-mirrored types.

## Slice 2 — booking lines to accounts

### Schemas

`FlowLineCreate` and `FlowLineRead` each gain `ledger_account_id: int | None`
(default `None` on create).

### Validation — the rule the schema spec promised

`routers/flows.py` must reject a line whose `ledger_account_id` belongs to a
different Account than the flow. Until now nothing enforced this and the
database would happily accept it, leaking one Account's lines into another's
annual accounts.

Implementation: on every write that carries lines, collect the non-null
`ledger_account_id` values, and if any are present run one query for the ids
among them that belong to this Account. Anything unmatched is a **400**,
matching `_validate_category`'s existing status for the same class of error —
not 422, which in this codebase means a Pydantic shape failure. One query per
write regardless of line count, not one per line.

Exactly three routes accept client-supplied lines and therefore need this
check — verified against `routers/flows.py`, not assumed:

| Route | Schema | Why |
| --- | --- | --- |
| `POST ""` | `FlowCreate.lines` | creates the line set |
| `PATCH "/{flow_id}"` | `FlowUpdate.lines` (`FlowUpdate = FlowCreate`) | full replace of the line set |
| `POST "/bulk"` | `FlowBulkCreate` items | creates line sets |

`PATCH "/bulk"` does **not** need it: `FlowBulkUpdate` carries no lines. When
its `amount_net` is present it synthesizes one `FlowLineCreate(amount_net,
vat_rate)` itself, so no client-supplied ledger account can reach it.

**Consequence, deliberately left as-is:** a bulk amount edit replaces each
selected flow's whole line set with that synthesized line, which is unbooked —
so bulk-setting an amount clears the booking. This is not new behaviour; that
path already discards descriptions and multi-line structure, as its schema
comment says. Bulk booking is not added here. It is the obvious follow-up if
clearing turns out to bite.

### Frontend

`LinesEditor` gains a `ledgerAccounts: LedgerAccountRead[]` prop and, per
line, a `<select>` of the chart ordered by code, each option labelled
`610000 — Fournitures`, plus a blank option meaning unbooked. `LineDraft`
gains `ledger_account_id: string` (`''` for unbooked), converted at the
`linesToPayload` boundary like the other fields.

**`LinesEditor` receives the chart as a prop, fetched once in `FlowList`.**

An earlier draft had `LinesEditor` fetch it on mount, reasoning that drilling
the list would burden an already 604-line `FlowList`. That reasoning was
wrong. `FlowList` already fetches `categories` (line 105, inside an existing
`Promise.all`) and drills them to `FlowForm`, `FlowRow` and `FlowGenerator` —
the same path, to the same three components, which each already declare a
`categories: CategoryRead[]` prop. Mirroring it costs one more entry in that
`Promise.all` and one more prop alongside a sibling list that is already
there, and it fetches the chart once per account instead of once per opened
editor.

All four call sites pass `ledgerAccounts` down to `LinesEditor`:
`FlowForm.tsx`, `FlowRow.tsx`, `FlowGenerator.tsx` (and `linesToDrafts` must
carry the field back out), and `ProjectionView.tsx`, which renders `FlowForm`
and so must also receive and forward the chart.

A module-level cache was also considered and rejected: it goes stale the
moment the Ledger tab adds an account, and invalidation is machinery this
codebase does not otherwise have.

## Slice 3 — annual accounts

### Endpoint

`backend/src/fisac/routers/annual_accounts.py`,
`GET /api/accounts/{account_id}/annual-accounts?year=YYYY`, defaulting to the
current year. It returns the requested year **and its predecessor** in one
payload, so the comparison column needs no second request.

```jsonc
{
  "year": 2026,
  "classes": [
    { "pcmn_class": 7,
      "label": "Produits",
      "accounts": [ { "id": 12, "code": "700000", "name": "Ventes",
                      "current": "48200.00", "prior": "41000.00",
                      "delta": "7200.00" } ],
      "current_total": "49100.00", "prior_total": "42200.00",
      "delta": "6900.00" }
  ],
  "unassigned": { "current": "-820.00", "prior": "0.00",
                  "delta": "-820.00", "line_count": 4 },
  "result": { "current": "35875.50", "prior": "29400.00",
              "delta": "6475.50" }
}
```

Classes are ordered **descending** (7 Produits before 6 Charges), matching how
a compte de résultats reads. Class labels: 1 Capitaux propres, 2 Immobilisés,
3 Stocks, 4 Créances et dettes, 5 Trésorerie, 6 Charges, 7 Produits.

**Every chart account is returned**, including accounts with zero in both
years, so the view's "show all accounts" toggle filters client-side and needs
no refetch. A class group is emitted only if the chart contains at least one
account of that class.

A class 1-5 account with bookings gets its own group, on the same principle as
the unassigned bucket: the schema permits booking there, so anything booked
stays visible rather than being silently dropped.

`result` is the sum across every class plus `unassigned` — the whole payload,
so nothing can be excluded from the bottom line by a grouping decision.

### Aggregation semantics

Bucketing is by `flows.invoice_date` falling in the calendar year — fiscal,
matching `routers/vat.py`. `payment_date` drives cashflow only and is not
consulted.

Per line, from `2026-09-24-ledger-accounts-design.md`:

```
signed = amount_net * (flow.kind == REVENUE ? +1 : -1)
factor = 1 + (vat_rate / 100) * (1 - vat_deduction_rate / 100)
amount = round_half_up(signed * factor * flow.ratio, cents)
```

`vat_deduction_rate` comes from the flow's category, or **0** when
`category_id IS NULL`. Both rates are percentages. Rounding is per line, to
cents, `ROUND_HALF_UP`.

> **The factor applies uniformly to revenue and expense lines, and this
> carries a known defect** — a revenue flow with no category books the full
> gross, over-stating that sale by the whole VAT. See the "Known defect"
> section of `2026-09-24-ledger-accounts-design.md`. It was kept deliberately
> and must not be silently fixed while implementing this report. Implement
> the formula exactly as written above.

The computation runs in Python over loaded rows, not in SQL, so the rounding
is literally the same code path shape as `_flow_vat` in `routers/vat.py`. Two
years of a personal ledger is a small result set; correctness and consistency
beat pushing arithmetic into the database.

### Frontend

`frontend/src/components/AnnualAccountsView.tsx`, a new `📚 Annual` tab after
`VAT`. A year stepper like `VatView`'s. Per class: a heading, its account
rows with current / prior / delta columns, and a subtotal. Then the unassigned
bucket, then the result row.

A `show all accounts` checkbox, **default off**. Off, a row renders when its
current or prior total is non-zero — so an account used last year but not this
one still shows, with 0,00 and a negative delta, because an account going to
zero is exactly the change the comparison exists to reveal. On, every chart
account renders.

Amount formatting follows `accountingDisplay.ts`, as the other views do.

## Out of scope

- Editing `flows.ratio` — the column exists and nothing can set it; that stays
  true after this work. It is a field on the flow form, not on this surface.
- Any balance-sheet presentation. Classes 1-5 appear only if something was
  booked there; no bilan is produced.
- Class/kind validation. Still deliberately absent, so refunds remain
  expressible.

## Verification

There is no Python test suite and this work does not add one.

- **Backend:** real HTTP calls against a running API for each route, including
  the failure cases — a bad code shape (422), a duplicate code (409), another
  Account's ledger account on a line (400), another Account's ledger account
  by id in the path (404).
- **Frontend:** `cd frontend && npm run build` (`tsc -b`) must pass, and each
  view driven in a browser against the running API.
- **Aggregation:** a hand-checked worked example seeded through the API,
  containing at least one plain expense, one plain sale, one refund booked to
  a class-6 account, one flow with `ratio < 1`, and one unbooked line. The
  expected figures are computed by hand first and compared against the
  endpoint's output. This is where the arithmetic can be silently wrong, so it
  gets checked against numbers derived independently of the code.
