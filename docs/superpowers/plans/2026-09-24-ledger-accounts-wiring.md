# Ledger Accounts Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the general ledger accounts schema usable end to end — a chart CRUD surface, a booking control on invoice lines, and an annual accounts report with prior-year comparison.

**Architecture:** Two new FastAPI routers (`ledger_accounts`, `annual_accounts`) following the existing per-Account router convention, `ledger_account_id` threaded through the flow-line schemas with same-Account validation, and two new React views plus a picker in the shared `LinesEditor`. The aggregation runs in Python over loaded rows, mirroring `routers/vat.py`, so rounding matches what the VAT report already produces.

**Tech Stack:** Python 3.14, FastAPI 0.139, SQLAlchemy 2.0.51 async, Pydantic v2, Postgres/asyncpg; React 19 + Vite + TypeScript, shadcn/ui, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-24-ledger-accounts-wiring-design.md`
**Schema spec (prerequisite):** `docs/superpowers/specs/2026-09-24-ledger-accounts-design.md`

## Global Constraints

- Branch: `feat/ledger-accounts-wiring`, stacked on `feat/ledger-accounts`. Do not switch branches.
- `backend/src/fisac/config.py` has no `env_file`, so `.env` is NOT auto-loaded and the hardcoded default password is wrong. Source it: `set -a && . .env && set +a` from the repo root (or `. ../.env` from `backend/`) before any command that touches the database or starts the API.
- There is no Python linter, type checker, or test suite in this repo. **Do not add pytest.** Backend verification is real HTTP calls against a running API. Frontend verification is `cd frontend && npm run build` (which runs `tsc -b`) plus driving the UI.
- Every money field crossing the API is a `Decimal` server-side and a **string** in TypeScript — Pydantic v2 serializes Decimal to a JSON string. Mirror types by hand in `frontend/src/api/types.ts`; there is no codegen.
- Validation status codes follow the existing convention: **400** for "this id does not belong to this Account" (matching `_validate_category` in `routers/flows.py:84`), **404** for a path id not on this Account, **409** for a duplicate code, 422 only for Pydantic shape failures.
- `ledger_accounts` has no `sort_key`. Never add a `/move` endpoint or reordering UI for it; it is ordered by `code`.
- `pcmn_class` is never accepted from a client. The server derives it as `int(code[0])`. The database's `ck_ledger_accounts_class_matches_code` requires the two to agree.
- **The booking factor is applied uniformly to revenue and expense lines.** This carries a known, deliberately kept defect documented in the schema spec. Implement the formula exactly as given; do not add a kind-based or class-based condition.
- Conventional Commits. No co-author or generated-with trailer.

---

### Task 1: Ledger accounts API

**Files:**
- Modify: `backend/src/fisac/schemas.py` (add a `# --- Ledger accounts ---` section after the Categories section)
- Create: `backend/src/fisac/routers/ledger_accounts.py`
- Modify: `backend/src/fisac/main.py` (import and mount)

**Interfaces:**
- Consumes: `fisac.models.LedgerAccount` (columns `id`, `account_id`, `code`, `name`, `pcmn_class`), `fisac.dependencies.get_account`.
- Produces: `LedgerAccountCreate{code, name}`, `LedgerAccountUpdate{code?, name?}`, `LedgerAccountRead{id, account_id, code, name, pcmn_class}`, and routes under `/api/accounts/{account_id}/ledger-accounts`. Tasks 2, 5 and 6 depend on these exact names.

- [ ] **Step 1: Add the schemas**

Append to `backend/src/fisac/schemas.py`, after the Categories section:

```python
# --- Ledger accounts --------------------------------------------------------

# Digits only, first digit a real PCMN class. Validating the shape here turns a
# bad code into a 422 instead of letting it reach the database's
# ck_ledger_accounts_code_digits / ck_ledger_accounts_class_range as a 500.
_LEDGER_CODE = r"^[1-7][0-9]*$"


class LedgerAccountCreate(BaseModel):
    code: str = Field(pattern=_LEDGER_CODE, max_length=20)
    name: str = Field(min_length=1, max_length=200)


class LedgerAccountUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=_LEDGER_CODE, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=200)


class LedgerAccountRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    account_id: int
    code: str
    name: str
    # Derived by the router from code[0], never sent by the client - the
    # ck_ledger_accounts_class_matches_code constraint requires them to agree.
    pcmn_class: int
```

- [ ] **Step 2: Write the router**

Create `backend/src/fisac/routers/ledger_accounts.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, LedgerAccount
from fisac.schemas import LedgerAccountCreate, LedgerAccountRead, LedgerAccountUpdate

router = APIRouter(
    prefix="/api/accounts/{account_id}/ledger-accounts", tags=["ledger-accounts"]
)


async def _get_ledger_account(
    ledger_account_id: int,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    ledger_account = await session.get(LedgerAccount, ledger_account_id)
    if ledger_account is None or ledger_account.account_id != account.id:
        raise HTTPException(status_code=404, detail="Ledger account not found")
    return ledger_account


@router.get("", response_model=list[LedgerAccountRead])
async def list_ledger_accounts(
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> list[LedgerAccount]:
    # Ordered by code, not by a sort_key: the chart's natural order is the code
    # and this table deliberately has no fractional index.
    result = await session.execute(
        select(LedgerAccount)
        .where(LedgerAccount.account_id == account.id)
        .order_by(LedgerAccount.code)
    )
    return list(result.scalars().all())


@router.post("", response_model=LedgerAccountRead, status_code=201)
async def create_ledger_account(
    payload: LedgerAccountCreate,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    ledger_account = LedgerAccount(
        account_id=account.id,
        code=payload.code,
        name=payload.name,
        pcmn_class=int(payload.code[0]),
    )
    session.add(ledger_account)
    try:
        await session.commit()
    except IntegrityError:
        # uq_ledger_accounts_account_code - a duplicate code is a client
        # mistake, not a server error.
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Code {payload.code} already exists on this account",
        ) from None
    await session.refresh(ledger_account)
    return ledger_account


@router.patch("/{ledger_account_id}", response_model=LedgerAccountRead)
async def update_ledger_account(
    payload: LedgerAccountUpdate,
    ledger_account: LedgerAccount = Depends(_get_ledger_account),
    session: AsyncSession = Depends(get_session),
) -> LedgerAccount:
    if payload.code is not None:
        ledger_account.code = payload.code
        ledger_account.pcmn_class = int(payload.code[0])
    if payload.name is not None:
        ledger_account.name = payload.name
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Code already exists on this account"
        ) from None
    await session.refresh(ledger_account)
    return ledger_account


@router.delete("/{ledger_account_id}", status_code=204)
async def delete_ledger_account(
    ledger_account: LedgerAccount = Depends(_get_ledger_account),
    session: AsyncSession = Depends(get_session),
) -> None:
    # Lines booked here survive with a NULL ledger_account_id
    # (ON DELETE SET NULL) - they become part of the unassigned bucket.
    await session.delete(ledger_account)
    await session.commit()
```

