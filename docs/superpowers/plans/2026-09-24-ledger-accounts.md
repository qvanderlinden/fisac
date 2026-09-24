# Ledger Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-Account chart of general ledger accounts, and let each invoice line book to one, so annual accounts can later be produced by grouping on them.

**Architecture:** One new table `fisac.ledger_accounts` (PCMN code, name, class 1-7, owned by an `Account`), one nullable FK column `fisac.flow_lines.ledger_account_id`, and one `fisac.flows.ratio` column for services straddling the fiscal year end. All land in a single additive Alembic revision with no backfill. This plan stops at the schema: no router, no schemas, no frontend, no report.

**Tech Stack:** Python 3.14, SQLAlchemy 2.0.51 (async, declarative `Mapped`), Alembic 1.18.5, Postgres via asyncpg, uv for dependency management.

**Spec:** `docs/superpowers/specs/2026-09-24-ledger-accounts-design.md`

## Global Constraints

- All tables live in the `fisac` schema. `backend/src/fisac/db.py` binds `MetaData(schema="fisac")`; every Alembic operation passes `schema='fisac'` explicitly.
- Ordering columns elsewhere use a fractional-index `sort_key`. **`ledger_accounts` deliberately has none** — it is ordered by `code`. Do not add one.
- No `created_at` / `updated_at` columns exist on any table. Do not add any.
- There is no Python linter, type checker, or test suite in this repo. Verification is by metadata introspection (no database needed) and by real constraint probes against Postgres. Do not introduce pytest as part of this plan.
- Alembic must be run from the `backend/` directory (`cd backend && uv run alembic ...`); `alembic.ini` resolves `migrations/` relative to it.
- Foreign keys in this codebase are **not** explicitly named — `MetaData` carries no naming convention, so Postgres auto-names them (`flow_lines_ledger_account_id_fkey`). Match migration `0001`; pass `None` as the constraint name.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`), matching git history. The repo sets `includeCoAuthoredBy: false` — add no co-author trailer.

## Prerequisite

A reachable Postgres is required for Task 2. **At the time of writing this plan, nothing was listening on `localhost:5432`** — `alembic current` failed with `Connect call failed ('127.0.0.1', 5432)`. Nothing in this repo starts a database. Before Task 2, start or point `DATABASE_URL` at one, and confirm:

```bash
cd backend && uv run alembic current
```

Expected: prints `0003_visa_closing_day (head)`, not a connection error.

Task 1 needs no database and can be done regardless.

## Branch

Work is currently on `main`. Before Task 1:

```bash
git switch -c feat/ledger-accounts
```

---

### Task 1: Declare the model

Adds `LedgerAccount` and the `FlowLine.ledger_account_id` column to the ORM, and registers the new model with Alembic's metadata. No migration yet, so the database is untouched and this task needs no Postgres.

**Files:**
- Modify: `backend/src/fisac/models.py` (add class after `Category`, before `Flow`; add one column to `Flow` and one to `FlowLine`)
- Modify: `backend/migrations/env.py:10-15` (the model import block)
- Test: none — this repo has no Python test suite. Verified by metadata introspection in Step 4.

**Interfaces:**
- Consumes: `fisac.db.Base`, and the existing `Account` / `FlowLine` tables.
- Produces: `fisac.models.LedgerAccount` with columns `id: int`, `account_id: int`, `code: str`, `name: str`, `pcmn_class: int`; `fisac.models.FlowLine.ledger_account_id: int | None`; and `fisac.models.Flow.ratio: Decimal`. Task 2's migration must match these exactly.

- [ ] **Step 1: Add the `LedgerAccount` class to `models.py`**

Insert between the `Category` class and the `Flow` class. `__table_args__` comes before the columns, matching `Category`, `Flow` and `FlowLine`.

`models.py` already imports every name this needs — `CheckConstraint`, `ForeignKey`, `Index`, `Integer`, `SmallInteger`, `String`, `UniqueConstraint`, `Mapped`, `mapped_column`. Add no imports.

Note there is **one** index, the composite `(account_id, code)`. `account_id` does **not** get `index=True`: the composite index already serves `WHERE account_id = ?` on its leading column, so a second single-column index would be dead weight. This is a deliberate divergence from `Category`, which carries both only because autogenerate emitted them.

```python
class LedgerAccount(Base):
    """A general ledger account - one entry of the chart of accounts.

    Named LedgerAccount, not Account: Account is already this codebase's
    bank-account/entity concept (is_company, vat_applicable, Visa days).
    """

    __tablename__ = "ledger_accounts"
    __table_args__ = (
        UniqueConstraint("account_id", "code", name="uq_ledger_accounts_account_code"),
        CheckConstraint("code ~ '^[0-9]+$'", name="ck_ledger_accounts_code_digits"),
        # pcmn_class is a denormalization of the code's first digit, kept so
        # reports can filter and group without parsing the code. These two
        # checks keep it from drifting and confine codes to the real PCMN
        # classes - together they reject a code starting with 0, 8 or 9.
        CheckConstraint(
            "pcmn_class = CAST(LEFT(code, 1) AS SMALLINT)",
            name="ck_ledger_accounts_class_matches_code",
        ),
        CheckConstraint(
            "pcmn_class >= 1 AND pcmn_class <= 7",
            name="ck_ledger_accounts_class_range",
        ),
        # The chart's natural order is the code, so there is no sort_key and no
        # /move endpoint here - unlike every other table. Listing is ORDER BY
        # code, which is self-maintaining. This composite index serves both the
        # ordering and the per-Account lookup.
        Index("ix_ledger_accounts_account_code", "account_id", "code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The chart is per Account, mirroring Category - a company Account and a
    # personal Account do not share one.
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    # PCMN code, digits only, hierarchical by prefix: 61 > 610 > 6100.
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Belgian PCMN class, always the code's first digit: 1 equity/long-term
    # debt, 2 fixed assets, 3 inventory, 4 receivables/payables, 5 cash,
    # 6 charges, 7 produits. Only 6 and 7 are reachable from flow lines today;
    # 1-5 are definable so the chart is complete.
    pcmn_class: Mapped[int] = mapped_column(SmallInteger, nullable=False)
```

- [ ] **Step 2: Add `ratio` to `Flow`**

Add this entry to `Flow.__table_args__`, after the two existing `CheckConstraint`s and before the `Index`es:

```python
        CheckConstraint("ratio >= 0 AND ratio <= 1", name="ck_flows_ratio_range"),
```

And append this column to the end of the `Flow` class, after `sort_key`:

```python
    # Share (0-1) of this flow recognised in its invoice year; 1 for the normal
    # case. A service whose coverage runs past the fiscal year end - an annual
    # car insurance with a May anniversary - carries the share falling inside
    # the invoice's year, so a May 2026 invoice covering May 2026 to April 2027
    # is 0.66667. It sits on the flow rather than the line because the coverage
    # period is a property of the invoice, so every line is scaled alike.
    # A single scalar is only ever correct for one fiscal year: the remainder
    # is dropped, not deferred. See the spec's "flows.ratio" section.
    ratio: Mapped[Decimal] = mapped_column(
        Numeric(6, 5), nullable=False, server_default="1"
    )
```

`Numeric` and `Decimal` are already imported in `models.py`.

- [ ] **Step 3: Add the column to `FlowLine`**

Append to the end of `FlowLine`, after `sort_key`:

```python
    # Which ledger account this line books to. Booking is per line, not per
    # flow: Flow carries no amount, so only the line level can split one
    # invoice across ledger accounts. Nullable so lines can be booked
    # gradually and existing rows migrate with no backfill; the annual
    # accounts report buckets unbooked lines explicitly rather than dropping
    # them. SET NULL mirrors Flow.category_id - deleting a ledger account
    # unbooks its lines instead of destroying them.
    ledger_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledger_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
```

- [ ] **Step 4: Register the model with Alembic's metadata**

`backend/migrations/env.py` imports each model by name so it registers with `Base.metadata`. **If `LedgerAccount` is omitted here, autogenerate will not see the table and `alembic check` in Task 2 will propose dropping it.** Change the import block to:

```python
from fisac.models import (  # noqa: F401 - registers the tables with Base.metadata
    Account,
    Category,
    Flow,
    FlowLine,
    LedgerAccount,
)
```

- [ ] **Step 5: Verify the metadata — no database needed**

Run from the repo root:

```bash
uv run python - <<'PY'
from fisac.db import Base
import fisac.models  # noqa: F401

t = Base.metadata.tables["fisac.ledger_accounts"]
print("columns:", sorted(c.name for c in t.columns))
print("named constraints:", sorted(c.name for c in t.constraints if c.name))
print("indexes:", sorted(i.name for i in t.indexes))

col = Base.metadata.tables["fisac.flow_lines"].columns["ledger_account_id"]
print("flow_lines.ledger_account_id nullable:", col.nullable)
print("flow_lines.ledger_account_id ondelete:", [fk.ondelete for fk in col.foreign_keys])

flows = Base.metadata.tables["fisac.flows"]
ratio = flows.columns["ratio"]
print("flows.ratio type:", ratio.type)
print("flows.ratio nullable:", ratio.nullable)
print("flows.ratio server_default:", ratio.server_default.arg)
print("flows named constraints:", sorted(c.name for c in flows.constraints if c.name))
PY
```

Expected, exactly:

```
columns: ['account_id', 'code', 'id', 'name', 'pcmn_class']
named constraints: ['ck_ledger_accounts_class_matches_code', 'ck_ledger_accounts_class_range', 'ck_ledger_accounts_code_digits', 'uq_ledger_accounts_account_code']
indexes: ['ix_ledger_accounts_account_code']
flow_lines.ledger_account_id nullable: True
flow_lines.ledger_account_id ondelete: ['SET NULL']
flows.ratio type: NUMERIC(6, 5)
flows.ratio nullable: False
flows.ratio server_default: 1
flows named constraints: ['ck_flows_no_method_no_payment_date', 'ck_flows_no_visa_payment_date', 'ck_flows_ratio_range']
```

If `indexes` contains a second entry such as `ix_fisac_ledger_accounts_account_id`, `index=True` was left on `account_id` — remove it and re-run.

- [ ] **Step 6: Verify env.py registers the model**

```bash
grep -n "LedgerAccount" backend/migrations/env.py
```

Expected: one match inside the `from fisac.models import (...)` block.

- [ ] **Step 7: Commit**

```bash
git add backend/src/fisac/models.py backend/migrations/env.py
git commit -m "feat: declare LedgerAccount model, line booking column and flow ratio"
```

---

### Task 2: The Alembic migration

Turns the model declarations into schema. One additive revision; no backfill, no data migration.

**Requires:** a reachable Postgres (see Prerequisite) at revision `0003_visa_closing_day`.

**Files:**
- Create: `backend/migrations/versions/0004_ledger_accounts.py`
- Test: none in-repo. Verified by `alembic check` (proves the migration matches Task 1's models) plus a throwaway constraint probe, written to the scratchpad and not committed.

**Interfaces:**
- Consumes: `fisac.models.LedgerAccount`, `fisac.models.FlowLine.ledger_account_id` and `fisac.models.Flow.ratio` from Task 1.
- Produces: table `fisac.ledger_accounts` and columns `fisac.flow_lines.ledger_account_id`, `fisac.flows.ratio` in the live database. Revision id `0004_ledger_accounts`, down revision `0003_visa_closing_day`.

- [ ] **Step 1: Write the migration by hand**

Do **not** use `alembic revision --autogenerate` to produce this — write the file, then use `alembic check` in Step 4 to prove it agrees with the models. Create `backend/migrations/versions/0004_ledger_accounts.py`:

```python
"""ledger accounts and per-line booking

Revision ID: 0004_ledger_accounts
Revises: 0003_visa_closing_day
Create Date: 2026-09-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0004_ledger_accounts'
down_revision: Union[str, None] = '0003_visa_closing_day'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The chart of accounts, one per Account (mirrors categories). pcmn_class
    # is a denormalization of the code's first digit kept so reports can group
    # without parsing it; the two checks keep the two in step and confine
    # codes to the real PCMN classes 1-7. No sort_key: the chart's natural
    # order is the code.
    op.create_table(
        'ledger_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('pcmn_class', sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("code ~ '^[0-9]+$'", name='ck_ledger_accounts_code_digits'),
        sa.CheckConstraint(
            'pcmn_class = CAST(LEFT(code, 1) AS SMALLINT)',
            name='ck_ledger_accounts_class_matches_code',
        ),
        sa.CheckConstraint(
            'pcmn_class >= 1 AND pcmn_class <= 7',
            name='ck_ledger_accounts_class_range',
        ),
        sa.ForeignKeyConstraint(['account_id'], ['fisac.accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'code', name='uq_ledger_accounts_account_code'),
        schema='fisac',
    )
    op.create_index(
        'ix_ledger_accounts_account_code',
        'ledger_accounts',
        ['account_id', 'code'],
        unique=False,
        schema='fisac',
    )
    # Booking is per line: Flow carries no amount, so only the line level can
    # split one invoice across ledger accounts. Nullable, so existing lines
    # migrate with no backfill. SET NULL mirrors flows.category_id - deleting
    # a ledger account unbooks its lines rather than destroying them.
    op.add_column(
        'flow_lines',
        sa.Column('ledger_account_id', sa.Integer(), nullable=True),
        schema='fisac',
    )
    op.create_index(
        op.f('ix_fisac_flow_lines_ledger_account_id'),
        'flow_lines',
        ['ledger_account_id'],
        unique=False,
        schema='fisac',
    )
    # Name left to Postgres (flow_lines_ledger_account_id_fkey), matching the
    # unnamed foreign keys migration 0001 created - this MetaData carries no
    # naming convention.
    op.create_foreign_key(
        None,
        'flow_lines',
        'ledger_accounts',
        ['ledger_account_id'],
        ['id'],
        source_schema='fisac',
        referent_schema='fisac',
        ondelete='SET NULL',
    )
    # Share (0-1) of the flow recognised in its invoice year, for services
    # whose coverage runs past the fiscal year end. NOT NULL, but the server
    # default backfills existing rows with 1 - the no-proration behaviour they
    # had before this column - so no data migration is needed.
    op.add_column(
        'flows',
        sa.Column(
            'ratio', sa.Numeric(precision=6, scale=5), server_default='1', nullable=False
        ),
        schema='fisac',
    )
    op.create_check_constraint(
        'ck_flows_ratio_range', 'flows', 'ratio >= 0 AND ratio <= 1', schema='fisac'
    )


def downgrade() -> None:
    op.drop_constraint('ck_flows_ratio_range', 'flows', schema='fisac', type_='check')
    op.drop_column('flows', 'ratio', schema='fisac')
    # Dropping the column drops its foreign key with it, so the constraint
    # needs no separate drop.
    op.drop_index(
        op.f('ix_fisac_flow_lines_ledger_account_id'),
        table_name='flow_lines',
        schema='fisac',
    )
    op.drop_column('flow_lines', 'ledger_account_id', schema='fisac')
    op.drop_index(
        'ix_ledger_accounts_account_code', table_name='ledger_accounts', schema='fisac'
    )
    op.drop_table('ledger_accounts', schema='fisac')
```

If `op.create_foreign_key(None, ...)` raises on this Alembic version, name it
explicitly instead — `'fk_flow_lines_ledger_account_id'` as the first argument —
and add a matching drop as the **first** statement of `downgrade()`:

```python
    op.drop_constraint(
        'fk_flow_lines_ledger_account_id', 'flow_lines', schema='fisac', type_='foreignkey'
    )
```

This does not upset Step 4: the metadata's foreign key is unnamed, and Alembic
compares foreign keys by their columns and referred table, not by name.

- [ ] **Step 2: Confirm the migration is the new head**

```bash
cd backend && uv run alembic heads
```

Expected: `0004_ledger_accounts (head)` and nothing else. Two heads means `down_revision` is wrong.

- [ ] **Step 3: Apply it**

```bash
cd backend && uv run alembic upgrade head
```

Expected: `Running upgrade 0003_visa_closing_day -> 0004_ledger_accounts`, no error.

- [ ] **Step 4: Prove the migration matches the models**

This is the real test of Step 1 — `alembic check` diffs the live schema against `Base.metadata`.

```bash
cd backend && uv run alembic check
```

Expected, exactly: `No new upgrade operations detected.`

Any other output means the migration and the Task 1 model disagree. Read the proposed operations: they name the exact column, index or constraint that differs. Fix the migration (not the model — the model is the spec), then `alembic downgrade -1 && alembic upgrade head` and re-run.

- [ ] **Step 5: Probe the constraints**

Write this outside the repo — it is throwaway and must not be committed. `/tmp` below is a working default; use your session's scratchpad directory if you have one.

```bash
cat > /tmp/ledger_probe.sql <<'SQL'
BEGIN;
DO $$
DECLARE
  acct_id int;
  la_id int;
  line_id int;
  flow_id int;
BEGIN
  INSERT INTO fisac.accounts (name, sort_key) VALUES ('probe', 'zzzz') RETURNING id INTO acct_id;

  INSERT INTO fisac.ledger_accounts (account_id, code, name, pcmn_class)
  VALUES (acct_id, '610000', 'Fournitures', 6) RETURNING id INTO la_id;
  RAISE NOTICE 'PASS: valid ledger account accepted';

  BEGIN
    INSERT INTO fisac.ledger_accounts (account_id, code, name, pcmn_class)
    VALUES (acct_id, '700000', 'Ventes', 6);
    RAISE EXCEPTION 'FAIL: pcmn_class was allowed to disagree with the code';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: pcmn_class must equal the code first digit';
  END;

  BEGIN
    INSERT INTO fisac.ledger_accounts (account_id, code, name, pcmn_class)
    VALUES (acct_id, '900000', 'Hors PCMN', 9);
    RAISE EXCEPTION 'FAIL: class 9 was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: class outside 1-7 rejected';
  END;

  BEGIN
    INSERT INTO fisac.ledger_accounts (account_id, code, name, pcmn_class)
    VALUES (acct_id, '61A000', 'Alphanumerique', 6);
    RAISE EXCEPTION 'FAIL: non-digit code was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: non-digit code rejected';
  END;

  BEGIN
    INSERT INTO fisac.ledger_accounts (account_id, code, name, pcmn_class)
    VALUES (acct_id, '610000', 'Doublon', 6);
    RAISE EXCEPTION 'FAIL: duplicate code within one Account was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: code unique per Account';
  END;

  -- SET NULL on delete: a booked line survives its ledger account.
  INSERT INTO fisac.flows (account_id, name, kind, invoice_date, paid, reverse_charge, sort_key)
  VALUES (acct_id, 'probe flow', 'EXPENSE', DATE '2026-01-15', false, false, 'a0')
  RETURNING id INTO flow_id;
  INSERT INTO fisac.flow_lines (flow_id, amount_net, vat_rate, sort_key, ledger_account_id)
  VALUES (flow_id, 100.00, 21, 'a0', la_id) RETURNING id INTO line_id;

  BEGIN
    UPDATE fisac.flows SET ratio = 1.5 WHERE id = flow_id;
    RAISE EXCEPTION 'FAIL: ratio above 1 was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: ratio above 1 rejected';
  END;

  IF (SELECT ratio FROM fisac.flows WHERE id = flow_id) = 1 THEN
    RAISE NOTICE 'PASS: ratio defaults to 1';
  ELSE
    RAISE EXCEPTION 'FAIL: ratio did not default to 1';
  END IF;

  DELETE FROM fisac.ledger_accounts WHERE id = la_id;
  IF EXISTS (SELECT 1 FROM fisac.flow_lines WHERE id = line_id AND ledger_account_id IS NULL) THEN
    RAISE NOTICE 'PASS: deleting a ledger account unbooks its lines, keeps them';
  ELSE
    RAISE EXCEPTION 'FAIL: line did not survive with a NULL booking';
  END IF;
END $$;
ROLLBACK;
SQL

psql "$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's#postgresql+asyncpg://#postgresql://#')" -f /tmp/ledger_probe.sql
```

Expected: eight `NOTICE:  PASS:` lines and `ROLLBACK`. Any `FAIL` is a real defect in the migration. The whole probe runs inside a transaction that is rolled back, so it leaves no rows behind.

If `psql` is not installed, run the same SQL through Python instead:

```bash
uv run python - <<'PY'
import asyncio, asyncpg, pathlib, re
from fisac.config import settings

url = re.sub(r"^postgresql\+asyncpg://", "postgresql://", settings.database_url)
sql = pathlib.Path("/tmp/ledger_probe.sql").read_text()

async def main():
    conn = await asyncpg.connect(url)
    conn.add_log_listener(lambda c, m: print(m.message))
    try:
        await conn.execute(sql)
    finally:
        await conn.close()

asyncio.run(main())
PY
```

- [ ] **Step 6: Round-trip the migration**

```bash
cd backend && uv run alembic downgrade -1 && uv run alembic upgrade head && uv run alembic check
```

Expected: the downgrade and upgrade both succeed, and `check` again prints `No new upgrade operations detected.` A downgrade failure usually means an index or constraint is dropped in the wrong order.

- [ ] **Step 7: Confirm nothing else changed**

```bash
git status --porcelain
```

Expected: only `backend/migrations/versions/0004_ledger_accounts.py` as untracked. The probe file lives outside the repo; if it shows up here, move it out.

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/versions/0004_ledger_accounts.py
git commit -m "feat: add ledger_accounts table, line booking column and flow ratio"
```

---

## Done when

- `fisac.ledger_accounts` exists with all four named constraints and the composite index.
- `fisac.flow_lines.ledger_account_id` exists, nullable, `ON DELETE SET NULL`.
- `fisac.flows.ratio` exists, NOT NULL, defaulting to 1, range-checked to 0..1.
- `alembic check` reports no drift.
- Every probe prints PASS.
- Two commits on `feat/ledger-accounts`.

## Explicitly not in this plan

Each is separate work, in roughly this order:

1. `/api/accounts/{account_id}/ledger-accounts` router and Pydantic schemas — ordered by `code`, not `sort_key`, and with no `/move` endpoint.
2. `ledger_account_id` on the flow-line read/write schemas, with the same-Account validation the spec requires (a line's ledger account must belong to its flow's Account). That validation does **not** exist after this plan.
3. A ledger account picker in `frontend/src/components/LinesEditor.tsx`, and the hand-mirrored type in `frontend/src/api/types.ts`.
4. The annual accounts report, which implements the spec's "Booking amount formula":
   `round_half_up(amount_net * (kind == REVENUE ? +1 : -1) * (1 + (vat_rate/100) * (1 - vat_deduction_rate/100)) * flow.ratio, cents)`.
   Note `vat_rate` and `vat_deduction_rate` are percentages, that revenue is
   **positive** and expense negative, and that a NULL category means
   `vat_deduction_rate = 0`. This plan stores `ratio` but computes nothing.
5. Exposing `ratio` on the flow read/write schemas and in `FlowForm.tsx`. After
   this plan the column exists but no API can set it, so every flow stays at 1.
