# General ledger accounts — design

Date: 2026-09-24
Status: approved, not yet implemented

## Purpose

Introduce a chart of accounts to fisac so that revenue and expense amounts can
be booked to general ledger accounts, and so that annual accounts (compte de
résultats, later bilan) can be produced by grouping on those accounts.

This spec covers the data model only. The HTTP API, the frontend, and the
annual-accounts report are separate pieces of work.

## Naming

The entity is `LedgerAccount`, table `ledger_accounts`.

`Account` is already taken in this codebase: it is the bank-account/entity
concept carrying `is_company`, `vat_applicable`, `current_balance`, and the
Visa closing/payment days. Reusing the word for a general ledger account would
make every reader disambiguate at each use. Throughout this spec, "Account"
means the existing entity and "ledger account" means the new one.

## Model

### `ledger_accounts`

| column | type | notes |
| --- | --- | --- |
| `id` | Integer PK | autoincrement, as every other table |
| `account_id` | FK → `accounts.id` | `ON DELETE CASCADE`, indexed |
| `code` | String(20) | PCMN code, digits only |
| `name` | String(200) | free text |
| `pcmn_class` | SmallInteger | 1–7, always `code[0]` |

Constraints:

- `uq_ledger_accounts_account_code` — UNIQUE (`account_id`, `code`)
- `ck_ledger_accounts_code_digits` — `code ~ '^[0-9]+$'`
- `ck_ledger_accounts_class_matches_code` —
  `pcmn_class = CAST(LEFT(code, 1) AS SMALLINT)`
- `ck_ledger_accounts_class_range` — `pcmn_class >= 1 AND pcmn_class <= 7`
- `ix_ledger_accounts_account_code` — INDEX (`account_id`, `code`)

The range check and the class-matches-code check together mean a code may not
begin with `0`, `8` or `9`: those digits are not PCMN classes. The digits-only
check allows such a code on its own, so the range check is what rejects it.

The chart is **per Account**, mirroring `categories`
(`uq_categories_account_name`). Each Account owns its own chart; a company
Account and a personal Account do not share one.

PCMN classes, for reference: 1 equity and long-term debt, 2 fixed assets,
3 inventory, 4 receivables and payables, 5 cash, 6 charges, 7 produits. Only
classes 6 and 7 are reachable from flow lines today. Classes 1–5 are
definable so the chart is complete, but nothing links to them until fisac
models more than flows.

`pcmn_class` is a deliberate denormalisation of `code[0]`, kept so reports can
filter and group without parsing the code. The check constraint prevents the
two from drifting.

### No `sort_key`

Unlike `accounts`, `categories`, `flows` and `flow_lines`, `ledger_accounts`
has no fractional index and no `/move` endpoint. A chart of accounts has a
canonical order — the code — which is self-maintaining and is how the chart is
conventionally read. Listing is `ORDER BY code`.

### `flow_lines.ledger_account_id`

One new column on the existing table:

| column | type | notes |
| --- | --- | --- |
| `ledger_account_id` | FK → `ledger_accounts.id`, nullable | `ON DELETE SET NULL`, indexed |

Booking is **per line**, not per flow and not per category. `Flow` carries no
amount; all money lives on `FlowLine`. Booking at line level is therefore the
only granularity that lets one supplier invoice split across ledger accounts —
hardware to one account, services to another — which is how the invoice is
actually booked.

Nullable, because lines can be booked gradually and existing lines must
migrate without a backfill. `ON DELETE SET NULL` mirrors `Flow.category_id`:
deleting a ledger account unbooks its lines rather than destroying them.

`category_id` stays on `Flow` and is unchanged. Categories carry the fiscal
percentages (`tax_deduction_rate`, `vat_deduction_rate`) and drive the VAT
return; ledger accounts carry the booking and drive the annual accounts. The
two are independent and neither derives from the other.

### `flows.ratio`

One new column on the existing `flows` table:

| column | type | notes |
| --- | --- | --- |
| `ratio` | Numeric(6, 5), NOT NULL, default `1` | share of the flow recognised in its invoice year |

Constraint: `ck_flows_ratio_range` — `ratio >= 0 AND ratio <= 1`.

For a service whose coverage runs past the fiscal year end — an annual car
insurance with a May anniversary — `ratio` is the share falling inside the
invoice's fiscal year. An invoice dated May 2026 covering May 2026 to April
2027 carries `ratio = 0.66667`.

`ratio` lives on the `Flow`, not the line: the coverage period is a property of
the invoice, so every line of a flow is scaled by the same figure.