- [ ] **Step 3: Mount the router**

In `backend/src/fisac/main.py`, add `ledger_accounts` to the import (alphabetical, after `flows`). `annual_accounts` does not exist until Task 5, so do **not** add it here — importing it now is an `ImportError` that stops the app booting:

```python
from fisac.routers import accounts, categories, flows, ledger_accounts, projection, vat
```

Then add the mount after `app.include_router(flows.router)`:

```python
app.include_router(ledger_accounts.router)
```

- [ ] **Step 4: Start the API**

```bash
cd /Users/quentin/projects/personal/fisac && set -a && . .env && set +a && uv run uvicorn fisac.main:app --port 8000 &
sleep 3 && curl -s localhost:8000/api/accounts | head -c 200
```

Expected: a JSON array of accounts (possibly `[]`). Note an existing account's id as `$ACC`; if there are none, create one:

```bash
curl -s -X POST localhost:8000/api/accounts -H 'Content-Type: application/json' \
  -d '{"name":"probe","is_company":true,"vat_applicable":true}'
```

- [ ] **Step 5: Exercise every route, including the failures**

```bash
ACC=<the account id>
B=localhost:8000/api/accounts/$ACC/ledger-accounts
echo "-- create 610000"; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'Content-Type: application/json' -d '{"code":"610000","name":"Fournitures"}'
echo "-- create 700000"; curl -s -X POST $B -H 'Content-Type: application/json' -d '{"code":"700000","name":"Ventes"}'
echo "-- list";          curl -s $B
echo "-- dup code";      curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'Content-Type: application/json' -d '{"code":"610000","name":"Dup"}'
echo "-- bad code A1";   curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'Content-Type: application/json' -d '{"code":"A1","name":"Bad"}'
echo "-- bad code 900";  curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'Content-Type: application/json' -d '{"code":"900000","name":"Bad"}'
echo "-- patch code";    curl -s -X PATCH $B/<id of 610000> -H 'Content-Type: application/json' -d '{"code":"611000"}'
echo "-- missing id";    curl -s -o /dev/null -w "%{http_code}\n" $B/999999 -X PATCH -H 'Content-Type: application/json' -d '{"name":"x"}'
echo "-- delete";        curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/<id of 700000>
```

Expected, in order: `201`; a JSON object with `"pcmn_class": 7`; a two-element array ordered `610000` then `700000`; `409`; `422`; `422`; an object with `"code":"611000"` and `"pcmn_class": 6`; `404`; `204`.

The two `422`s matter individually: `A1` proves the pattern rejects a non-digit, `900000` proves it rejects a digit that is not a PCMN class. If either returns 500, the Pydantic pattern is wrong and the error reached the database.

- [ ] **Step 6: Commit**

```bash
git add backend/src/fisac/schemas.py backend/src/fisac/routers/ledger_accounts.py backend/src/fisac/main.py
git commit -m "feat: add ledger accounts CRUD API"
```

---

### Task 2: Ledger accounts tab

**Files:**
- Modify: `frontend/src/api/types.ts` (add three interfaces after the Category ones)
- Modify: `frontend/src/api/client.ts` (add a `// --- Ledger accounts ---` section after Categories)
- Create: `frontend/src/components/LedgerAccountsView.tsx`
- Modify: `frontend/src/App.tsx` (tab type, nav button, render branch, `wideTab`)

**Interfaces:**
- Consumes: Task 1's routes and `LedgerAccountRead{id, account_id, code, name, pcmn_class}`.
- Produces: `listLedgerAccounts(accountId)`, `createLedgerAccount(accountId, payload)`, `updateLedgerAccount(accountId, id, payload)`, `deleteLedgerAccount(accountId, id)` in `client.ts`, and the TS types. Tasks 4 and 6 import these.

- [ ] **Step 1: Add the TypeScript types**

In `frontend/src/api/types.ts`, after the `CategoryUpdate` interface:

```typescript
export interface LedgerAccountRead {
  id: number
  account_id: number
  code: string
  name: string
  // Belgian PCMN class, always the code's first digit. Derived server-side;
  // never sent when creating or updating.
  pcmn_class: number
}

export interface LedgerAccountCreate {
  code: string
  name: string
}

export interface LedgerAccountUpdate {
  code?: string
  name?: string
}
```

- [ ] **Step 2: Add the client functions**

Add `LedgerAccountCreate`, `LedgerAccountRead`, `LedgerAccountUpdate` to the type import block at the top of `frontend/src/api/client.ts` (alphabetical, after `FlowUpdate`), then append this section after the Categories section:

```typescript
// --- Ledger accounts --------------------------------------------------------

export function listLedgerAccounts(accountId: number): Promise<LedgerAccountRead[]> {
  return request(`/accounts/${accountId}/ledger-accounts`)
}

export function createLedgerAccount(
  accountId: number,
  payload: LedgerAccountCreate,
): Promise<LedgerAccountRead> {
  return request(`/accounts/${accountId}/ledger-accounts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateLedgerAccount(
  accountId: number,
  ledgerAccountId: number,
  payload: LedgerAccountUpdate,
): Promise<LedgerAccountRead> {
  return request(`/accounts/${accountId}/ledger-accounts/${ledgerAccountId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteLedgerAccount(accountId: number, ledgerAccountId: number): Promise<void> {
  return request(`/accounts/${accountId}/ledger-accounts/${ledgerAccountId}`, {
    method: 'DELETE',
  })
}
```

- [ ] **Step 3: Write the view**

Create `frontend/src/components/LedgerAccountsView.tsx`. It follows `CategoriesView.tsx`'s shape — fetch on mount, an add row, inline edit, delete — but has no drag-reordering, because this table has no `sort_key`.

```typescript
import { useEffect, useState } from 'react'
import {
  createLedgerAccount,
  deleteLedgerAccount,
  listLedgerAccounts,
  updateLedgerAccount,
} from '../api/client'
import type { LedgerAccountRead } from '../api/types'

interface LedgerAccountsViewProps {
  accountId: number
}

// Belgian PCMN. Only 6 and 7 are meaningful for flow lines, but the whole
// chart is definable - see the schema design doc.
const CLASS_LABELS: Record<number, string> = {
  1: 'Capitaux propres',
  2: 'Immobilisés',
  3: 'Stocks',
  4: 'Créances et dettes',
  5: 'Trésorerie',
  6: 'Charges',
  7: 'Produits',
}

// Mirrors the backend's _LEDGER_CODE and the database's two check
// constraints, so a bad code is caught before a round trip.
const CODE_PATTERN = /^[1-7][0-9]*$/

export function LedgerAccountsView({ accountId }: LedgerAccountsViewProps) {
  const [rows, setRows] = useState<LedgerAccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    setLoading(true)
    listLedgerAccounts(accountId).then((fetched) => {
      setRows(fetched)
      setLoading(false)
    })
  }, [accountId])

  const codeValid = CODE_PATTERN.test(newCode)
  const canAdd = codeValid && newName.trim() !== ''

  async function add() {
    setError(null)
    try {
      const created = await createLedgerAccount(accountId, {
        code: newCode,
        name: newName.trim(),
      })
      // Re-sort locally rather than refetching: the list is ordered by code.
      setRows((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
      setNewCode('')
      setNewName('')
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('409') ? 'That code already exists.' : String(e))
    }
  }

  async function rename(row: LedgerAccountRead, name: string) {
    const updated = await updateLedgerAccount(accountId, row.id, { name })
    setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)))
  }

  async function remove(row: LedgerAccountRead) {
    await deleteLedgerAccount(accountId, row.id)
    setRows((current) => current.filter((r) => r.id !== row.id))
  }

  if (loading) return <p className="empty-state">Loading…</p>

  return (
    <div className="ledger-accounts-view">
      <h2>Ledger accounts</h2>
      <p className="view-hint">
        Your chart of accounts. The class is the code's first digit and is set for you.
      </p>

      <div className="ledger-add-row">
        <input
          type="text"
          placeholder="610000"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          aria-label="Code"
        />
        <span className="ledger-class-badge">
          {codeValid ? `${newCode[0]} ${CLASS_LABELS[Number(newCode[0])]}` : '—'}
        </span>
        <input
          type="text"
          placeholder="Fournitures"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Name"
        />
        <button type="button" disabled={!canAdd} onClick={add}>
          Add
        </button>
      </div>
      {newCode !== '' && !codeValid && (
        <p className="form-error">A code is digits only and starts with a class, 1 to 7.</p>
      )}
      {error && <p className="form-error">{error}</p>}

      {rows.length === 0 && <p className="empty-state">No ledger accounts yet.</p>}

      {rows.map((row) => (
        <div className="ledger-row" key={row.id}>
          <span className="ledger-code">{row.code}</span>
          <span className="ledger-class-badge">
            {row.pcmn_class} {CLASS_LABELS[row.pcmn_class]}
          </span>
          <input
            type="text"
            value={row.name}
            onChange={(e) =>
              setRows((current) =>
                current.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
              )
            }
            onBlur={(e) => rename(row, e.target.value.trim())}
            aria-label={`Name of ${row.code}`}
          />
          <button type="button" className="line-remove" onClick={() => remove(row)} aria-label={`Delete ${row.code}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Wire the tab into App.tsx**

Four edits in `frontend/src/App.tsx`:

1. Import: `import { LedgerAccountsView } from './components/LedgerAccountsView'`
2. Tab type: `type Tab = 'revenues' | 'expenses' | 'categories' | 'ledger' | 'projection' | 'vat'`
3. `wideTab`: `const wideTab = tab === 'revenues' || tab === 'expenses' || tab === 'categories' || tab === 'ledger'`
4. Nav button, after the Categories button:

```tsx
            <button
              className={`sidebar-nav-item${tab === 'ledger' ? ' active' : ''}`}
              onClick={() => setTab('ledger')}
            >
              📒 Ledger
            </button>
```

5. Render branch, after the Categories one:

```tsx
          {!loading && selectedAccount !== null && tab === 'ledger' && (
            <LedgerAccountsView accountId={selectedAccount.id} />
          )}
```

- [ ] **Step 5: Add the styles**

Append to `frontend/src/styles.css`, following the file's existing conventions:

```css
.ledger-add-row,
.ledger-row {
  display: grid;
  grid-template-columns: 8rem 12rem 1fr 2rem;
  gap: 0.5rem;
  align-items: center;
  padding: 0.25rem 0;
}

.ledger-code {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.ledger-class-badge {
  font-size: 0.8em;
  opacity: 0.7;
}
```

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npm run build
```

Expected: `tsc -b` passes and vite writes `dist/`. Any TS error here is a real mismatch between the hand-mirrored types and their use — fix it rather than casting.

- [ ] **Step 7: Drive the UI**

With the API from Task 1 running, `cd frontend && npm run dev`, open the Ledger tab and confirm: adding `613000 / Honoraires` works and the badge reads `6 Charges` as you type; adding a duplicate code shows "That code already exists."; typing `A1` shows the code error and disables Add; renaming on blur persists across a reload; deleting removes the row.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/components/LedgerAccountsView.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -m "feat: add ledger accounts tab"
```

---

### Task 3: Booking on flow lines — API

**Files:**
- Modify: `backend/src/fisac/schemas.py` (`FlowLineCreate`, `FlowLineRead`)
- Modify: `backend/src/fisac/routers/flows.py` (import, `_add_lines`, a new `_validate_ledger_accounts`, three call sites)

**Interfaces:**
- Consumes: `fisac.models.LedgerAccount`, and Task 1's chart so there is something to book to.
- Produces: `ledger_account_id: int | None` on `FlowLineCreate` and `FlowLineRead`. Task 4 mirrors these into TypeScript; Task 5 reads `FlowLine.ledger_account_id` directly off the model.

- [ ] **Step 1: Add the field to both line schemas**

In `backend/src/fisac/schemas.py`, add to `FlowLineCreate`:

```python
    # Which ledger account this line books to; null means unbooked. Validated
    # against the flow's Account in routers/flows.py - the database cannot
    # check it, since the FK only points at ledger_accounts.id.
    ledger_account_id: int | None = None
```

and to `FlowLineRead`:

```python
    ledger_account_id: int | None
```

- [ ] **Step 2: Persist the field**

In `backend/src/fisac/routers/flows.py`, add `ledger_account_id=payload.ledger_account_id,` to the `FlowLine(...)` construction inside `_add_lines`, after `vat_rate=payload.vat_rate,`.

Add `LedgerAccount` to the models import, alphabetically:

```python
from fisac.models import Account, Category, Flow, FlowKind, FlowLine, LedgerAccount, PaymentMethod
```

- [ ] **Step 3: Write the validator**

Add to `backend/src/fisac/routers/flows.py`, immediately after `_validate_category`:

```python
async def _validate_ledger_accounts(
    session: AsyncSession, account_id: int, lines: list[FlowLineCreate]
) -> None:
    """Every booked line must point at a ledger account of this same Account.

    Nothing in the database enforces this: flow_lines.ledger_account_id is a
    plain FK to ledger_accounts, which carries its own account_id, so without
    this check one Account's lines could be booked into another Account's
    annual accounts. One query for the whole line set, never one per line.
    """
    wanted = {line.ledger_account_id for line in lines if line.ledger_account_id is not None}
    if not wanted:
        return
    result = await session.execute(
        select(LedgerAccount.id).where(
            LedgerAccount.account_id == account_id, LedgerAccount.id.in_(wanted)
        )
    )
    missing = wanted - set(result.scalars().all())
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ledger account(s) for this account: {sorted(missing)}",
        )
```

- [ ] **Step 4: Call it from the three routes that accept client lines**

Only three routes carry client-supplied lines. `PATCH "/bulk"` does not — `FlowBulkUpdate` synthesizes its own single line — so it is deliberately left alone.

In `create_flow` (`@router.post("")`), immediately after the existing `_validate_category(...)` call:

```python
    await _validate_ledger_accounts(session, account.id, payload.lines)
```

In `update_flow` (`@router.patch("/{flow_id}")`), immediately after its `_validate_category(session, flow.account_id, payload.category_id)` line:

```python
    await _validate_ledger_accounts(session, flow.account_id, payload.lines)
```

In `create_flows_bulk` (`@router.post("/bulk")`), before the loop that creates the flows — one query covers the whole batch:

```python
    await _validate_ledger_accounts(
        session, account.id, [line for f in payload.flows for line in f.lines]
    )
```

- [ ] **Step 5: Verify against the running API**

Restart the API (`set -a && . .env && set +a && uv run uvicorn fisac.main:app --port 8000`). Using `$ACC` from Task 1, and a second account `$OTHER` with its own ledger account `$OTHERLA`:

```bash
# Create a second account and a ledger account on it, to test the cross-Account case.
OTHER=$(curl -s -X POST localhost:8000/api/accounts -H 'Content-Type: application/json' -d '{"name":"other"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
OTHERLA=$(curl -s -X POST localhost:8000/api/accounts/$OTHER/ledger-accounts -H 'Content-Type: application/json' -d '{"code":"610000","name":"Theirs"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
MYLA=<id of a ledger account on $ACC>

echo "-- book to own account"; curl -s -X POST localhost:8000/api/accounts/$ACC/flows \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"probe\",\"kind\":\"expense\",\"invoice_date\":\"2026-03-01\",\"paid\":false,\"reverse_charge\":false,\"lines\":[{\"amount_net\":\"100.00\",\"vat_rate\":\"21\",\"ledger_account_id\":$MYLA}]}"

echo "-- book to ANOTHER account's ledger account"; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8000/api/accounts/$ACC/flows \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"leak\",\"kind\":\"expense\",\"invoice_date\":\"2026-03-01\",\"paid\":false,\"reverse_charge\":false,\"lines\":[{\"amount_net\":\"100.00\",\"vat_rate\":\"21\",\"ledger_account_id\":$OTHERLA}]}"

echo "-- unbooked line still fine"; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8000/api/accounts/$ACC/flows \
  -H 'Content-Type: application/json' \
  -d '{"name":"unbooked","kind":"expense","invoice_date":"2026-03-01","paid":false,"reverse_charge":false,"lines":[{"amount_net":"50.00","vat_rate":"0"}]}'
```

Expected: the first returns a flow whose line carries `"ledger_account_id": <MYLA>`; the second returns **400**; the third returns **201** with `"ledger_account_id": null`.

The 400 is the whole point of this task — if it returns 201, the leak this validator exists to close is still open.

- [ ] **Step 6: Commit**

```bash
git add backend/src/fisac/schemas.py backend/src/fisac/routers/flows.py
git commit -m "feat: allow booking flow lines to ledger accounts"
```

---

### Task 4: Booking on flow lines — UI

**Files:**
- Modify: `frontend/src/api/types.ts` (`FlowLineCreate`, `FlowLineRead`)
- Modify: `frontend/src/components/LinesEditor.tsx` (`LineDraft`, `emptyLine`, `linesToDrafts`, `linesToPayload`, props, row markup)
- Modify: `frontend/src/components/FlowList.tsx` (fetch and drill)
- Modify: `frontend/src/components/FlowForm.tsx`, `FlowRow.tsx`, `FlowGenerator.tsx` (one prop each, passed through)
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `LedgerAccountRead` and `listLedgerAccounts` from Task 2; `ledger_account_id` on the line schemas from Task 3.
- Produces: `LineDraft.ledger_account_id: string` (`''` means unbooked) and a `ledgerAccounts: LedgerAccountRead[]` prop on `LinesEditor`, `FlowForm`, `FlowRow`, `FlowGenerator`.

- [ ] **Step 1: Mirror the field into TypeScript**

In `frontend/src/api/types.ts`, add to `FlowLineCreate`:

```typescript
  // null means unbooked. Must reference a ledger account of the same account
  // as the flow; the API rejects anything else with a 400.
  ledger_account_id?: number | null
```

and to `FlowLineRead`:

```typescript
  ledger_account_id: number | null
```

- [ ] **Step 2: Carry the field through the draft conversions**

In `frontend/src/components/LinesEditor.tsx`:

Add to the `LineDraft` interface, after `vat_rate`:

```typescript
  // '' means unbooked; the select's blank option. Converted to null on submit.
  ledger_account_id: string
```

In `emptyLine()`, add `ledger_account_id: ''` to the returned object.

In `linesToDrafts`, add to the mapped object:

```typescript
    ledger_account_id: l.ledger_account_id === null ? '' : String(l.ledger_account_id),
```

In `linesToPayload`, add to the mapped object:

```typescript
      ledger_account_id: l.ledger_account_id === '' ? null : Number(l.ledger_account_id),
```

- [ ] **Step 3: Add the picker to the editor**

Change the props interface:

```typescript
interface LinesEditorProps {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  // The account's chart, fetched once by FlowList and drilled down exactly as
  // `categories` already is.
  ledgerAccounts: LedgerAccountRead[]
}

export function LinesEditor({ lines, onChange, ledgerAccounts }: LinesEditorProps) {
```

Add the import at the top of the file:

```typescript
import type { FlowLineCreate, FlowLineRead, LedgerAccountRead } from '../api/types'
```

Insert this `<select>` in the row markup, between the gross `<span className="line-unit">` block and the remove `<button>`:

```tsx
          <select
            className="line-ledger"
            value={line.ledger_account_id}
            onChange={(e) => updateLine(i, { ledger_account_id: e.target.value })}
            aria-label="Ledger account"
          >
            <option value="">— no ledger account —</option>
            {ledgerAccounts.map((la) => (
              <option key={la.id} value={String(la.id)}>
                {la.code} — {la.name}
              </option>
            ))}
          </select>
```

- [ ] **Step 4: Fetch and drill from FlowList**

In `frontend/src/components/FlowList.tsx`:

1. Add `listLedgerAccounts` to the `../api/client` import (alphabetical, near `listCategories` on line 8) and `LedgerAccountRead` to the type import.
2. Beside the categories state at line 85:

```typescript
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountRead[]>([])
```

3. Add `listLedgerAccounts(account.id)` to the `Promise.all` that already contains `listCategories(account.id)` at line 105, and destructure the extra result into `setLedgerAccounts`.
4. At **each of the four** sites that currently pass `categories={categories}` (lines 533, 551, 583, 596), add:

```tsx
                    ledgerAccounts={ledgerAccounts}
```

- [ ] **Step 5: Thread the prop through the three intermediates**

In each of `FlowForm.tsx`, `FlowRow.tsx` and `FlowGenerator.tsx`:

1. Add to the props interface, after `categories: CategoryRead[]`:

```typescript
  ledgerAccounts: LedgerAccountRead[]
```

2. Add `LedgerAccountRead` to the `../api/types` type import.
3. Add `ledgerAccounts` to the destructured parameter list.
4. Pass it to the editor — `FlowForm.tsx:194`, `FlowRow.tsx:261`, `FlowGenerator.tsx:163`:

```tsx
<LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
```

- [ ] **Step 6: Style the select**

Append to `frontend/src/styles.css`:

```css
.line-ledger {
  min-width: 12rem;
  max-width: 16rem;
}
```

- [ ] **Step 7: Typecheck**

```bash
cd frontend && npm run build
```

Expected: `tsc -b` passes. A missing-prop error at any call site means one of the three intermediates was missed — fix it rather than making the prop optional, because an optional prop would silently render an empty picker.

- [ ] **Step 8: Drive the UI**

With the API running and `npm run dev`: expand a flow, pick a ledger account on a line, save, reload, and confirm the selection persisted. Add a second line booked to a different account and confirm both persist. Clear a selection back to the blank option and confirm it reads back as unbooked.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/LinesEditor.tsx frontend/src/components/FlowList.tsx frontend/src/components/FlowForm.tsx frontend/src/components/FlowRow.tsx frontend/src/components/FlowGenerator.tsx frontend/src/styles.css
git commit -m "feat: pick a ledger account per invoice line"
```

---

### Task 5: Annual accounts endpoint

**Files:**
- Modify: `backend/src/fisac/schemas.py` (add an `# --- Annual accounts ---` section at the end)
- Create: `backend/src/fisac/routers/annual_accounts.py`
- Modify: `backend/src/fisac/main.py` (import and mount)

**Interfaces:**
- Consumes: `FlowLine.ledger_account_id` (Task 3), `LedgerAccount` and its `pcmn_class`, `Flow.ratio`, `Category.vat_deduction_rate`.
- Produces: `GET /api/accounts/{account_id}/annual-accounts?year=YYYY` returning `AnnualAccounts{year, classes[], unassigned, result}`. Task 6 mirrors this shape into TypeScript exactly.

- [ ] **Step 1: Add the response schemas**

Append to `backend/src/fisac/schemas.py`:

```python
# --- Annual accounts --------------------------------------------------------


class LedgerAccountTotals(BaseModel):
    id: int
    code: str
    name: str
    current: Decimal
    prior: Decimal
    delta: Decimal


class LedgerClassTotals(BaseModel):
    pcmn_class: int
    label: str
    accounts: list[LedgerAccountTotals]
    current_total: Decimal
    prior_total: Decimal
    delta: Decimal


class UnassignedTotals(BaseModel):
    current: Decimal
    prior: Decimal
    delta: Decimal
    # Unbooked lines in the displayed year only - what is left to do now, not a
    # historical count.
    line_count: int


class PeriodTotals(BaseModel):
    current: Decimal
    prior: Decimal
    delta: Decimal


class AnnualAccounts(BaseModel):
    year: int
    classes: list[LedgerClassTotals]
    unassigned: UnassignedTotals
    result: PeriodTotals
```

- [ ] **Step 2: Write the router**

Create `backend/src/fisac/routers/annual_accounts.py`:

```python
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fisac.db import get_session
from fisac.dependencies import get_account
from fisac.models import Account, Category, Flow, FlowKind, FlowLine, LedgerAccount
from fisac.schemas import (
    AnnualAccounts,
    LedgerAccountTotals,
    LedgerClassTotals,
    PeriodTotals,
    UnassignedTotals,
)

router = APIRouter(
    prefix="/api/accounts/{account_id}/annual-accounts", tags=["annual-accounts"]
)

_CENTS = Decimal("0.01")

PCMN_CLASS_LABELS = {
    1: "Capitaux propres",
    2: "Immobilisés",
    3: "Stocks",
    4: "Créances et dettes",
    5: "Trésorerie",
    6: "Charges",
    7: "Produits",
}


def _line_amount(
    kind: FlowKind, ratio: Decimal, vat_deduction_rate: Decimal, line: FlowLine
) -> Decimal:
    """One line's signed contribution to its ledger account.

    See "Booking amount formula" in the ledger accounts design doc. The
    unrecoverable-VAT factor is applied UNIFORMLY to revenue and expense lines.
    That carries a known, deliberately kept defect - a revenue flow with no
    category books the full gross - which is documented in that doc and must
    not be silently fixed here. Do not add a kind- or class-based condition.
    """
    sign = Decimal("1") if kind == FlowKind.REVENUE else Decimal("-1")
    factor = Decimal("1") + (line.vat_rate / Decimal("100")) * (
        Decimal("1") - vat_deduction_rate / Decimal("100")
    )
    return (line.amount_net * sign * factor * ratio).quantize(_CENTS, ROUND_HALF_UP)


async def _totals_for_year(
    session: AsyncSession, account_id: int, year: int
) -> tuple[dict[int | None, Decimal], int]:
    """Signed total per ledger_account_id (None = unbooked), and how many
    unbooked lines there were.

    Bucketed by invoice_date, not payment_date: this is a fiscal figure, the
    same choice routers/vat.py makes.
    """
    start, end = date(year, 1, 1), date(year, 12, 31)
    result = await session.execute(
        select(Flow).where(
            Flow.account_id == account_id,
            Flow.invoice_date >= start,
            Flow.invoice_date <= end,
        )
    )
    flows = list(result.scalars().all())

    totals: dict[int | None, Decimal] = defaultdict(lambda: Decimal("0"))
    unbooked_lines = 0
    if not flows:
        return totals, unbooked_lines

    lines_result = await session.execute(
        select(FlowLine).where(FlowLine.flow_id.in_([f.id for f in flows]))
    )
    lines_by_flow: dict[int, list[FlowLine]] = defaultdict(list)
    for line in lines_result.scalars().all():
        lines_by_flow[line.flow_id].append(line)

    cat_result = await session.execute(
        select(Category.id, Category.vat_deduction_rate).where(
            Category.account_id == account_id
        )
    )
    vat_rate_by_category: dict[int, Decimal] = dict(cat_result.all())

    for flow in flows:
        # No category recovers no VAT, so all of it is a cost. This mirrors
        # routers/vat.py's expense branch; see the design doc for why it is
        # applied to revenue flows too, and what that costs.
        deduction_rate = (
            vat_rate_by_category.get(flow.category_id, Decimal("0"))
            if flow.category_id is not None
            else Decimal("0")
        )
        for line in lines_by_flow[flow.id]:
            totals[line.ledger_account_id] += _line_amount(
                flow.kind, flow.ratio, deduction_rate, line
            )
            if line.ledger_account_id is None:
                unbooked_lines += 1

    return totals, unbooked_lines


@router.get("", response_model=AnnualAccounts)
async def get_annual_accounts(
    year: int | None = None,
    account: Account = Depends(get_account),
    session: AsyncSession = Depends(get_session),
) -> AnnualAccounts:
    target = year if year is not None else date.today().year
    current, unbooked_current = await _totals_for_year(session, account.id, target)
    prior, _ = await _totals_for_year(session, account.id, target - 1)

    ledger_result = await session.execute(
        select(LedgerAccount)
        .where(LedgerAccount.account_id == account.id)
        .order_by(LedgerAccount.code)
    )
    ledger_accounts = list(ledger_result.scalars().all())

    # Every chart account is returned, including all-zero ones, so the view's
    # "show all accounts" toggle filters client-side without a refetch.
    by_class: dict[int, list[LedgerAccountTotals]] = defaultdict(list)
    for la in ledger_accounts:
        c = current.get(la.id, Decimal("0"))
        p = prior.get(la.id, Decimal("0"))
        by_class[la.pcmn_class].append(
            LedgerAccountTotals(id=la.id, code=la.code, name=la.name, current=c, prior=p, delta=c - p)
        )

    # Descending: a compte de résultats reads produits (7) above charges (6).
    # A class 1-5 group appears if the chart has one - booking there is allowed
    # by the schema, so anything booked stays visible.
    classes = [
        LedgerClassTotals(
            pcmn_class=cls,
            label=PCMN_CLASS_LABELS[cls],
            accounts=rows,
            current_total=sum((r.current for r in rows), Decimal("0")),
            prior_total=sum((r.prior for r in rows), Decimal("0")),
            delta=sum((r.delta for r in rows), Decimal("0")),
        )
        for cls, rows in sorted(by_class.items(), reverse=True)
    ]

    uc = current.get(None, Decimal("0"))
    up = prior.get(None, Decimal("0"))
    unassigned = UnassignedTotals(
        current=uc, prior=up, delta=uc - up, line_count=unbooked_current
    )

    # Sums every class plus the unassigned bucket, so no grouping decision can
    # quietly keep something out of the bottom line.
    rc = sum((c.current_total for c in classes), Decimal("0")) + uc
    rp = sum((c.prior_total for c in classes), Decimal("0")) + up
    return AnnualAccounts(
        year=target,
        classes=classes,
        unassigned=unassigned,
        result=PeriodTotals(current=rc, prior=rp, delta=rc - rp),
    )
```

- [ ] **Step 3: Mount the router**

In `backend/src/fisac/main.py`, extend the import and add the mount after `app.include_router(accounts.router)`:

```python
from fisac.routers import accounts, annual_accounts, categories, flows, ledger_accounts, projection, vat
```

```python
app.include_router(annual_accounts.router)
```

- [ ] **Step 4: Seed the worked example**

Restart the API. On a **fresh account** so nothing else interferes, seed exactly this. Note each id as you go.

```bash
A=$(curl -s -X POST localhost:8000/api/accounts -H 'Content-Type: application/json' -d '{"name":"annual-probe","is_company":true,"vat_applicable":true}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
CAR=$(curl -s -X POST localhost:8000/api/accounts/$A/categories -H 'Content-Type: application/json' -d '{"name":"Car","vat_deduction_rate":"50"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
L6=$(curl -s -X POST localhost:8000/api/accounts/$A/ledger-accounts -H 'Content-Type: application/json' -d '{"code":"610000","name":"Fournitures"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
L7=$(curl -s -X POST localhost:8000/api/accounts/$A/ledger-accounts -H 'Content-Type: application/json' -d '{"code":"700000","name":"Ventes"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
F=localhost:8000/api/accounts/$A/flows
H='Content-Type: application/json'

# 1 expense, 1200 @21%, Car (50% deductible), ratio 1 -> 610000
curl -s -o /dev/null -X POST $F -H "$H" -d "{\"name\":\"supplies\",\"kind\":\"expense\",\"category_id\":$CAR,\"invoice_date\":\"2026-03-01\",\"paid\":false,\"reverse_charge\":false,\"lines\":[{\"amount_net\":\"1200.00\",\"vat_rate\":\"21\",\"ledger_account_id\":$L6}]}"
# 2 revenue, 1000 @21%, NO category -> 700000  (exercises the known defect)
curl -s -o /dev/null -X POST $F -H "$H" -d "{\"name\":\"sale\",\"kind\":\"revenue\",\"invoice_date\":\"2026-04-01\",\"paid\":false,\"reverse_charge\":false,\"lines\":[{\"amount_net\":\"1000.00\",\"vat_rate\":\"21\",\"ledger_account_id\":$L7}]}"
# 3 refund of flow 1: a REVENUE flow booked to the class-6 account
curl -s -o /dev/null -X POST $F -H "$H" -d "{\"name\":\"supplies refund\",\"kind\":\"revenue\",\"category_id\":$CAR,\"invoice_date\":\"2026-05-01\",\"paid\":false,\"reverse_charge\":false,\"lines\":[{\"amount_net\":\"1200.00\",\"vat_rate\":\"21\",\"ledger_account_id\":$L6}]}"
# 5 unbooked line
curl -s -o /dev/null -X POST $F -H "$H" -d '{"name":"unbooked","kind":"expense","invoice_date":"2026-06-01","paid":false,"reverse_charge":false,"lines":[{"amount_net":"50.00","vat_rate":"0"}]}'
```

Flow 4 needs `ratio = 0.66667`, which no API can set (out of scope — see the spec). Insert it directly:

```bash
set -a && . .env && set +a
docker exec fisac-dev-pg psql -U fisac -d fisac -q -c "
  INSERT INTO fisac.flows (account_id, name, kind, invoice_date, paid, reverse_charge, ratio, sort_key)
  VALUES ($A, 'insurance', 'EXPENSE', DATE '2026-05-01', false, false, 0.66667, 'zz')
  RETURNING id;"
# then, with that flow id as \$FID and the 610000 id as \$L6:
docker exec fisac-dev-pg psql -U fisac -d fisac -q -c "
  INSERT INTO fisac.flow_lines (flow_id, amount_net, vat_rate, sort_key, ledger_account_id)
  VALUES (<FID>, 1200.00, 0, 'a0', $L6);"
```

- [ ] **Step 5: Check the endpoint against hand-computed figures**

```bash
curl -s "localhost:8000/api/accounts/$A/annual-accounts?year=2026" | python3 -m json.tool
```

Computed by hand from the formula, independently of the code:

| # | kind | net | vat | ded. rate | factor | ratio | amount | account |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | expense | 1200 | 21 | 50 | 1.105 | 1 | **-1326.00** | 610000 |
| 2 | revenue | 1000 | 21 | 0 (no category) | 1.21 | 1 | **+1210.00** | 700000 |
| 3 | revenue | 1200 | 21 | 50 | 1.105 | 1 | **+1326.00** | 610000 |
| 4 | expense | 1200 | 0 | 0 | 1.0 | 0.66667 | **-800.00** | 610000 |
| 5 | expense | 50 | 0 | 0 | 1.0 | 1 | **-50.00** | unassigned |

Expected, exactly:

- `610000` current `-800.00` (`-1326 + 1326 - 800`), prior `0.00`, delta `-800.00`
- `700000` current `+1210.00`, prior `0.00`, delta `1210.00`
- class 7 subtotal `1210.00`; class 6 subtotal `-800.00`; class **7 listed before class 6**
- `unassigned.current` `-50.00`, `line_count` `1`
- `result.current` `360.00`, `prior` `0.00`, `delta` `360.00`

Three of these are load-bearing and worth checking individually:

- **Row 3 cancelling row 1 to zero on 610000** is the whole reason the factor is uniform. If 610000 shows `-1326 + 1200` instead, a kind-based condition crept into `_line_amount`.
- **Row 2 at `+1210.00`, not `+1000.00`,** is the known defect behaving as documented. If it reads `1000.00`, someone "fixed" the formula — revert that; the decision is recorded in the design doc.
- **Row 4 at exactly `-800.00`** proves ratio and rounding compose: `1200 × 0.66667 = 800.004`, which must round to `800.00`, not `800.01`.

Also check `?year=2027` returns `prior` figures equal to 2026's `current` — that is the comparison column wiring.

- [ ] **Step 6: Commit**

```bash
git add backend/src/fisac/schemas.py backend/src/fisac/routers/annual_accounts.py backend/src/fisac/main.py
git commit -m "feat: add annual accounts aggregation endpoint"
```

---

### Task 6: Annual accounts view

**Files:**
- Modify: `frontend/src/api/types.ts` (five interfaces)
- Modify: `frontend/src/api/client.ts` (one function)
- Create: `frontend/src/components/AnnualAccountsView.tsx`
- Modify: `frontend/src/App.tsx` (tab), `frontend/src/styles.css`

**Interfaces:**
- Consumes: Task 5's endpoint and its exact JSON shape.
- Produces: the `📚 Annual` tab. Nothing depends on it.

- [ ] **Step 1: Mirror the response types**

Append to `frontend/src/api/types.ts`:

```typescript
export interface LedgerAccountTotals {
  id: number
  code: string
  name: string
  // Signed: revenue positive, expense negative. A class-6 account therefore
  // holds a negative total.
  current: string
  prior: string
  delta: string
}

export interface LedgerClassTotals {
  pcmn_class: number
  label: string
  accounts: LedgerAccountTotals[]
  current_total: string
  prior_total: string
  delta: string
}

export interface UnassignedTotals {
  current: string
  prior: string
  delta: string
  line_count: number
}

export interface PeriodTotals {
  current: string
  prior: string
  delta: string
}

export interface AnnualAccounts {
  year: number
  classes: LedgerClassTotals[]
  unassigned: UnassignedTotals
  result: PeriodTotals
}
```

- [ ] **Step 2: Add the client function**

Add `AnnualAccounts` to the type import block in `frontend/src/api/client.ts`, then append:

```typescript
// --- Annual accounts --------------------------------------------------------

export function fetchAnnualAccounts(accountId: number, year?: number): Promise<AnnualAccounts> {
  const query = year === undefined ? '' : `?year=${year}`
  return request(`/accounts/${accountId}/annual-accounts${query}`)
}
```

- [ ] **Step 3: Write the view**

Create `frontend/src/components/AnnualAccountsView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fetchAnnualAccounts } from '../api/client'
import type { AccountRead, AnnualAccounts } from '../api/types'
import { formatMoney } from '../accountingDisplay'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AnnualAccountsViewProps {
  account: AccountRead
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 1 - i)

// Figures are signed - revenue positive, expense negative - so colour follows
// the sign itself, not the account's class.
function signClass(value: string): string {
  const n = Number(value)
  if (n > 0) return 'amount-positive'
  if (n < 0) return 'amount-negative'
  return ''
}

function hasActivity(current: string, prior: string): boolean {
  return Number(current) !== 0 || Number(prior) !== 0
}

export function AnnualAccountsView({ account }: AnnualAccountsViewProps) {
  const [data, setData] = useState<AnnualAccounts | null>(null)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setData(null)
    fetchAnnualAccounts(account.id, year).then(setData)
  }, [account.id, year])

  if (data === null) return <p className="empty-state">Loading…</p>

  return (
    <div className="annual-view">
      <div className="annual-header">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {year} <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              {YEARS.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)}>
                  {y}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="annual-show-all">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all accounts
        </label>
      </div>

      <div className="annual-table">
        <div className="annual-row annual-head">
          <span>Account</span>
          <span>{year}</span>
          <span>{year - 1}</span>
          <span>Δ</span>
        </div>

        {data.classes.map((cls) => {
          // Off by default: an account with no activity in either year is
          // noise. One used last year but not this one still shows, because an
          // account going to zero is exactly what the comparison is for.
          const rows = showAll
            ? cls.accounts
            : cls.accounts.filter((a) => hasActivity(a.current, a.prior))
          if (rows.length === 0) return null
          return (
            <div className="annual-class" key={cls.pcmn_class}>
              <div className="annual-class-head">
                {cls.pcmn_class} {cls.label}
              </div>
              {rows.map((a) => (
                <div className="annual-row" key={a.id}>
                  <span>
                    <span className="ledger-code">{a.code}</span> {a.name}
                  </span>
                  <span className={signClass(a.current)}>{formatMoney(a.current)}</span>
                  <span className={signClass(a.prior)}>{formatMoney(a.prior)}</span>
                  <span className={signClass(a.delta)}>{formatMoney(a.delta)}</span>
                </div>
              ))}
              <div className="annual-row annual-subtotal">
                <span>Subtotal</span>
                <span className={signClass(cls.current_total)}>{formatMoney(cls.current_total)}</span>
                <span className={signClass(cls.prior_total)}>{formatMoney(cls.prior_total)}</span>
                <span className={signClass(cls.delta)}>{formatMoney(cls.delta)}</span>
              </div>
            </div>
          )
        })}

        {/* Shown whatever the toggle says: lines booked nowhere must stay
            visible, or the result looks unexplained. */}
        {hasActivity(data.unassigned.current, data.unassigned.prior) && (
          <div className="annual-row annual-unassigned">
            <span>
              Unassigned ({data.unassigned.line_count}{' '}
              {data.unassigned.line_count === 1 ? 'line' : 'lines'})
            </span>
            <span className={signClass(data.unassigned.current)}>{formatMoney(data.unassigned.current)}</span>
            <span className={signClass(data.unassigned.prior)}>{formatMoney(data.unassigned.prior)}</span>
            <span className={signClass(data.unassigned.delta)}>{formatMoney(data.unassigned.delta)}</span>
          </div>
        )}

        <div className="annual-row annual-result">
          <span>Result</span>
          <span className={signClass(data.result.current)}>{formatMoney(data.result.current)}</span>
          <span className={signClass(data.result.prior)}>{formatMoney(data.result.prior)}</span>
          <span className={signClass(data.result.delta)}>{formatMoney(data.result.delta)}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the tab**

In `frontend/src/App.tsx`:

1. `import { AnnualAccountsView } from './components/AnnualAccountsView'`
2. Tab type gains `| 'annual'`.
3. Nav button after the VAT button:

```tsx
            <button
              className={`sidebar-nav-item${tab === 'annual' ? ' active' : ''}`}
              onClick={() => setTab('annual')}
            >
              📚 Annual
            </button>
```

4. Render branch after the VAT one:

```tsx
          {!loading && selectedAccount !== null && tab === 'annual' && (
            <AnnualAccountsView account={selectedAccount} />
          )}
```

5. `pageClass`: annual is a fill tab like VAT, so its table can scroll internally —

```typescript
  const pageClass = wideTab ? 'page page-wide' : tab === 'vat' || tab === 'annual' ? 'page page-fill' : 'page'
```

- [ ] **Step 5: Add the styles**

Append to `frontend/src/styles.css`:

```css
.annual-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.annual-show-all {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9em;
}

.annual-row {
  display: grid;
  grid-template-columns: 1fr 8rem 8rem 8rem;
  gap: 0.5rem;
  padding: 0.15rem 0;
  font-variant-numeric: tabular-nums;
}

.annual-row > span:not(:first-child) {
  text-align: right;
}

.annual-head,
.annual-subtotal,
.annual-result {
  font-weight: 600;
}

.annual-class-head {
  margin-top: 0.75rem;
  font-weight: 600;
  opacity: 0.75;
}

.annual-subtotal,
.annual-result {
  border-top: 1px solid var(--border, #ddd);
}

.annual-result {
  margin-top: 0.5rem;
  border-top-width: 2px;
}
```

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npm run build
```

Expected: `tsc -b` passes.

- [ ] **Step 7: Drive the UI against the Task 5 worked example**

`npm run dev`, switch to the `annual-probe` account, open the Annual tab for 2026. Confirm against the same hand-computed figures: class 7 above class 6; `700000` at `1210.00` in green; `610000` at `-800.00` in red; the unassigned row at `-50.00` reading "Unassigned (1 line)"; Result `360.00`. Toggle "Show all accounts" and confirm no extra rows appear (both chart accounts have activity), then step the year to 2027 and confirm the prior column now shows 2026's figures.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/components/AnnualAccountsView.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -m "feat: add annual accounts view"
```

---

## Done when

- `/api/accounts/{id}/ledger-accounts` supports list/create/patch/delete, deriving `pcmn_class`, returning 409 on a duplicate code, 422 on a malformed one and 404 for another Account's id.
- The Ledger tab can add, rename and delete chart entries.
- A flow line can be booked, reads back booked, and a line referencing another Account's ledger account is rejected with 400.
- `/api/accounts/{id}/annual-accounts?year=` returns both years and reproduces the worked example's figures exactly.
- The Annual tab renders classes descending with subtotals, an unassigned row, a result row, and a working show-all toggle.
- `cd frontend && npm run build` passes.
- Six commits on `feat/ledger-accounts-wiring`.

## Explicitly not in this plan

- Setting `flows.ratio` from the UI. The column exists, the report honours it, and nothing but direct SQL can change it. It belongs on the flow form, which this work does not touch.
- Bulk booking. `PATCH /flows/bulk` replaces a flow's line set with one synthesized, unbooked line when `amount_net` is present, so a bulk amount edit clears bookings — existing behaviour of that path, which already discards descriptions and multi-line structure.
- Any balance sheet. Classes 1-5 render only if something was booked there.
- Class/kind validation, still deliberately absent so refunds stay expressible.