**Known limitation, accepted deliberately.** A single stored scalar is correct
for exactly one fiscal year. The remaining 0.33333 of that insurance is not
deferred to FY2027 — it is dropped. Producing FY2027 accounts would require
editing the flow's `ratio`, which retroactively changes the FY2026 accounts
already closed. The alternative considered was storing `coverage_start` and
`coverage_end` and deriving the ratio per fiscal year, which is self-correcting
across the boundary; it was rejected in favour of the simpler scalar and manual
control. Revisit before closing a year that inherits a straddling flow.

## Validation

Enforced in the router, not the database:

- **Same-Account** — a line's ledger account must belong to the same Account
  as the line's flow. A hard error, matching how `_get_category` scopes a
  category to its Account. Not expressible as a `CheckConstraint` because it
  spans `flow_lines → flows → accounts`.

Deliberately **not** enforced:

- **Class versus flow kind** — an expense line is not restricted to class-6
  accounts, nor a revenue line to class-7. A class-6 line on a revenue flow is
  how a refund or credit note of an expense is represented, and forbidding it
  would remove that.

## Booking amount formula

The amount one flow line contributes to its ledger account:

```
signed = amount_net * (flow.kind == REVENUE ? +1 : -1)
factor = 1 + (vat_rate / 100) * (1 - vat_deduction_rate / 100)
amount = round_half_up(signed * factor * flow.ratio, cents)
```

Worked: 1 200,00 net, 21% VAT, a category 50% VAT-deductible, on an expense
flow with `ratio = 1` books `-1200 * 1.105 * 1` = **-1 326,00**.

**`signed` — revenue positive, expense negative.** Each ledger account's total
is its contribution to the result, and the sum across all accounts is the net
result. Class-6 charge accounts therefore hold *negative* totals; the income
statement negates them for presentation, since charges are conventionally shown
positive. This is the opposite of the convention an earlier draft of this spec
used — the rule above is authoritative.

**`factor` — unrecoverable VAT is a real cost**, booked to the charge account
alongside the net. Both `vat_rate` and `vat_deduction_rate` are percentages
(`21` means 21%), hence the two divisions by 100. `vat_rate` lives on the line;
`vat_deduction_rate` on the flow's category.

A flow with `category_id IS NULL` uses `vat_deduction_rate = 0`, so the full
gross is booked. This matches `routers/vat.py`, where an expense with no
category recovers no VAT.

**`factor` applies to revenue and expense lines alike.** This is what makes a
refund net to zero: a 1 200,00 expense refunded as a revenue flow, on the same
class-6 account with the same category, books `+1 326,00` against the original
`-1 326,00`. Restricting the factor to expenses would strand the 126,00 of
unrecoverable VAT.

> **Invariant this depends on:** revenue categories must keep
> `vat_deduction_rate = 100` (the column default). Nothing enforces it. A
> revenue category set to 50 inflates genuine sales by half the VAT charged —
> VAT that was collected and remitted, never kept. A considered alternative
> keys the factor off the ledger account's `pcmn_class` (apply on class 6,
> skip on class 7), which is correct for both refunds and sales without
> relying on category hygiene. Not adopted; recorded here as the first thing
> to change if revenue ever books wrong.

**Rounding** is per line, to cents, `ROUND_HALF_UP` — the same rule as
`_flow_vat` in `routers/vat.py`, `flows._line_vat` and `projection._gross`, so
ledger totals reconcile with the figures those already report.

**`tax_deduction_rate` does not appear.** The *dépense non admise* is a tax
adjustment computed outside the ledger, not a booking.

Lines with a NULL `ledger_account_id` form an explicit "unassigned" bucket in
the report rather than being silently dropped, so the unbooked remainder stays
visible.

## Migration

A single Alembic revision:

1. `create_table("ledger_accounts", ...)` with its constraints and index
2. `add_column("flow_lines", "ledger_account_id", nullable=True)` with its FK
   and index
3. `add_column("flows", "ratio", nullable=False, server_default="1")` with its
   range check

No backfill and no data migration. All three operations are additive — `ratio`
is NOT NULL but carries a server default, so existing rows take `1`, which is
the no-proration behaviour they had before the column existed. Downgrade drops
the two columns then the table.

The revision follows the existing numbering (`0004_...`) and lives in the
`fisac` schema like every other table, via the `MetaData(schema="fisac")`
binding in `db.py`.

## Out of scope

Each of these is separate work, in roughly this order:

- `/api/accounts/{account_id}/ledger-accounts` router and Pydantic schemas
- exposing `ledger_account_id` on the flow-line read/write schemas
- a ledger account picker in `LinesEditor.tsx`
- the annual accounts report itself
