# Ledger Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every fisac frontend view on the `@qvanderlinden/ui` design system (its Ledger UI kit) — French, light only, same features and data, no backend change.

**Architecture:** Foundation first: a Tailwind entry that loads the design system's styles, the pre-redesign `styles.css` demoted to the lowest cascade layer so it can never beat a design-system rule, French formatters and an API-error helper with unit tests, and a compliance guard that skips a shrinking allowlist of not-yet-migrated files. Then the shell, then one view per task: each task rewrites whole components on the system's components and primitives and removes them from the guard's allowlist. Cleanup deletes the legacy CSS, the vendored primitives and the allowlist; a last task moves the Docker build to a BuildKit secret.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 6.4, Tailwind CSS 4.3 (`@tailwindcss/vite`), `@qvanderlinden/ui` 0.1.0 (shadcn/Radix components, `/primitives`, formatters), `lucide-react` 1.26, vitest 5 (new, for `format.ts` and `errors.ts`), Docker BuildKit (`docker/dockerfile:1.10`).

**Spec:** `docs/superpowers/specs/2026-10-03-ledger-redesign-design.md` — the binding authority; read it before Task 1.

## Global Constraints

Every task's requirements include these.

- Design system first: compose from `@qvanderlinden/ui` components, then the restyled primitives from `@qvanderlinden/ui/primitives`; use only APIs declared in `frontend/node_modules/@qvanderlinden/ui/dist/**/*.d.ts` (there is no DropdownMenu and no Popover). Read `frontend/node_modules/@qvanderlinden/ui/SKILL.md` and `docs/brand.md` once before Task 3.
- Brand utilities only — `bg-surface-*`, `text-fg-*`, `border-line-*`, status `text-positive-fg` / `text-negative-fg` / `text-warning-fg`, ramps (`clay-*`, `cream-*`, `ink-*`), `rounded-xs…xl`, `shadow-xs…lg`, the 4px spacing scale; never a raw hex colour or a Tailwind default-palette class in `frontend/src/`. The PWA manifest (`vite.config.ts`) and `index.html`'s `theme-color` are the only literal colours.
- Type through roles (`type-title`, `type-subheading`, `type-body-sm`, `type-label`, `type-eyebrow`, …); every figure carries `numeric` (mono, tabular).
- Money through `eur()` / `signedEur()` (or `formatEur`), dates through `formatDate()` and typed numbers through `parseDecimal()` — all from `src/format.ts`; never `toFixed(` or `toLocaleString(`; never `formatDate` from `@qvanderlinden/ui` (it is English-only).
- Lucide icons only (as components, e.g. `iconLeft={Plus}`); no emoji; no glyph icons (⚙ ▾ ▸ ⚠ ✓ ✕ ✎ ▲ ▼ ↕ ×).
- At most one `primary` Button per view (a dialog's footer is its own view); when a StatCard is accented, the view has no primary Button.
- Copy is French. Lowercase navigation, tabs, tags, badges, eyebrows and table headers; sentence case for titles, headings and buttons; nothing in Title Case. Errors say what happened and what to do and never apologise; toasts are full sentences ending with a full stop.
- Light only: no `prefers-color-scheme: dark` CSS anywhere.
- Confirmations through `ConfirmDialog` (never `window.confirm()`); successful actions raise `toast(…, { tone: 'positive' })`.
- Radix Select values cannot be empty strings: use the `'none'` / `'any'` sentinels exactly as the code below does.
- No backend or API change: `backend/`, `frontend/src/api/client.ts` and `frontend/src/api/types.ts` stay untouched.
- Commits: Conventional Commits, the exact `git add` paths given in each task, no `Co-Authored-By` and no "Generated with" trailer.
- Workspace: all work happens in the worktree `/Users/quentin/projects/personal/fisac/.worktrees/redesign` on branch `redesign`. Never edit files or switch branches in the main checkout `/Users/quentin/projects/personal/fisac` — the user's dev server runs there.
- npm reaches GitHub Packages for `@qvanderlinden/ui`, so every `npm ci` / `npm install` / `npm uninstall` runs after `source /Users/quentin/projects/personal/fisac/.envrc` in the same shell (it exports `NODE_AUTH_TOKEN`). Never print, log or commit the token.
- Every task ends green, run in `frontend/`: `npm run build` (from Task 1), `npm run test` (from Task 1), `npm run check:design` (from Task 2).
- Browser walkthroughs (each task's last check) use the Chrome DevTools MCP tools (`new_page`, `navigate_page`, `take_snapshot`, `click`, `fill`, `press_key`, `hover`, `drag`, `resize_page`, `emulate`, `evaluate_script`, `get_css_styles`, `list_network_requests`, `list_console_messages`) against the worktree's dev server: `cd frontend && npm run dev -- --port 5174 --strictPort` (5173 is the user's), which proxies `/api` to the backend on `:8000`. Reuse the user's running backend (`curl -sf localhost:8000/api/accounts >/dev/null` succeeds); if it is not running, stop and ask — do not start one against the user's database unasked. Mutate data only in the two throwaway accounts created in Task 3, **Essai redesign** and **Essai vide** (deleted in Task 12); real accounts are only viewed. The dev service worker can serve a stale bundle: hard-reload (`navigate_page` with `ignoreCache`) after each task's changes. Every walkthrough ends with `list_console_messages` showing no errors.

## Review Focus

The spec says what the software must do, not every input it will meet. These five are the inputs most likely to bite the user that no build, test or guard exercises; each is pinned to a walkthrough check in the task that owns the code (marked **Review Focus N** there).

1. **French decimal input.** Typing `12,5`, `1 234,56` or `−42,5` into any amount or rate field (line editor, account balance, current balance, bulk amount, category rates) is read as 12.50 / 1234.56 / −42.50, saved, and shown back the same way; unreadable text such as `12,5x` is marked red and blocks the save instead of being silently dropped (the design system's numeric `Input` is a text field). Pinned in Task 1 (unit tests of `parseDecimal`), Task 3, Task 4, Task 5, Task 7, Task 8.
2. **Keyboard-only use of the editable tables.** Tab through a flow row, open and choose a `Select` with the keyboard, commit with Enter, cancel the quick-add with Escape — while Escape inside an open `Select` only closes the `Select` —, toggle payé, expand the lines, reorder categories with the arrow keys, step through the chart with the arrow keys. Pinned in Task 5, Task 6, Task 8.
3. **Unsaved input in a dialog.** A stray click on the scrim of the account, flow, bulk-edit or generator dialog keeps it open with the typed input intact; Escape and "Annuler" close it; with nested dialogs Escape closes only the top one. Pinned in Task 3, Task 4, Task 7.
4. **An account with no data.** No flows, categories or ledger accounts: every view shows its empty state — no crash, no `NaN`, no `−€0,00`, no badge. Pinned in Task 5, Task 6, Task 8, Task 9, Task 10, Task 11.
5. **Long names on a narrow screen.** A 120-character flow name and a 60-character account name at 375px wide: no horizontal page scroll, tables scroll inside their card, the account `Select` truncates. Pinned in Task 3, Task 6.

## File Structure

All paths are under `frontend/` unless noted.

| File | Task | Responsibility |
|---|---|---|
| `src/index.css` | create T1, rewrite T12 | Tailwind entry: `tailwindcss`, then `@qvanderlinden/ui/styles.css`; until T12 also `styles.css` in a bottom `legacy` layer |
| `src/main.tsx` | rewrite T1 | Loads the design-system fonts and `index.css`, mounts `<App />` and `<Toaster />` |
| `src/format.ts` | create T1 | Every displayed figure and date: `eur`, `signedEur`, French `formatDate`, rates, typed-number parsing, `countLabel` |
| `src/format.test.ts` | create T1 | vitest unit tests for `format.ts` |
| `src/errors.ts` | create T1 | `describeError` (a failed request as one readable line) and `httpStatus` |
| `src/errors.test.ts` | create T1 | vitest unit tests for `errors.ts` |
| `public/favicon.svg` | create T1 | The design system's favicon, copied from the package |
| `index.html` | rewrite T1 | `lang="fr"`, favicon, terracotta `theme-color`, title `fisac` |
| `vite.config.ts` | modify T1, T12 | Manifest colours and French name (T1); drop the `@/` alias (T12) |
| `package.json`, `package-lock.json` | modify T1, T2, T12 | `vitest` + `test` script (T1); `check:design` script (T2); remove unused deps (T12) |
| `tsconfig.json` | modify T12 | Drop the `@/*` path |
| `scripts/check-design.mjs` | create T2, modify T3–T11, rewrite T12 | Compliance guard; its `LEGACY` allowlist shrinks task by task |
| `src/styles.css` | modify T1, delete T12 | Pre-redesign CSS: dark blocks removed in T1, file deleted in T12 |
| `src/shadcn.css` | delete T1 | Its `:root` re-points the design system's shadcn variables at the old palette |
| `src/components/ui/*`, `src/lib/utils.ts` | delete T12 | Vendored shadcn primitives and their `cn` |
| `src/App.tsx` | rewrite T3, modify T6 | Shell: `SidebarNav`, account selector, breadcrumbs, narrow top bar, empty/loading/error states, account dialog, badges |
| `src/components/ConfirmDialog.tsx` | create T3 | Confirmation `Dialog` that runs an async action and shows its error |
| `src/components/PageHeader.tsx` | create T3 | Serif page title with right-aligned actions |
| `src/components/AccountSwitcher.tsx` | rewrite T3 | Account `Select` (name + balance) with edit and create `IconButton`s |
| `src/components/AccountForm.tsx` | rewrite T3 | Account settings `Dialog`: create, update, delete |
| `src/components/LinesEditor.tsx` | rewrite T4 | Invoice-line editor and the draft ⇄ payload conversions (now French-input aware, with `linesValid`) |
| `src/components/FlowForm.tsx` | rewrite T4 | Full flow editor in a `Dialog`; exports `PAYMENT_METHODS` |
| `src/components/ProjectionView.tsx` | modify T4, rewrite T5 | Projection page: segment, stat cards, balance dialog, chart card, upcoming flows |
| `src/components/BalanceChart.tsx` | rewrite T5 | fisac's step chart drawn with the system's chart tokens, hover/keyboard, table view |
| `src/components/editableTable.ts` | create T6 | Shared classes of the editable tables (cells, row hover, borderless cell controls) |
| `src/components/FlowList.tsx` | rewrite T6 | Revenus / dépenses page: header, toolbar, bulk bar, editable table, dialogs |
| `src/components/FlowRow.tsx` | rewrite T6 | One editable flow row plus its expandable line editor |
| `src/components/NewFlowRow.tsx` | rewrite T6 | Quick-add row (Enter saves, Escape cancels) |
| `src/components/FlowGenerator.tsx` | modify T4, rewrite T7 | LLM generator `Dialog`, three steps |
| `src/components/FlowBulkEditDialog.tsx` | rewrite T7 | Bulk edit `Dialog`, each field behind an enabling `Checkbox` |
| `src/components/CategoriesView.tsx` | rewrite T8 | Catégories editable table with drag-and-drop and arrow-key reordering |
| `src/components/LedgerAccountsView.tsx` | rewrite T9 | Plan comptable editable table with the add row |
| `src/components/VatView.tsx` | rewrite T10 | TVA page |
| `src/components/AnnualAccountsView.tsx` | rewrite T11 | Comptes annuels table |
| `src/accountingDisplay.ts` | modify T6, rewrite T12 | Business logic only: payment-method labels and icons, date arithmetic, Visa cycle, completeness |
| `Dockerfile` (repo root) | modify T13 | `.npmrc` copied, `npm ci` with a BuildKit secret |
| `CLAUDE.md` (repo root) | modify T13 | Design system, token requirement, test and guard scripts, new build command |

Untouched: `src/api/client.ts`, `src/api/types.ts`, `backend/`.

Task boundaries follow the spec's phases with two adjustments: phase 3 is split into the flow form (T4, needed by the projection), the flows table (T6) and the generator/bulk dialogs (T7); phase 6 is split into frontend cleanup (T12) and Docker/docs (T13), because each can be rejected without the other.

### Decisions taken while drafting (deviations from the spec, each verified)

- `shadcn.css` is deleted in Task 1, not at the end: its `:root` block re-points `--primary`, `--border` and the rest of the design system's shadcn contract at the old blue palette, so it cannot coexist with the new styles.
- `styles.css` stays until Task 12 but is imported into a `legacy` cascade layer declared before Tailwind's layers, so un-migrated views keep their classes and no old element rule (`body`, `button`, `h1`) can override the system. Without the `@layer legacy;` statement Tailwind emits that layer last, i.e. on top (checked in the built CSS).
- The sidebar carries the **vertical** lockup, not the horizontal one: at the minimum cell size 5 the horizontal lockup is 201px wide (77px mark + 12px gap + 20 characters of Share Tech Mono at 10px × 0.56em) against 188px available inside `SidebarNav`'s header.
- `format.ts` adds a fourth date style, `full` (`04 oct. 2026`), for tables whose rows can span years (generator review, upcoming flows, chart readout); the three spec styles are kept as specified.
- The system's numeric `Input` is a text field (it accepts comma decimals), so drafts keep the typed text and `parseDecimal` converts on save; `LinesEditor` exports `linesValid` so an unreadable amount blocks the save instead of being dropped.
- `FlowForm` now sends the flow's `reverse_charge` back on save; the old form omitted it and the full-replace PATCH silently reset autoliquidation to false whenever a flow was edited from the projection.
- Keyboard additions: the chart is one focusable element stepped with ←/→/Home/End (instead of one tab stop per point); a category's grip moves it with ↑/↓.
- Form dialogs ignore clicks on the scrim (Review Focus 3); confirmation and balance dialogs still close on it.
- Category and ledger-account deletes stay without confirmation, as today; the spec only replaces the existing `confirm()` calls.
- The design system's own fixed strings stay English where it hard-codes them (the Dialog close button's `aria-label="Close"`, `Field`'s "optional", the Toast's "Dismiss"); no `optional` Field is used, and every `DataTable` gets a French `emptyMessage`. Upstream candidate.

---

### Task 1: Foundation — styles, theme, French formatters

**Files:**
- Create: `frontend/src/index.css`, `frontend/src/format.ts`, `frontend/src/format.test.ts`, `frontend/src/errors.ts`, `frontend/src/errors.test.ts`, `frontend/public/favicon.svg`
- Modify: `frontend/src/main.tsx`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/src/styles.css`, `frontend/package.json`, `frontend/package-lock.json`
- Delete: `frontend/src/shadcn.css`

This task adds a test runner (vitest) to the frontend: `format.ts` and `errors.ts` are the redesign's only new pure logic and get unit tests written first.

**Interfaces:**
- Consumes: `formatEur`, `formatNumber`, `parseNumber`, `Toaster` from `@qvanderlinden/ui`; `FlowKind` from `src/api/types.ts`.
- Produces (`src/format.ts`): `formatEur(value: number, opts?: { decimals?: number }): string`, `formatNumber(value: number, opts?: { decimals?: number }): string`, `parseNumber(input: string): number` (re-exports); `type DateStyle = 'table' | 'month' | 'long' | 'full'`; `formatDate(date: Date | string, style?: DateStyle): string`; `eur(value: string | number): string`; `signedEur(value: string | number): string`; `signedFlowAmount(kind: FlowKind, amount: string | number): number`; `rateInput(value: string | number): string`; `formatRate(value: string | number): string`; `amountInput(value: string | number): string`; `toApiDecimal(value: number): string`; `parseDecimal(text: string): string | null`; `countLabel(n: number, singular: string, plural: string): string`.
- Produces (`src/errors.ts`): `describeError(err: unknown): string`; `httpStatus(err: unknown): number | null`.
- Produces: `<Toaster />` is mounted, so `toast()` from `@qvanderlinden/ui` works anywhere; `npm run test`.

- [ ] **Step 1: Check the workspace and install dependencies**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git branch --show-current          # expect: redesign
git log --oneline -1               # expect: 0736b58 docs: add Ledger redesign spec (or later)
source /Users/quentin/projects/personal/fisac/.envrc
cd frontend && npm ci
```

If the worktree does not exist, stop and ask the controller: creating it means switching the main checkout off `redesign` first (git refuses to check out a branch twice), which the user must approve.

- [ ] **Step 2: Add vitest and the `test` script**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend
source /Users/quentin/projects/personal/fisac/.envrc
npm install -D vitest@^5.0.3
```

Then in `frontend/package.json` replace:

```json
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
```

with:

```json
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Write the failing tests**

The `parseDecimal` cases are Review Focus 1's unit-level pin.

`frontend/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  amountInput,
  countLabel,
  eur,
  formatDate,
  formatRate,
  parseDecimal,
  rateInput,
  signedEur,
  signedFlowAmount,
  toApiDecimal,
} from './format'

// U+202F narrow no-break space (digit groups) and U+2212 true minus, as the
// design system's formatters emit them.
const NNBSP = ' '
const MINUS = '−'

describe('formatDate', () => {
  it('formats table dates as a two-digit day and an abbreviated French month', () => {
    expect(formatDate('2026-10-04')).toBe('04 oct.')
    expect(formatDate('2026-05-12', 'table')).toBe('12 mai')
    expect(formatDate('2026-08-03', 'table')).toBe('03 août')
    expect(formatDate('2026-02-28', 'table')).toBe('28 févr.')
  })

  it('formats list dates as a lowercase abbreviated month and the year', () => {
    expect(formatDate('2026-08-15', 'month')).toBe('août 2026')
    expect(formatDate('2026-09-01', 'month')).toBe('sept. 2026')
  })

  it('formats prose dates with the full month name', () => {
    expect(formatDate('2026-11-30', 'long')).toBe('novembre 2026')
  })

  it('formats full dates with day, abbreviated month and year', () => {
    expect(formatDate('2027-01-05', 'full')).toBe('05 janv. 2027')
  })

  it('reads ISO date-only strings as local calendar dates, not UTC midnight', () => {
    // new Date('2026-01-01') is UTC midnight, i.e. 31 Dec in timezones behind UTC.
    expect(formatDate('2026-01-01')).toBe('01 janv.')
  })

  it('accepts Date objects', () => {
    expect(formatDate(new Date(2026, 6, 14), 'full')).toBe('14 juil. 2026')
  })
})

describe('eur', () => {
  it('formats API decimal strings with the brand euro format', () => {
    expect(eur('84210')).toBe(`€84${NNBSP}210,00`)
    expect(eur('-42.5')).toBe(`${MINUS}€42,50`)
  })

  it('accepts numbers', () => {
    expect(eur(1234.5)).toBe(`€1${NNBSP}234,50`)
  })
})

describe('signedEur', () => {
  it('signs a change either way, and leaves zero unsigned', () => {
    expect(signedEur('1234')).toBe(`+€1${NNBSP}234,00`)
    expect(signedEur(-42.5)).toBe(`${MINUS}€42,50`)
    expect(signedEur('0')).toBe('€0,00')
    expect(signedEur(0.001)).toBe('€0,00')
  })
})

describe('signedFlowAmount', () => {
  it('keeps revenues positive and turns expenses negative', () => {
    expect(signedFlowAmount('revenue', '120.00')).toBe(120)
    expect(signedFlowAmount('expense', '120.00')).toBe(-120)
  })
})

describe('formatRate and rateInput', () => {
  it('drops trailing zero decimals', () => {
    expect(rateInput('21.00')).toBe('21')
    expect(rateInput('5.50')).toBe('5,5')
    expect(rateInput('0')).toBe('0')
    expect(formatRate('100.00')).toBe('100%')
    expect(formatRate('12.25')).toBe('12,25%')
  })
})

describe('amountInput', () => {
  it('shows an amount the way it is typed back: decimal comma, two decimals', () => {
    expect(amountInput('1234.5')).toBe(`1${NNBSP}234,50`)
    expect(amountInput(0)).toBe('0,00')
  })
})

describe('toApiDecimal', () => {
  it('writes a dot decimal rounded to cents, without grouping', () => {
    expect(toApiDecimal(1234.5)).toBe('1234.5')
    expect(toApiDecimal(-42.506)).toBe('-42.51')
    expect(toApiDecimal(0.1 + 0.2)).toBe('0.3')
    expect(toApiDecimal(-0.001)).toBe('0')
  })
})

describe('parseDecimal', () => {
  it('turns French input into an API decimal string', () => {
    expect(parseDecimal('12,50')).toBe('12.5')
    expect(parseDecimal(`1${NNBSP}234,50`)).toBe('1234.5')
    expect(parseDecimal('1 234,5')).toBe('1234.5')
    expect(parseDecimal('-42,5')).toBe('-42.5')
    expect(parseDecimal(`${MINUS}42,5`)).toBe('-42.5')
  })

  it('still accepts dot decimals', () => {
    expect(parseDecimal('12.5')).toBe('12.5')
    expect(parseDecimal('1,234.50')).toBe('1234.5')
  })

  it('returns null for empty or unreadable input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('-')).toBeNull()
  })
})

describe('countLabel', () => {
  it('uses the singular for 0 and 1 and the plural from 2, as French does', () => {
    expect(countLabel(0, 'ligne', 'lignes')).toBe('0 ligne')
    expect(countLabel(1, 'ligne', 'lignes')).toBe('1 ligne')
    expect(countLabel(2, 'flux modifié', 'flux modifiés')).toBe('2 flux modifiés')
  })

  it('groups large counts like every other figure', () => {
    expect(countLabel(1200, 'flux', 'flux')).toBe(`1${NNBSP}200 flux`)
  })
})
```

`frontend/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describeError, httpStatus } from './errors'

// api/client.ts throws Error(`${status} ${statusText}: ${body}`) on a non-2xx response.
const apiError = (status: number, statusText: string, body: string) =>
  new Error(`${status} ${statusText}: ${body}`)

describe('describeError', () => {
  it('returns the detail string of a FastAPI error body', () => {
    const err = apiError(409, 'Conflict', '{"detail":"Code already exists on this account"}')
    expect(describeError(err)).toBe('Code already exists on this account')
  })

  it('joins the messages of a validation error', () => {
    const body = JSON.stringify({
      detail: [
        { loc: ['body', 'name'], msg: 'String should have at least 1 character' },
        { loc: ['body', 'amount_net'], msg: 'Input should be greater than or equal to 0' },
      ],
    })
    expect(describeError(apiError(422, 'Unprocessable Entity', body))).toBe(
      'String should have at least 1 character ; Input should be greater than or equal to 0',
    )
  })

  it('falls back to the raw body, then to the status', () => {
    expect(describeError(apiError(500, 'Internal Server Error', 'boom'))).toBe('boom')
    expect(describeError(apiError(502, 'Bad Gateway', ''))).toBe('Erreur 502')
  })

  it('names an unreachable server in French', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Le serveur ne répond pas.')
  })

  it('passes other errors through', () => {
    expect(describeError(new Error('Something else'))).toBe('Something else')
    expect(describeError(new TypeError('x is undefined'))).toBe('x is undefined')
    expect(describeError('plain')).toBe('plain')
  })
})

describe('httpStatus', () => {
  it('reads the status of an API error', () => {
    expect(httpStatus(apiError(409, 'Conflict', '{}'))).toBe(409)
  })

  it('is null for anything else', () => {
    expect(httpStatus(new TypeError('Failed to fetch'))).toBeNull()
    expect(httpStatus(null)).toBeNull()
  })
})
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run test`
Expected: FAIL — `Error: Cannot find module './format'` and `Cannot find module './errors'` (2 failed suites, no tests run).

- [ ] **Step 5: Implement `format.ts` and `errors.ts`**

`frontend/src/format.ts`:

```ts
// Every figure and date fisac shows goes through this module. Money and typed
// numbers use the design system's formatters (decimal comma, U+202F digit
// groups, true minus); dates use a French port of its three brand styles,
// since the system's formatDate is English-only. Upstream candidate: a
// `locale` option on the system's formatDate.
import { formatEur, formatNumber, parseNumber } from '@qvanderlinden/ui'
import type { FlowKind } from './api/types'

export { formatEur, formatNumber, parseNumber }

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// A date-only ISO string is a calendar date in local time; new Date('2026-09-15')
// would be UTC midnight and show as the 14th in timezones behind UTC.
function toDate(date: Date | string): Date {
  if (date instanceof Date) return date
  const m = ISO_DATE.exec(date)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date)
}

/**
 * Brand date styles, in French:
 * - `table` (default) → `04 oct.`
 * - `month` → `août 2026` (lists)
 * - `long` → `novembre 2026` (prose)
 * - `full` → `04 oct. 2026` (tables whose rows can span several years)
 */
export type DateStyle = 'table' | 'month' | 'long' | 'full'

export function formatDate(date: Date | string, style: DateStyle = 'table'): string {
  const d = toDate(date)
  const month = d.getMonth()
  const day = String(d.getDate()).padStart(2, '0')
  if (style === 'month') return `${MONTHS_SHORT[month]} ${d.getFullYear()}`
  if (style === 'long') return `${MONTHS_LONG[month]} ${d.getFullYear()}`
  if (style === 'full') return `${day} ${MONTHS_SHORT[month]} ${d.getFullYear()}`
  return `${day} ${MONTHS_SHORT[month]}`
}

/** An API decimal string (or a number) as brand money: `"-42.5"` → `−€42,50`. */
export function eur(value: string | number): string {
  return formatEur(typeof value === 'number' ? value : Number(value))
}

/** A change, always signed: `"1234"` → `+€1 234,00`, `"-42.5"` → `−€42,50`. */
export function signedEur(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  const formatted = formatEur(n)
  return n > 0 && formatted !== formatEur(0) ? `+${formatted}` : formatted
}

/** Flow amounts are unsigned magnitudes; the kind carries the sign. */
export function signedFlowAmount(kind: FlowKind, amount: string | number): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  return kind === 'expense' ? -n : n
}

/** A rate (0-100) for an editable field: `"21.00"` → `21`, `"5.50"` → `5,5`. */
export function rateInput(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  return formatNumber(n, { decimals: 2 }).replace(/,?0+$/, '')
}

/** A rate for display: `"21.00"` → `21%`. */
export function formatRate(value: string | number): string {
  return `${rateInput(value)}%`
}

/** An amount for an editable field, as it would be typed: `1 234,50`. */
export function amountInput(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  return formatNumber(n, { decimals: 2 })
}

/** A number as the API's decimal string: dot decimal, rounded to cents, no grouping. */
export function toApiDecimal(value: number): string {
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  return String(value < 0 && rounded !== 0 ? -rounded : rounded)
}

/** Typed input (comma or dot decimals, any spacing) as an API decimal string; null when unreadable. */
export function parseDecimal(text: string): string | null {
  const n = parseNumber(text)
  return Number.isFinite(n) ? toApiDecimal(n) : null
}

/** A count and its noun, French plural from 2: `countLabel(3, 'flux modifié', 'flux modifiés')` → `3 flux modifiés`. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${n > 1 ? plural : singular}`
}
```

`frontend/src/errors.ts`:

```ts
// One readable line for a failed request. api/client.ts throws
// Error(`${status} ${statusText}: ${body}`) on a non-2xx response, and FastAPI
// bodies carry a `detail` (a string, or a list of validation errors).
const API_ERROR = /^(\d{3}) [^:]*: ([\s\S]*)$/

export function httpStatus(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const m = API_ERROR.exec(err.message)
  return m ? Number(m[1]) : null
}

export function describeError(err: unknown): string {
  // fetch() rejects with a TypeError when the server can't be reached at all
  // ("Failed to fetch" in Chrome, "NetworkError…" in Firefox, "Load failed" in Safari).
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return 'Le serveur ne répond pas.'
  }
  if (!(err instanceof Error)) return String(err)
  const m = API_ERROR.exec(err.message)
  if (!m) return err.message
  const [, status, body] = m
  try {
    const detail: unknown = (JSON.parse(body) as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : ''))
        .filter((msg) => msg !== '')
      if (messages.length > 0) return messages.join(' ; ')
    }
  } catch {
    // Not JSON: fall back to the raw body below.
  }
  return body.trim() || `Erreur ${status}`
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run test`
Expected: `Test Files  2 passed (2)` and `Tests  25 passed (25)`.

- [ ] **Step 7: Switch the styles to the design system**

Create `frontend/src/index.css`:

```css
/* Tailwind entry: Tailwind, then the design system's tokens, theme, type
   roles and base styles. fisac defines no colours of its own.

   `legacy` is declared first so it is the lowest cascade layer: the
   pre-redesign styles.css can style views that are not migrated yet but can
   never beat a design-system rule. The layer statement must stay above the
   imports; without it Tailwind emits `legacy` last, i.e. on top. Removed in
   the cleanup task together with styles.css. */
@layer legacy;
@import "tailwindcss";
@import "@qvanderlinden/ui/styles.css";
@import "./styles.css" layer(legacy);
```

Replace `frontend/src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@qvanderlinden/ui/fonts.css'
import { Toaster } from '@qvanderlinden/ui'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
)
```

Delete the old shadcn bridge: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && git rm src/shadcn.css` (this stages the deletion).

In `frontend/src/styles.css` delete both dark-mode blocks (light only). Delete this block near the top (with the blank line after it):

```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface-1: #1a1a19;
    --page-plane: #121211;
    --sidebar-bg: #17110d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --series-1: #3987e5;
    --danger: #e66767;
    --border: rgba(255, 255, 255, 0.1);
    --shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
}

```

and this one near the end (with the blank line after it):

```css
@media (prefers-color-scheme: dark) {
  :root {
    --warning: #e0a42b;
  }
}

```

Check: `grep -c "prefers-color-scheme" /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend/src/styles.css` prints `0`.

- [ ] **Step 8: French document, favicon and manifest colours**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && cp node_modules/@qvanderlinden/ui/dist/assets/favicon.svg public/favicon.svg
```

Replace `frontend/index.html` with:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#B04A2A" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>fisac</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

In `frontend/vite.config.ts` replace:

```ts
        name: 'Fisac',
        short_name: 'Fisac',
        description: 'Track flows and project account balances over time',
        display: 'standalone',
        theme_color: '#2a78d6',
        background_color: '#fcfcfb',
```

with:

```ts
        name: 'fisac',
        short_name: 'fisac',
        description: 'Flux, TVA et projection de solde',
        lang: 'fr',
        display: 'standalone',
        // The one place a literal colour is unavoidable: the manifest can't
        // read CSS tokens. Terracotta --clay-600 and cream --cream-100.
        theme_color: '#B04A2A',
        background_color: '#F9F5ED',
```

- [ ] **Step 9: Build**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test`
Expected: `tsc -b` silent, then `✓ built in …` and the PWA summary; 25 tests pass.

- [ ] **Step 10: Browser walkthrough (foundation only)**

Start the dev server (see Global Constraints) and open `http://localhost:5174`.
- `evaluate_script`: `document.documentElement.lang` → `"fr"`; `document.title` → `"fisac"`; `getComputedStyle(document.body).backgroundColor` → `rgb(249, 245, 237)` (cream-100); `getComputedStyle(document.body).fontFamily` starts with `"Instrument Sans Variable"`.
- `list_network_requests`: `/favicon.svg` answers 200; the tab shows the QV mark.
- `emulate` with `colorScheme: dark`, reload: the background is still cream (light only). Reset the emulation.
- The not-yet-migrated views still load their data and their controls still respond (they look plain under the new reset — expected until their task). Switch tabs once each; `list_console_messages` shows no errors.

- [ ] **Step 11: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/package.json frontend/package-lock.json frontend/src/index.css frontend/src/main.tsx \
  frontend/src/format.ts frontend/src/format.test.ts frontend/src/errors.ts frontend/src/errors.test.ts \
  frontend/src/styles.css frontend/index.html frontend/public/favicon.svg frontend/vite.config.ts
git status --short   # src/shadcn.css shows as deleted (staged by git rm in Step 7); nothing unstaged
git commit -m "feat(frontend): load the design system styles and add French formatters"
```

---

### Task 2: Design-system compliance guard

**Files:**
- Create: `frontend/scripts/check-design.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: the files under `frontend/src`.
- Produces: `npm run check:design` (exit 1 on any violation, listing `path:line: rule: match`). Its `LEGACY` array lists the not-yet-migrated paths; Tasks 3–11 each delete their own lines from it and Task 12 deletes the array. The guard also fails on a `LEGACY` entry whose file no longer exists.

- [ ] **Step 1: Write the guard**

`frontend/scripts/check-design.mjs`:

```js
#!/usr/bin/env node
// Design-system compliance guard (Ledger redesign spec, "Verification").
// Scans frontend/src and fails on what @qvanderlinden/ui's rules forbid:
// emoji and glyph icons, raw hex colours, hand-rolled number formatting,
// imports of the old vendored primitives, the system's English-only
// formatDate, window.confirm, and Tailwind default-palette classes (which
// the design system removes, so they silently render nothing).
//
// Run with `npm run check:design`. Exits 1 on any violation.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = join(root, 'src')

// Paths (relative to frontend/) not migrated to the design system yet. Each
// migration task deletes its entries; the cleanup task deletes the list.
const LEGACY = [
  'src/App.tsx',
  'src/accountingDisplay.ts',
  'src/components/AccountForm.tsx',
  'src/components/AccountSwitcher.tsx',
  'src/components/AnnualAccountsView.tsx',
  'src/components/BalanceChart.tsx',
  'src/components/CategoriesView.tsx',
  'src/components/FlowBulkEditDialog.tsx',
  'src/components/FlowForm.tsx',
  'src/components/FlowGenerator.tsx',
  'src/components/FlowList.tsx',
  'src/components/FlowRow.tsx',
  'src/components/LedgerAccountsView.tsx',
  'src/components/LinesEditor.tsx',
  'src/components/NewFlowRow.tsx',
  'src/components/ProjectionView.tsx',
  'src/components/VatView.tsx',
  'src/components/ui',
  'src/lib/utils.ts',
  'src/styles.css',
]

const PALETTE =
  'gray|zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Checked line by line.
const LINE_RULES = [
  { name: 'emoji', test: /\p{Extended_Pictographic}/u },
  { name: 'glyph used as an icon (use a Lucide icon)', test: /[▾▸▲▼↕✓✕✎×⚙⚠]/u },
  { name: 'raw hex colour (use a brand utility or token)', test: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/ },
  { name: 'toFixed( (format through src/format.ts)', test: /\.toFixed\(/ },
  { name: 'toLocaleString( (format through src/format.ts)', test: /\.toLocale(?:Date|Time)?String\(/ },
  { name: 'import from the removed components/ui primitives', test: /from\s+['"][^'"]*components\/ui\// },
  { name: 'window.confirm (use a confirmation Dialog)', test: /\b(?:window\.)?confirm\(/ },
  {
    name: 'Tailwind default palette class (removed by the design system)',
    test: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|divide|decoration|shadow|accent|caret|placeholder|from|via|to)-(?:${PALETTE})-\\d{2,3}\\b`),
  },
]

// Checked on the whole file: import lists span several lines.
const DS_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@qvanderlinden\/ui['"]/g

function toPosix(path) {
  return path.split(sep).join('/')
}

function isLegacy(rel) {
  return LEGACY.some((entry) => rel === entry || rel.startsWith(`${entry}/`))
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

const violations = []
let checked = 0
let skipped = 0

for (const entry of LEGACY) {
  if (!existsSync(join(root, entry))) {
    violations.push(`${entry}: listed in LEGACY but no longer exists; remove the entry`)
  }
}

for (const file of walk(srcDir)) {
  const rel = toPosix(relative(root, file))
  if (isLegacy(rel)) {
    skipped += 1
    continue
  }
  checked += 1
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    for (const rule of LINE_RULES) {
      const match = line.match(rule.test)
      if (match) violations.push(`${rel}:${i + 1}: ${rule.name}: ${match[0]}`)
    }
  })
  for (const match of text.matchAll(DS_IMPORT)) {
    if (/\bformatDate\b/.test(match[1])) {
      const line = text.slice(0, match.index).split('\n').length
      violations.push(
        `${rel}:${line}: formatDate imported from @qvanderlinden/ui is English-only; use formatDate from src/format.ts`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  console.error(`\ncheck:design failed: ${violations.length} violation(s).`)
  process.exit(1)
}
console.log(`check:design passed: ${checked} file(s) checked, ${skipped} legacy file(s) skipped.`)
```

- [ ] **Step 2: Add the script**

In `frontend/package.json` replace:

```json
    "preview": "vite preview",
    "test": "vitest run"
  },
```

with:

```json
    "preview": "vite preview",
    "test": "vitest run",
    "check:design": "node scripts/check-design.mjs"
  },
```

- [ ] **Step 3: Prove the guard catches each rule**

Create a throwaway probe `frontend/src/probe/probe.tsx` (never committed):

```tsx
import { Button, formatDate } from '@qvanderlinden/ui'
import { Checkbox } from '@/components/ui/checkbox'
const a = '💰 Revenues'
const c = 'Paid ✓'
const d = '#2a78d6'
const e = (1).toFixed(2)
const g = new Date().toLocaleDateString()
if (confirm('x')) {}
const h = 'text-blue-500 bg-slate-500 text-amber-600'
```

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run check:design`
Expected: exit 1 with one line each for `components/ui`, `emoji: 💰`, `glyph used as an icon … ✓`, `raw hex colour … #2a78d6`, `toFixed(`, `toLocaleString( … .toLocaleDateString(`, `window.confirm`, `Tailwind default palette class … text-blue-500` (not `bg-slate-500` or `text-amber-600`, which are brand ramps) and `formatDate imported from @qvanderlinden/ui is English-only`, then `check:design failed: 9 violation(s).`

Then delete the probe: `rm -r /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend/src/probe`.

- [ ] **Step 4: Run the guard on the real tree**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run check:design && npm run build && npm run test`
Expected: `check:design passed: 8 file(s) checked, 25 legacy file(s) skipped.`; build and tests stay green.

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/scripts/check-design.mjs frontend/package.json
git commit -m "build(frontend): add a design-system compliance guard"
```

---

### Task 3: Shell — sidebar, top bar, account selector and account dialog

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`, `frontend/src/components/PageHeader.tsx`
- Modify (full rewrite): `frontend/src/App.tsx`, `frontend/src/components/AccountSwitcher.tsx`, `frontend/src/components/AccountForm.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `eur`, `amountInput`, `parseDecimal` (`src/format.ts`); `describeError` (`src/errors.ts`); `isFlowIncomplete` (`src/accountingDisplay.ts`); `listAccounts`, `listFlows`, `createAccount`, `updateAccount`, `deleteAccount` (`src/api/client.ts`); the legacy views with their current props (`FlowList({ account, kind })`, `ProjectionView({ account, onAccountChange })`, `CategoriesView({ accountId })`, `LedgerAccountsView({ accountId })`, `VatView({ account })`, `AnnualAccountsView({ account })`).
- Produces: `ConfirmDialog({ title: string; description: ReactNode; confirmLabel: string; onConfirm: () => Promise<void>; onClose: () => void })` — mount while open; closes itself after `onConfirm` resolves, shows the error if it rejects. `PageHeader({ title: string; actions?: ReactNode })` — every view renders one at its top. `AccountForm({ account: AccountRead | null; onClose; onSaved(account); onDeleted(accountId) })`. `AccountSwitcher({ accounts; selectedAccountId: number | null; onSelect(id); onEdit(); onCreate() })`. App keeps `localStorage['fisac.selectedAccountId']` and an `incomplete: Record<FlowKind, number>` state for the sidebar badges (Task 6 wires `FlowList` into it).

- [ ] **Step 1: Write `ConfirmDialog` and `PageHeader`**

`frontend/src/components/ConfirmDialog.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { Button, Callout, Dialog } from '@qvanderlinden/ui'
import { describeError } from '../errors'

interface ConfirmDialogProps {
  title: string
  /** What will happen, in one or two sentences. */
  description: ReactNode
  /** The destructive action, e.g. "Supprimer le flux". */
  confirmLabel: string
  /** Runs the action. Rejecting keeps the dialog open with the error shown. */
  onConfirm: () => Promise<void>
  onClose: () => void
}

// Stands in for the browser's confirm prompt: the confirm button runs the
// action, shows its error inline if it fails, and closes the dialog once it
// succeeds. Mount it only while it should be open.
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(describeError(err))
      setBusy(false)
      return
    }
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="type-body-sm text-fg-body">{description}</p>
        {error && (
          <Callout tone="negative" title="Action impossible">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  )
}
```

`frontend/src/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Sentence case, e.g. "Comptes annuels". */
  title: string
  /** The view's controls, right-aligned. At most one primary Button per view. */
  actions?: ReactNode
}

// The Ledger page header: serif title on the left, the view's actions on the right.
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="type-title text-fg-strong">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
```

- [ ] **Step 2: Rewrite the account selector and the account dialog**

`frontend/src/components/AccountSwitcher.tsx`:

```tsx
import { Plus, Settings } from 'lucide-react'
import { IconButton, Select, Tooltip } from '@qvanderlinden/ui'
import type { AccountRead } from '../api/types'
import { eur } from '../format'

interface AccountSwitcherProps {
  accounts: AccountRead[]
  selectedAccountId: number | null
  onSelect: (accountId: number) => void
  /** Opens the account dialog on the selected account. */
  onEdit: () => void
  /** Opens the account dialog on a new account. */
  onCreate: () => void
}

// The account selector at the top of the sidebar (and of the narrow top bar):
// a Select listing every account with its balance, plus edit and create.
export function AccountSwitcher({
  accounts,
  selectedAccountId,
  onSelect,
  onEdit,
  onCreate,
}: AccountSwitcherProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="type-eyebrow text-fg-subtle">compte</span>
        <div className="flex items-center gap-1">
          {selectedAccountId !== null && (
            <Tooltip label="Modifier le compte">
              <IconButton icon={Settings} label="Modifier le compte" size="sm" onClick={onEdit} />
            </Tooltip>
          )}
          <Tooltip label="Nouveau compte">
            <IconButton icon={Plus} label="Nouveau compte" size="sm" onClick={onCreate} />
          </Tooltip>
        </div>
      </div>
      {accounts.length > 0 && (
        <Select
          aria-label="Compte"
          // '' shows the placeholder; Radix Select needs a string either way.
          value={selectedAccountId === null ? '' : String(selectedAccountId)}
          onValueChange={(value) => onSelect(Number(value))}
          placeholder="Choisir un compte"
          options={accounts.map((account) => ({
            value: String(account.id),
            label: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{account.name}</span>
                <span className="numeric text-xs text-fg-muted">{eur(account.current_balance)}</span>
              </span>
            ),
          }))}
        />
      )}
    </div>
  )
}
```

`frontend/src/components/AccountForm.tsx`:

```tsx
import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Callout, Dialog, Field, Input, Switch, toast } from '@qvanderlinden/ui'
import { createAccount, deleteAccount, updateAccount } from '../api/client'
import type { AccountCreate, AccountRead } from '../api/types'
import { describeError } from '../errors'
import { amountInput, parseDecimal } from '../format'
import { ConfirmDialog } from './ConfirmDialog'

interface AccountFormProps {
  /** The account to edit; null creates a new one. */
  account: AccountRead | null
  onClose: () => void
  onSaved: (account: AccountRead) => void
  onDeleted: (accountId: number) => void
}

// A Visa day field: empty means "not set", otherwise a whole day of the month.
function parseDay(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d{1,2}$/.test(trimmed)) return 'invalid'
  const day = Number(trimmed)
  return day >= 1 && day <= 31 ? day : 'invalid'
}

// The account settings in a Dialog. Saves (create or update) and deletes
// through the API itself, then reports the result to the shell. Mount it only
// while it should be open, keyed by the account, so its drafts start fresh.
export function AccountForm({ account, onClose, onSaved, onDeleted }: AccountFormProps) {
  const formId = useId()
  const [name, setName] = useState(account?.name ?? '')
  const [balance, setBalance] = useState(amountInput(account?.current_balance ?? 0))
  const [isCompany, setIsCompany] = useState(account?.is_company ?? false)
  const [vatApplicable, setVatApplicable] = useState(account?.vat_applicable ?? false)
  const [paymentDayText, setPaymentDayText] = useState(
    account?.visa_payment_day != null ? String(account.visa_payment_day) : '',
  )
  const [closingDayText, setClosingDayText] = useState(
    account?.visa_closing_day != null ? String(account.visa_closing_day) : '',
  )
  // Field errors show only after the first submit attempt.
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const balanceValue = parseDecimal(balance)
  const paymentDay = parseDay(paymentDayText)
  const closingDay = parseDay(closingDayText)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (name.trim() === '' || balanceValue === null || paymentDay === 'invalid' || closingDay === 'invalid') {
      return
    }
    const payload: AccountCreate = {
      name: name.trim(),
      current_balance: balanceValue,
      is_company: isCompany,
      // Only a company can be VAT-registered; the backend normalizes the same way.
      vat_applicable: isCompany && vatApplicable,
      visa_payment_day: paymentDay,
      visa_closing_day: closingDay,
    }
    setSaving(true)
    setError(null)
    try {
      const saved = account ? await updateAccount(account.id, payload) : await createAccount(payload)
      toast(account ? 'Compte enregistré.' : 'Compte créé.', { tone: 'positive' })
      onSaved(saved)
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={account ? 'Modifier le compte' : 'Nouveau compte'}
        // Typed values are lost on close, so only Escape, the close button
        // and "Annuler" close it, not a stray click on the scrim.
        onInteractOutside={(e) => e.preventDefault()}
        footer={
          <>
            {account && (
              <Button
                variant="ghost"
                iconLeft={Trash2}
                className="mr-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Supprimer
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nom" error={submitted && name.trim() === '' ? 'Le nom est obligatoire.' : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field
            label="Solde actuel"
            error={submitted && balanceValue === null ? 'Montant illisible — par exemple 1 234,56.' : undefined}
          >
            <Input numeric value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
          <Switch label="Société" checked={isCompany} onCheckedChange={setIsCompany} />
          {isCompany && (
            <Switch label="Assujetti à la TVA" checked={vatApplicable} onCheckedChange={setVatApplicable} />
          )}
          <Field
            label="Jour de paiement Visa"
            hint="Jour du mois où la Visa est débitée."
            error={submitted && paymentDay === 'invalid' ? 'Un jour entre 1 et 31, ou vide.' : undefined}
          >
            <Input
              numeric
              inputMode="numeric"
              value={paymentDayText}
              onChange={(e) => setPaymentDayText(e.target.value)}
            />
          </Field>
          <Field
            label="Jour de clôture Visa"
            hint="Une facture datée après ce jour passe sur le relevé suivant ; vide, elle est payée au jour de paiement."
            error={submitted && closingDay === 'invalid' ? 'Un jour entre 1 et 31, ou vide.' : undefined}
          >
            <Input
              numeric
              inputMode="numeric"
              value={closingDayText}
              onChange={(e) => setClosingDayText(e.target.value)}
            />
          </Field>
          {error && (
            <Callout tone="negative" title="Le compte n’a pas été enregistré.">
              {error}
            </Callout>
          )}
        </form>
      </Dialog>

      {confirmingDelete && account && (
        <ConfirmDialog
          title="Supprimer ce compte ?"
          description={`« ${account.name} » et tous ses flux, catégories et comptes du plan comptable seront supprimés définitivement.`}
          confirmLabel="Supprimer le compte"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await deleteAccount(account.id)
            toast('Compte supprimé.', { tone: 'positive' })
            onDeleted(account.id)
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Rewrite the shell**

`frontend/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  BookOpen,
  ChartLine,
  Library,
  Percent,
  Plus,
  Receipt,
  Tags,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  Breadcrumbs,
  Button,
  Callout,
  EmptyState,
  Logo,
  Select,
  SidebarNav,
  type SidebarItem,
} from '@qvanderlinden/ui'
import { listAccounts, listFlows } from './api/client'
import type { AccountRead, FlowKind, FlowRead } from './api/types'
import { isFlowIncomplete } from './accountingDisplay'
import { describeError } from './errors'
import { AccountForm } from './components/AccountForm'
import { AccountSwitcher } from './components/AccountSwitcher'
import { AnnualAccountsView } from './components/AnnualAccountsView'
import { CategoriesView } from './components/CategoriesView'
import { FlowList } from './components/FlowList'
import { LedgerAccountsView } from './components/LedgerAccountsView'
import { ProjectionView } from './components/ProjectionView'
import { VatView } from './components/VatView'

type Tab = 'revenues' | 'expenses' | 'projection' | 'categories' | 'ledger' | 'vat' | 'annual'

// Navigation, in sidebar order. Labels are lowercase (brand rule for nav).
const NAV: { group: string; tabs: { value: Tab; label: string; icon: LucideIcon }[] }[] = [
  {
    group: 'flux',
    tabs: [
      { value: 'revenues', label: 'revenus', icon: TrendingUp },
      { value: 'expenses', label: 'dépenses', icon: Receipt },
      { value: 'projection', label: 'projection', icon: ChartLine },
    ],
  },
  {
    group: 'comptabilité',
    tabs: [
      { value: 'categories', label: 'catégories', icon: Tags },
      { value: 'ledger', label: 'plan comptable', icon: BookOpen },
      { value: 'vat', label: 'tva', icon: Percent },
      { value: 'annual', label: 'comptes annuels', icon: Library },
    ],
  },
]
const TAB_LABELS = Object.fromEntries(NAV.flatMap((g) => g.tabs.map((t) => [t.value, t.label]))) as Record<
  Tab,
  string
>

const SELECTED_ACCOUNT_KEY = 'fisac.selectedAccountId'

type AccountDialogState = { account: AccountRead | null } | null

function countIncomplete(flows: FlowRead[]): Record<FlowKind, number> {
  return {
    revenue: flows.filter((f) => f.kind === 'revenue' && isFlowIncomplete(f)).length,
    expense: flows.filter((f) => f.kind === 'expense' && isFlowIncomplete(f)).length,
  }
}

export default function App() {
  const [accounts, setAccounts] = useState<AccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(() => {
    const stored = localStorage.getItem(SELECTED_ACCOUNT_KEY)
    return stored ? Number(stored) : null
  })
  const [tab, setTab] = useState<Tab>('projection')
  const [accountDialog, setAccountDialog] = useState<AccountDialogState>(null)
  // Sidebar counters: incomplete flows per kind, hidden at 0.
  const [incomplete, setIncomplete] = useState<Record<FlowKind, number>>({ revenue: 0, expense: 0 })

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null

  useEffect(() => {
    listAccounts()
      .then((fetched) => {
        setAccounts(fetched)
        setSelectedAccountId((current) =>
          current !== null && fetched.some((a) => a.id === current) ? current : (fetched[0]?.id ?? null),
        )
      })
      .catch((err) => setLoadError(describeError(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedAccountId !== null) {
      localStorage.setItem(SELECTED_ACCOUNT_KEY, String(selectedAccountId))
    }
  }, [selectedAccountId])

  // Recounted on every account or page change, so edits made elsewhere (e.g.
  // a category set from the projection's flow dialog) show up on the badges.
  useEffect(() => {
    if (selectedAccountId === null) return
    let cancelled = false
    listFlows(selectedAccountId)
      .then((flows) => {
        if (!cancelled) setIncomplete(countIncomplete(flows))
      })
      // The counters are a hint; a failed count keeps the previous badges and
      // the views report their own load errors.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedAccountId, tab])

  function replaceAccount(updated: AccountRead) {
    setAccounts((current) => current.map((a) => (a.id === updated.id ? updated : a)))
  }

  function handleAccountSaved(saved: AccountRead) {
    if (accounts.some((a) => a.id === saved.id)) {
      replaceAccount(saved)
    } else {
      setAccounts((current) => [...current, saved])
      setSelectedAccountId(saved.id)
    }
    setAccountDialog(null)
  }

  function handleAccountDeleted(deletedId: number) {
    const remaining = accounts.filter((a) => a.id !== deletedId)
    setAccounts(remaining)
    if (selectedAccountId === deletedId) setSelectedAccountId(remaining[0]?.id ?? null)
    setAccountDialog(null)
  }

  const navItems: SidebarItem[] = selectedAccount
    ? NAV.flatMap((g) => [
        { group: g.group },
        ...g.tabs.map((t) => {
          const count = t.value === 'revenues' ? incomplete.revenue : t.value === 'expenses' ? incomplete.expense : 0
          return { value: t.value, label: t.label, icon: t.icon, badge: count > 0 ? count : undefined }
        }),
      ])
    : []

  const switcher = (
    <AccountSwitcher
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      onSelect={setSelectedAccountId}
      onEdit={() => selectedAccount && setAccountDialog({ account: selectedAccount })}
      onCreate={() => setAccountDialog({ account: null })}
    />
  )

  const crumbs = [
    { label: 'fisac' },
    ...(selectedAccount ? [{ label: selectedAccount.name.toLowerCase() }, { label: TAB_LABELS[tab] }] : []),
  ]

  return (
    <div className="min-h-screen bg-surface-page min-[760px]:flex">
      <aside className="sticky top-0 hidden h-screen shrink-0 min-[760px]:block">
        <SidebarNav
          tone="cream"
          className="overflow-y-auto"
          header={
            <div className="flex flex-col gap-6">
              {/* The horizontal lockup is wider than the sidebar even at the
                  minimum cell size, so the sidebar carries the vertical one. */}
              <Logo variant="vertical" cell={5} />
              {switcher}
            </div>
          }
          items={navItems}
          value={tab}
          onChange={(value) => setTab(value as Tab)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="z-10 border-b border-line-hairline bg-surface-page min-[760px]:sticky min-[760px]:top-0">
          {/* Below 760px the sidebar folds into this bar. */}
          <div className="flex flex-col gap-3 border-b border-line-hairline bg-surface-card px-4 py-3 min-[760px]:hidden">
            {switcher}
            {selectedAccount && (
              <Select
                aria-label="Page"
                value={tab}
                onValueChange={(value) => setTab(value as Tab)}
                options={NAV.flatMap((g) => g.tabs.map((t) => ({ value: t.value, label: t.label })))}
              />
            )}
          </div>
          <div className="px-4 py-3 min-[760px]:px-8">
            <Breadcrumbs items={crumbs} />
          </div>
        </div>

        <main className="min-w-0 flex-1 p-4 min-[760px]:p-8">
          {loading && <p className="type-body-sm text-fg-muted">Chargement…</p>}
          {!loading && loadError && (
            <Callout tone="negative" title="Les comptes n’ont pas pu être chargés.">
              {loadError} Vérifiez que l’API tourne, puis rechargez la page.
            </Callout>
          )}
          {!loading && !loadError && selectedAccount === null && (
            <EmptyState
              icon={Wallet}
              title="Aucun compte."
              action={
                <Button iconLeft={Plus} onClick={() => setAccountDialog({ account: null })}>
                  Créer un compte
                </Button>
              }
            />
          )}
          {!loading && selectedAccount !== null && tab === 'revenues' && (
            <FlowList account={selectedAccount} kind="revenue" />
          )}
          {!loading && selectedAccount !== null && tab === 'expenses' && (
            <FlowList account={selectedAccount} kind="expense" />
          )}
          {!loading && selectedAccount !== null && tab === 'projection' && (
            <ProjectionView account={selectedAccount} onAccountChange={replaceAccount} />
          )}
          {!loading && selectedAccount !== null && tab === 'categories' && (
            <CategoriesView accountId={selectedAccount.id} />
          )}
          {!loading && selectedAccount !== null && tab === 'ledger' && (
            <LedgerAccountsView accountId={selectedAccount.id} />
          )}
          {!loading && selectedAccount !== null && tab === 'vat' && <VatView account={selectedAccount} />}
          {!loading && selectedAccount !== null && tab === 'annual' && (
            <AnnualAccountsView account={selectedAccount} />
          )}
        </main>
      </div>

      {accountDialog && (
        <AccountForm
          key={accountDialog.account?.id ?? 'new'}
          account={accountDialog.account}
          onClose={() => setAccountDialog(null)}
          onSaved={handleAccountSaved}
          onDeleted={handleAccountDeleted}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete these three lines from `LEGACY`:

```js
  'src/App.tsx',
  'src/components/AccountForm.tsx',
  'src/components/AccountSwitcher.tsx',
```

- [ ] **Step 5: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 13 file(s) checked, 22 legacy file(s) skipped.`

- [ ] **Step 6: Browser walkthrough**

- Sidebar (wide window, 1280×800): cream surface with a hairline right edge, the vertical QV lockup, a `compte` eyebrow with Settings and Plus icon buttons (tooltips "Modifier le compte" / "Nouveau compte" on hover), then the account `Select`; its list shows every account with its balance in mono (`€1 234,56`, true minus `−€…` for negatives).
- Groups `flux` (revenus, dépenses, projection) and `comptabilité` (catégories, plan comptable, tva, comptes annuels), each with its Lucide icon; the active item has the terracotta inset bar. On a real account with incomplete flows, revenus/dépenses show a mono count; an account with none shows no badge.
- Top bar: `fisac / ‹compte› / projection` in lowercase; changing page updates the last crumb; the bar stays put while the page scrolls.
- Create **Essai redesign** with the Plus button: dialog "Nouveau compte"; submit with an empty name → "Le nom est obligatoire."; Visa payment day `32` → "Un jour entre 1 et 31, ou vide." (then clear the field); switch "Société" on → "Assujetti à la TVA" appears; turn both on.
- **Review Focus 1:** set "Solde actuel" to `-1 234,5` and save → toast "Compte créé." bottom-right, the account is selected and the `Select` shows `−€1 234,50`; reopen with Settings → the field reads `−1 234,50`; type `12,5x` → "Montant illisible — par exemple 1 234,56." on save and no PATCH in `list_network_requests`; put back `1 000` and save → toast "Compte enregistré.".
- Create **Essai vide** (all defaults). Reload: the last selected account is still selected (`localStorage['fisac.selectedAccountId']`).
- **Review Focus 3:** open Settings, type in "Nom", click the scrim → the dialog stays open with the text; press Escape → it closes and the account keeps its old name.
- Delete: create a third account "Essai suppression", open Settings → "Supprimer" → "Supprimer ce compte ?" with the cascade sentence; "Annuler" returns to the form; "Supprimer le compte" → toast "Compte supprimé.", the selection moves to the first account.
- **Review Focus 5:** rename Essai vide to a 60-character name: the sidebar keeps its width and the `Select` truncates; `resize_page` to 375×800 → the sidebar is gone and a top bar holds the account selector and a "Page" `Select`; changing page with it works; `evaluate_script`: `document.documentElement.scrollWidth <= window.innerWidth` → `true`. Rename it back to "Essai vide" and restore 1280×800.
- The no-account state (EmptyState "Aucun compte." with "Créer un compte") needs zero accounts; check it by reading `App.tsx` rather than deleting real accounts.
- `list_console_messages`: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/App.tsx frontend/src/components/AccountSwitcher.tsx frontend/src/components/AccountForm.tsx \
  frontend/src/components/ConfirmDialog.tsx frontend/src/components/PageHeader.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the shell and account dialog on the design system"
```

---

### Task 4: Line editor and flow form dialog

**Files:**
- Modify (full rewrite): `frontend/src/components/LinesEditor.tsx`, `frontend/src/components/FlowForm.tsx`
- Modify: `frontend/src/components/ProjectionView.tsx`, `frontend/src/components/FlowGenerator.tsx` (unwrap the old modal around `FlowForm`), `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 3); `amountInput`, `eur`, `parseDecimal`, `parseNumber`, `rateInput`, `formatDate`, `formatRate` (Task 1); `describeError`; `PAYMENT_METHOD_LABELS`, `addDaysFrom`, `todayDateInputValue`, `visaPaymentDate` from `src/accountingDisplay.ts`.
- Produces (`LinesEditor.tsx`, same names as before, French-input aware): `interface LineDraft { description; amount_net; amount_gross; basis: 'net' | 'gross'; vat_rate; ledger_account_id }` (amounts and rate hold typed text); `emptyLine(): LineDraft`; `netToGross(net: string, vatRate: string): string`; `grossToNet(gross: string, vatRate: string): string`; `linesTotals(lines: { amount_net: string; vat_rate?: string | null }[]): { net: number; vat: number; gross: number }`; **new** `linesValid(lines: LineDraft[]): boolean`; `linesToDrafts(lines: FlowLineRead[]): LineDraft[]`; `linesToPayload(lines: LineDraft[]): FlowLineCreate[]`; `LinesEditor({ lines, onChange, ledgerAccounts })`.
- Produces (`FlowForm.tsx`): `PAYMENT_METHODS: PaymentMethod[]` (still exported from here); `FlowForm` with unchanged props `{ kind; account; categories; ledgerAccounts; initialFlow?; onSubmit(payload): Promise<void>; onCancel(); onDelete?; onDeleteBatch?; batchCount? }` — it now renders its own `Dialog` (mount while open), confirms deletes itself, and keeps `reverse_charge` on save.

- [ ] **Step 1: Rewrite the line editor**

`frontend/src/components/LinesEditor.tsx`:

```tsx
import { useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, IconButton, Input, Select } from '@qvanderlinden/ui'
import type { FlowLineCreate, FlowLineRead, LedgerAccountRead } from '../api/types'
import { amountInput, eur, parseDecimal, parseNumber, rateInput } from '../format'

export interface LineDraft {
  description: string
  // Amounts and rate hold the text as typed: comma or dot decimals, read with
  // parseNumber. Whichever of net and gross was typed last is the "basis" and
  // stays fixed; the other re-derives from it (and from the rate when the rate
  // changes). Only net is ever sent to the backend.
  amount_net: string
  amount_gross: string
  basis: 'net' | 'gross'
  vat_rate: string
  // '' means unbooked. Converted to null on submit.
  ledger_account_id: string
}

// Radix Select values can't be empty strings; this stands for "no ledger account".
const UNBOOKED = 'none'

export function emptyLine(): LineDraft {
  return { description: '', amount_net: '', amount_gross: '', basis: 'net', vat_rate: '21', ledger_account_id: '' }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function readNumber(text: string): number | null {
  const n = parseNumber(text)
  return Number.isFinite(n) ? n : null
}

// Mirrors the backend's gross computation: net + per-line-rounded VAT.
export function netToGross(net: string, vatRate: string): string {
  const amount = readNumber(net)
  if (amount === null) return ''
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount + round2((amount * rate) / 100)))
}

export function grossToNet(gross: string, vatRate: string): string {
  const amount = readNumber(gross)
  if (amount === null) return ''
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount / (1 + rate / 100)))
}

// Client-side preview of the totals the backend computes from the lines (net
// + per-line-rounded VAT = gross). Accepts drafts and API lines alike.
export function linesTotals(lines: { amount_net: string; vat_rate?: string | null }[]): {
  net: number
  vat: number
  gross: number
} {
  let net = 0
  let vat = 0
  for (const line of lines) {
    const amount = readNumber(line.amount_net)
    if (amount === null) continue
    const rate = readNumber(line.vat_rate ?? '0') ?? 0
    net += amount
    vat += round2((amount * rate) / 100)
  }
  return { net: round2(net), vat: round2(vat), gross: round2(net + vat) }
}

// Blank is fine (the line is dropped, or the rate is 0); anything else must be
// a readable number in range, or saving would silently drop or reject it.
function amountProblem(text: string): boolean {
  if (text.trim() === '') return false
  const n = readNumber(text)
  return n === null || n < 0
}

function rateProblem(text: string): boolean {
  if (text.trim() === '') return false
  const n = readNumber(text)
  return n === null || n < 0 || n > 100
}

/** False while any line holds an unreadable or out-of-range amount or rate. */
export function linesValid(lines: LineDraft[]): boolean {
  return lines.every(
    (l) => !amountProblem(l.amount_net) && !amountProblem(l.amount_gross) && !rateProblem(l.vat_rate),
  )
}

// Seeds editable drafts from a flow's persisted lines. An empty flow starts
// with one blank line so the editor is never empty. net is authoritative; gross
// is derived for display and editing (see LineDraft).
export function linesToDrafts(lines: FlowLineRead[]): LineDraft[] {
  if (lines.length === 0) return [emptyLine()]
  return lines.map((l) => ({
    description: l.description ?? '',
    amount_net: amountInput(l.amount_net),
    amount_gross: netToGross(l.amount_net, l.vat_rate),
    basis: 'net' as const,
    vat_rate: rateInput(l.vat_rate),
    ledger_account_id: l.ledger_account_id === null ? '' : String(l.ledger_account_id),
  }))
}

// The normalization applied on submit: lines with no amount are dropped, a
// blank rate means 0, typed numbers become API decimal strings. Check
// linesValid first: an unreadable amount is dropped here like a blank one.
export function linesToPayload(lines: LineDraft[]): FlowLineCreate[] {
  return lines.flatMap((l) => {
    const net = parseDecimal(l.amount_net)
    if (net === null) return []
    return [
      {
        description: l.description.trim() || null,
        amount_net: net,
        vat_rate: parseDecimal(l.vat_rate) ?? '0',
        ledger_account_id: l.ledger_account_id === '' ? null : Number(l.ledger_account_id),
      },
    ]
  })
}

interface LinesEditorProps {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  // The account's chart of accounts, for booking each line.
  ledgerAccounts: LedgerAccountRead[]
}

const GRID =
  'grid grid-cols-[minmax(8rem,1fr)_7rem_5.5rem_7rem_minmax(9rem,1fr)_auto] items-center gap-2'

export function LinesEditor({ lines, onChange, ledgerAccounts }: LinesEditorProps) {
  const totals = useMemo(() => linesTotals(lines), [lines])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const ledgerOptions = [
    { value: UNBOOKED, label: 'Non imputée' },
    ...ledgerAccounts.map((la) => ({ value: String(la.id), label: `${la.code} — ${la.name}` })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-[40rem] flex-col gap-2">
          <div className={`${GRID} type-eyebrow text-fg-subtle`}>
            <span>description</span>
            <span className="text-right">net</span>
            <span className="text-right">tva</span>
            <span className="text-right">brut</span>
            <span>compte</span>
            <span className="w-7" />
          </div>
          {lines.map((line, i) => (
            <div className={GRID} key={i}>
              <Input
                size="sm"
                aria-label="Description"
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <Input
                size="sm"
                numeric
                aria-label="Montant net"
                placeholder="0,00"
                invalid={amountProblem(line.amount_net)}
                value={line.amount_net}
                onChange={(e) =>
                  updateLine(i, {
                    amount_net: e.target.value,
                    amount_gross: netToGross(e.target.value, line.vat_rate),
                    basis: 'net',
                  })
                }
              />
              <Input
                size="sm"
                numeric
                suffix="%"
                aria-label="Taux de TVA"
                invalid={rateProblem(line.vat_rate)}
                value={line.vat_rate}
                onChange={(e) =>
                  updateLine(
                    i,
                    line.basis === 'gross'
                      ? { vat_rate: e.target.value, amount_net: grossToNet(line.amount_gross, e.target.value) }
                      : { vat_rate: e.target.value, amount_gross: netToGross(line.amount_net, e.target.value) },
                  )
                }
              />
              <Input
                size="sm"
                numeric
                aria-label="Montant brut"
                placeholder="0,00"
                invalid={amountProblem(line.amount_gross)}
                value={line.amount_gross}
                onChange={(e) =>
                  updateLine(i, {
                    amount_gross: e.target.value,
                    amount_net: grossToNet(e.target.value, line.vat_rate),
                    basis: 'gross',
                  })
                }
              />
              <Select
                size="sm"
                aria-label="Compte du plan comptable"
                value={line.ledger_account_id === '' ? UNBOOKED : line.ledger_account_id}
                onValueChange={(value) => updateLine(i, { ledger_account_id: value === UNBOOKED ? '' : value })}
                options={ledgerOptions}
              />
              <IconButton
                icon={X}
                size="sm"
                label="Retirer la ligne"
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                disabled={lines.length === 1}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" iconLeft={Plus} onClick={() => onChange([...lines, emptyLine()])}>
          Ajouter une ligne
        </Button>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">net</dt>
            <dd className="numeric text-sm text-fg-body">{eur(totals.net)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">tva</dt>
            <dd className="numeric text-sm text-fg-body">{eur(totals.vat)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">brut</dt>
            <dd className="numeric text-sm font-medium text-fg-strong">{eur(totals.gross)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the flow form as a Dialog**

`frontend/src/components/FlowForm.tsx`:

```tsx
import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Callout, Checkbox, Dialog, Field, Input, Select } from '@qvanderlinden/ui'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
  PaymentMethod,
} from '../api/types'
import { PAYMENT_METHOD_LABELS, addDaysFrom, todayDateInputValue, visaPaymentDate } from '../accountingDisplay'
import { describeError } from '../errors'
import { formatDate, formatRate } from '../format'
import { ConfirmDialog } from './ConfirmDialog'
import { LinesEditor, linesToDrafts, linesToPayload, linesValid, type LineDraft } from './LinesEditor'

interface FlowFormProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  initialFlow?: FlowRead
  // Rejects to keep the dialog open with the error shown.
  onSubmit: (payload: FlowCreate) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
  // Offered when the flow belongs to a /bulk-created batch: deletes every flow
  // sharing its batch_id, not just this occurrence.
  onDeleteBatch?: () => Promise<void>
  // Number of flows in the batch, when the caller knows it (shown on the button).
  batchCount?: number
}

export const PAYMENT_METHODS: PaymentMethod[] = ['direct_debit', 'bank_transfer', 'visa']

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

type Confirming = 'delete' | 'batch' | null

// The full flow editor in a Dialog: header fields, lines and paid state. Used
// from the projection and the generator's review step. Mount it only while it
// should be open.
export function FlowForm({
  kind,
  account,
  categories,
  ledgerAccounts,
  initialFlow,
  onSubmit,
  onCancel,
  onDelete,
  onDeleteBatch,
  batchCount,
}: FlowFormProps) {
  const formId = useId()
  const [name, setName] = useState(initialFlow?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    initialFlow?.category_id != null ? String(initialFlow.category_id) : NONE,
  )
  const [invoiceDate, setInvoiceDate] = useState(initialFlow?.invoice_date ?? todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState<string>(initialFlow?.payment_method ?? NONE)
  const [paymentDate, setPaymentDate] = useState(initialFlow?.payment_date ?? '')
  const [paid, setPaid] = useState(initialFlow?.paid ?? false)
  const [lines, setLines] = useState<LineDraft[]>(() => linesToDrafts(initialFlow?.lines ?? []))
  const [offsetDays, setOffsetDays] = useState('30')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)

  const noPayment = paymentMethod === NONE
  const isVisa = paymentMethod === 'visa'
  const nameMissing = name.trim() === ''
  const dateMissing = invoiceDate === ''
  const linesOk = linesValid(lines)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (nameMissing || dateMissing || !linesOk) return
    const payload: FlowCreate = {
      name: name.trim(),
      kind,
      category_id: categoryId === NONE ? null : Number(categoryId),
      invoice_date: invoiceDate,
      payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
      // Visa flows never store a payment date; the projection derives it.
      payment_date: noPayment || isVisa ? null : paymentDate || null,
      paid,
      // PATCH replaces the whole flow: carry reverse charge through untouched.
      reverse_charge: initialFlow?.reverse_charge ?? false,
      lines: linesToPayload(lines),
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  const title = initialFlow
    ? kind === 'revenue'
      ? 'Modifier le revenu'
      : 'Modifier la dépense'
    : kind === 'revenue'
      ? 'Nouveau revenu'
      : 'Nouvelle dépense'

  const categoryOptions = [
    { value: NONE, label: 'Aucune catégorie' },
    ...categories.map((c) => ({
      value: String(c.id),
      label: `${c.name} (${formatRate(c.tax_deduction_rate)} déductible)`,
    })),
  ]
  const methodOptions = [
    { value: NONE, label: 'Sans paiement (compte courant associés)' },
    ...PAYMENT_METHODS.map((m) => ({
      value: m,
      label:
        m === 'visa' && account.visa_payment_day == null
          ? `${PAYMENT_METHOD_LABELS[m]} (jour Visa du compte à définir)`
          : PAYMENT_METHOD_LABELS[m],
      disabled: m === 'visa' && account.visa_payment_day == null,
    })),
  ]

  return (
    <>
      <Dialog
        open
        size="lg"
        onClose={onCancel}
        title={title}
        // Typed values are lost on close, so a stray click on the scrim
        // doesn't close it; Escape, the close button and "Annuler" do.
        onInteractOutside={(e) => e.preventDefault()}
        footer={
          <>
            {onDelete && (
              <Button
                variant="ghost"
                iconLeft={Trash2}
                onClick={() => setConfirming('delete')}
                disabled={saving}
              >
                Supprimer
              </Button>
            )}
            {onDeleteBatch && (
              <Button variant="ghost" onClick={() => setConfirming('batch')} disabled={saving}>
                {batchCount != null ? `Supprimer la série (${batchCount})` : 'Supprimer la série'}
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nom" error={submitted && nameMissing ? 'Le nom est obligatoire.' : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Catégorie">
              <Select value={categoryId} onValueChange={setCategoryId} options={categoryOptions} />
            </Field>
            <Field
              label="Date de facture"
              hint="Date fiscale."
              error={submitted && dateMissing ? 'La date de facture est obligatoire.' : undefined}
            >
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Moyen de paiement">
              <Select value={paymentMethod} onValueChange={setPaymentMethod} options={methodOptions} />
            </Field>
            {!noPayment && !isVisa && (
              <Field label="Date de paiement" hint="Date du mouvement de trésorerie.">
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </Field>
            )}
          </div>

          {isVisa && (
            <p className="type-body-sm text-fg-muted">
              {account.visa_payment_day != null && invoiceDate !== ''
                ? `Payée le ${formatDate(
                    visaPaymentDate(invoiceDate, account.visa_payment_day, account.visa_closing_day),
                    'full',
                  )}, selon le cycle Visa du compte.`
                : 'Définissez d’abord le jour de paiement Visa du compte.'}
            </p>
          )}

          {!noPayment && !isVisa && (
            <div className="flex flex-wrap items-center gap-2 type-body-sm text-fg-muted">
              <span>Date de facture +</span>
              <Input
                size="sm"
                numeric
                inputMode="numeric"
                aria-label="Délai de paiement en jours"
                className="w-16"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.value)}
              />
              <span>jours</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={invoiceDate === ''}
                onClick={() => setPaymentDate(addDaysFrom(invoiceDate, Number.parseInt(offsetDays, 10) || 0))}
              >
                Appliquer
              </Button>
            </div>
          )}

          <LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
          {submitted && !linesOk && (
            <p className="type-body-sm text-negative-fg">
              Un montant ou un taux est illisible — corrigez les cases en rouge.
            </p>
          )}

          <Checkbox label="Payé" checked={paid} onCheckedChange={(v) => setPaid(v === true)} />

          {error && (
            <Callout tone="negative" title="Le flux n’a pas été enregistré.">
              {error}
            </Callout>
          )}
        </form>
      </Dialog>

      {confirming === 'delete' && onDelete && (
        <ConfirmDialog
          title="Supprimer ce flux ?"
          description={`« ${name.trim() || initialFlow?.name || 'Ce flux'} » sera supprimé définitivement.`}
          confirmLabel="Supprimer le flux"
          onClose={() => setConfirming(null)}
          onConfirm={onDelete}
        />
      )}
      {confirming === 'batch' && onDeleteBatch && (
        <ConfirmDialog
          title="Supprimer toute la série ?"
          description="Tous les flux créés ensemble par le générateur seront supprimés définitivement."
          confirmLabel="Supprimer la série"
          onClose={() => setConfirming(null)}
          onConfirm={onDeleteBatch}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Unwrap the old modal in the two callers**

`FlowForm` now brings its own `Dialog`. In `frontend/src/components/ProjectionView.tsx` (rewritten in Task 5) replace:

```tsx
      {editingFlow && (
        <div className="modal-backdrop" onClick={() => setEditingFlow(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <FlowForm
              kind={editingFlow.kind}
              account={account}
              categories={categories}
              ledgerAccounts={ledgerAccounts}
              initialFlow={editingFlow}
              onCancel={() => setEditingFlow(null)}
              onSubmit={async (payload) => {
                await updateFlow(account.id, editingFlow.id, payload)
                setEditingFlow(null)
                await refresh()
              }}
              onDelete={async () => {
                await deleteFlow(account.id, editingFlow.id)
                setEditingFlow(null)
                await refresh()
              }}
              onDeleteBatch={
                editingFlow.batch_id != null
                  ? async () => {
                      if (!confirm('Delete every flow created in this batch?')) return
                      await deleteFlowBatch(account.id, editingFlow.batch_id!)
                      setEditingFlow(null)
                      await refresh()
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
```

with:

```tsx
      {editingFlow && (
        <FlowForm
          kind={editingFlow.kind}
          account={account}
          categories={categories}
          ledgerAccounts={ledgerAccounts}
          initialFlow={editingFlow}
          onCancel={() => setEditingFlow(null)}
          onSubmit={async (payload) => {
            await updateFlow(account.id, editingFlow.id, payload)
            setEditingFlow(null)
            await refresh()
          }}
          onDelete={async () => {
            await deleteFlow(account.id, editingFlow.id)
            setEditingFlow(null)
            await refresh()
          }}
          onDeleteBatch={
            editingFlow.batch_id != null
              ? async () => {
                  await deleteFlowBatch(account.id, editingFlow.batch_id!)
                  setEditingFlow(null)
                  await refresh()
                }
              : undefined
          }
        />
      )}
```

In `frontend/src/components/FlowGenerator.tsx` (rewritten in Task 7) replace:

```tsx
        {editingIndex !== null && proposals[editingIndex] && (
          <div className="modal-backdrop" onClick={() => setEditingIndex(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <FlowForm
                kind={proposals[editingIndex].kind}
                account={account}
                categories={categories}
                ledgerAccounts={ledgerAccounts}
                initialFlow={proposalToFlowRead(proposals[editingIndex], account.id)}
                onCancel={() => setEditingIndex(null)}
                // Writes back into the local proposals array - nothing touches
                // the API until the final bulk insert.
                onSubmit={async (payload) => {
                  setProposals((prev) => prev.map((p, j) => (j === editingIndex ? payload : p)))
                  setEditingIndex(null)
                }}
              />
            </div>
          </div>
        )}
```

with:

```tsx
        {editingIndex !== null && proposals[editingIndex] && (
          <FlowForm
            kind={proposals[editingIndex].kind}
            account={account}
            categories={categories}
            ledgerAccounts={ledgerAccounts}
            initialFlow={proposalToFlowRead(proposals[editingIndex], account.id)}
            onCancel={() => setEditingIndex(null)}
            // Writes back into the local proposals array - nothing touches
            // the API until the final bulk insert.
            onSubmit={async (payload) => {
              setProposals((prev) => prev.map((p, j) => (j === editingIndex ? payload : p)))
              setEditingIndex(null)
            }}
          />
        )}
```

- [ ] **Step 4: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/FlowForm.tsx',
  'src/components/LinesEditor.tsx',
```

- [ ] **Step 5: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 15 file(s) checked, 20 legacy file(s) skipped.`

- [ ] **Step 6: Browser walkthrough** (in **Essai redesign**; the projection and flows pages are still the old ones)

- Prepare: on the old dépenses page add a flow "Fournitures bureau" with today's date, payment "Virement" (the old quick-add row still works). Set the account's Visa payment day to `5` in its settings.
- Projection (old page) → "Edit" on that flow → the new dialog "Modifier la dépense" (large), fields Nom, Catégorie ("Aucune catégorie" plus each category with "(X% déductible)"), Date de facture (hint "Date fiscale."), Moyen de paiement, Date de paiement, the "Date de facture + 30 jours / Appliquer" row (Appliquer fills the payment date 30 days on), the lines, "Payé".
- **Review Focus 1:** in the first line type net `12,5` with TVA `21` → brut reads `15,13`; type brut `121` → net `100,00`; the totals under the lines read `net €100,00`, `tva €21,00`, `brut €121,00`; add a line with "Ajouter une ligne", type net `12,5x` → red border, "Enregistrer" shows "Un montant ou un taux est illisible — corrigez les cases en rouge." and `list_network_requests` shows no PATCH; remove that line (X) and save → the dialog closes; reopen → the line shows `100,00` / `21` / `121,00`.
- Moyen "Visa" → the payment-date field is replaced by "Payée le … selon le cycle Visa du compte." (with a `full` date); on **Essai vide** (no Visa day) the Visa option is disabled and labelled "(jour Visa du compte à définir)".
- Autoliquidation is kept: on the old dépenses page tick the flow's RC checkbox (the account is VAT-registered), edit the flow from the projection, change only the name, save; `evaluate_script` `fetch('/api/accounts/<id>/flows/<flowId>').then(r => r.json()).then(f => f.reverse_charge)` → `true`.
- **Review Focus 3:** type in "Nom", click the scrim → still open with the text; "Supprimer" → nested "Supprimer ce flux ?"; Escape closes only the confirmation; Escape again closes the form.
- `list_console_messages`: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/LinesEditor.tsx frontend/src/components/FlowForm.tsx \
  frontend/src/components/ProjectionView.tsx frontend/src/components/FlowGenerator.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): move the flow form and line editor to the design system"
```

---

### Task 5: Projection

**Files:**
- Modify (full rewrite): `frontend/src/components/BalanceChart.tsx`, `frontend/src/components/ProjectionView.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `FlowForm` (Task 4); `PageHeader` (Task 3); `amountInput`, `eur`, `formatDate`, `formatNumber`, `parseDecimal`, `signedFlowAmount` (Task 1); `describeError`; `PAYMENT_METHOD_ICONS`, `addMonthsFrom`, `paymentMethodLabel`, `todayDateInputValue` (`src/accountingDisplay.ts`); `fetchProjection`, `getFlow`, `setFlowPaid`, `updateFlow`, `deleteFlow`, `deleteFlowBatch`, `updateAccount`, `listCategories`, `listLedgerAccounts`.
- Produces: `BalanceChart({ asOf: string; startingBalance: number; points: BalancePoint[]; nextFlowDate: string | null; windowMonths: number; onHoverPointChange?: (index: number | null) => void; children?: ReactNode })` — the window selector moved to the page header, so `windowOptions` / `selectedWindowMonths` / `onWindowChange` are gone; `ProjectionView({ account, onAccountChange })` (props unchanged).

- [ ] **Step 1: Restyle the chart**

`frontend/src/components/BalanceChart.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import { Button, Card, DataTable, type DataTableColumn } from '@qvanderlinden/ui'
import { addMonthsFrom } from '../accountingDisplay'
import { eur, formatDate, formatNumber } from '../format'

export interface BalancePoint {
  date: string
  balance: number
}

interface BalanceChartProps {
  asOf: string
  startingBalance: number
  points: BalancePoint[]
  // Payment date of the account's next flow past `points`, if any - null
  // means nothing is scheduled beyond the plotted window at all.
  nextFlowDate: string | null
  // The plotted horizon, from asOf.
  windowMonths: number
  // Reports which entry of `points` the chart is showing (hovered or chosen
  // with the arrow keys; the last point by default), so the parent can list
  // that day's flows. Index is into `points` as passed in, not the chart's
  // internal allPoints (which prepends the asOf starting point).
  onHoverPointChange?: (index: number | null) => void
  // Rendered inside the chart's card, under the plot (the active day's flows).
  children?: ReactNode
}

const HEIGHT = 260
const PAD_LEFT = 64
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 28

function parseLocalDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

function buildStepPath(coords: { x: number; y: number }[], rightEdgeX: number): string {
  if (coords.length === 0) return ''
  let d = `M ${coords[0].x} ${coords[0].y}`
  for (let i = 1; i < coords.length; i++) {
    d += ` L ${coords[i].x} ${coords[i - 1].y} L ${coords[i].x} ${coords[i].y}`
  }
  d += ` L ${rightEdgeX} ${coords[coords.length - 1].y}`
  return d
}

// Draws at the container's real pixel width so axis labels stay 10px.
function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// fisac's own step chart (the system's LineChart has no hover callback),
// drawn with the system's chart tokens: series --chart-1, 9% grid, 10px mono
// axis labels, 10% area fill, negative zone in the rust status tone.
export function BalanceChart({
  asOf,
  startingBalance,
  points,
  nextFlowDate,
  windowMonths,
  onHoverPointChange,
  children,
}: BalanceChartProps) {
  const [containerRef, width] = useContainerWidth(900)
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const allPoints = useMemo(
    () => [{ date: asOf, balance: startingBalance }, ...points],
    [asOf, startingBalance, points],
  )

  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM

  const times = useMemo(() => allPoints.map((p) => parseLocalDate(p.date)), [allPoints])
  const minTime = times[0]
  // The chart always spans the full selected window, even with no flows to
  // plot - otherwise it'd draw only as far out as the last known point.
  const horizonTime = useMemo(() => parseLocalDate(addMonthsFrom(asOf, windowMonths)), [asOf, windowMonths])
  const maxTime = Math.max(times[times.length - 1], horizonTime)
  const timeSpan = maxTime - minTime || 1

  const { yMin, yMax, yStep } = useMemo(() => {
    const balances = allPoints.map((p) => p.balance)
    const rawMin = Math.min(0, ...balances)
    const rawMax = Math.max(0, ...balances)
    const step = niceStep((rawMax - rawMin || 1) / 4)
    return {
      yMin: Math.floor(rawMin / step) * step,
      yMax: Math.ceil(rawMax / step) * step,
      yStep: step,
    }
  }, [allPoints])
  const yRange = yMax - yMin || 1

  function x(time: number): number {
    return PAD_LEFT + ((time - minTime) / timeSpan) * plotWidth
  }
  function y(balance: number): number {
    return PAD_TOP + plotHeight - ((balance - yMin) / yRange) * plotHeight
  }

  const coords = allPoints.map((p, i) => ({ x: x(times[i]), y: y(p.balance) }))
  const rightEdgeX = PAD_LEFT + plotWidth
  const yZero = y(0)
  const showZeroBaseline = yMin < 0 && yMax > 0

  const gridlineValues: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
    gridlineValues.push(Math.round(v * 100) / 100)
  }

  // Fewer date labels on narrow screens so they never overlap.
  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 110)))
  const xTicks = useMemo(() => {
    const ticks: number[] = []
    for (let i = 0; i < xTickCount; i++) {
      ticks.push(minTime + (timeSpan * i) / (xTickCount - 1))
    }
    return ticks
  }, [minTime, timeSpan, xTickCount])

  // The muted tail only applies when nothing is scheduled beyond the window
  // at all (nextFlowDate null). A quiet stretch followed by real flows just
  // past the window is not a gap in our knowledge, so it keeps its colour.
  const hasForecastGap = nextFlowDate === null && maxTime > times[times.length - 1]

  // Clamped: the selection can outlive a refetch that returns fewer points.
  const activeIndex = selected !== null && selected < allPoints.length ? selected : allPoints.length - 1
  const active = allPoints[activeIndex]
  // allPoints[0] is the synthetic asOf entry, with no flows of its own.
  const activePointIndex = activeIndex > 0 ? activeIndex - 1 : null

  useEffect(() => {
    onHoverPointChange?.(activePointIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePointIndex])

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const last = allPoints.length - 1
    const next =
      e.key === 'ArrowLeft'
        ? Math.max(0, activeIndex - 1)
        : e.key === 'ArrowRight'
          ? Math.min(last, activeIndex + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    setSelected(next)
  }

  const tableColumns: DataTableColumn<BalancePoint & { id: number }>[] = [
    { key: 'date', header: 'date', render: (_, row) => formatDate(row.date, 'full') },
    { key: 'balance', header: 'solde', numeric: true, render: (_, row) => eur(row.balance) },
  ]

  return (
    <Card
      title="Solde projeté"
      subtitle={
        active ? (
          <span aria-live="polite">
            <span className="numeric text-fg-strong">{eur(active.balance)}</span> au{' '}
            {formatDate(active.date, 'full')}
          </span>
        ) : null
      }
      actions={
        <Button variant="ghost" size="sm" iconLeft={Table2} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Masquer le tableau' : 'Voir en tableau'}
        </Button>
      }
      padding={false}
    >
      <div className="px-2 pb-2">
        <div ref={containerRef}>
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block max-w-full"
            role="group"
            aria-label="Solde projeté jour par jour ; flèches gauche et droite pour parcourir les jours"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {gridlineValues.map((value) => {
              const gy = y(value)
              return (
                <g key={value}>
                  <line
                    x1={PAD_LEFT}
                    x2={width - PAD_RIGHT}
                    y1={gy}
                    y2={gy}
                    className={value === 0 && showZeroBaseline ? 'stroke-chart-axis' : 'stroke-chart-grid'}
                  />
                  <text
                    x={PAD_LEFT - 8}
                    y={gy}
                    textAnchor="end"
                    dy="0.32em"
                    className="fill-chart-axis font-mono text-[10px]"
                  >
                    {formatNumber(Math.round(value))}
                  </text>
                </g>
              )
            })}

            {xTicks.map((tick, i) => (
              <text
                key={tick}
                x={x(tick)}
                y={HEIGHT - PAD_BOTTOM + 18}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-chart-axis font-mono text-[10px]"
              >
                {formatDate(new Date(tick))}
              </text>
            ))}

            {coords.map((point, i) => {
              const nextX = i < coords.length - 1 ? coords[i + 1].x : rightEdgeX
              const isForecastGap = i === coords.length - 1 && hasForecastGap
              const isPositive = allPoints[i].balance >= 0
              return (
                <rect
                  key={`area-${i}`}
                  x={point.x}
                  y={Math.min(point.y, yZero)}
                  width={Math.max(nextX - point.x, 0)}
                  height={Math.abs(point.y - yZero)}
                  className={isForecastGap ? 'fill-chart-6/10' : isPositive ? 'fill-chart-1/10' : 'fill-negative/10'}
                />
              )
            })}

            <path
              d={buildStepPath(coords, rightEdgeX)}
              fill="none"
              strokeWidth={2}
              className="stroke-chart-1"
            />

            {coords.map((point, i) => {
              const nextX = i < coords.length - 1 ? coords[i + 1].x : rightEdgeX
              return (
                <rect
                  key={`hit-${i}`}
                  x={point.x}
                  y={PAD_TOP}
                  width={Math.max(nextX - point.x, 1)}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setSelected(i)}
                  onPointerDown={() => setSelected(i)}
                />
              )
            })}

            {selected !== null && coords[activeIndex] && (
              <line
                x1={coords[activeIndex].x}
                x2={coords[activeIndex].x}
                y1={PAD_TOP}
                y2={PAD_TOP + plotHeight}
                strokeDasharray="3 3"
                className="stroke-line-strong"
              />
            )}
          </svg>
        </div>
      </div>

      {children}

      {showTable && (
        <div className="border-t border-line-hairline">
          <DataTable
            compact
            columns={tableColumns}
            // Index as id: the asOf point can share its date with the first
            // real point when a flow lands today.
            rows={allPoints.map((p, i) => ({ ...p, id: i }))}
          />
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Rewrite the projection page**

`frontend/src/components/ProjectionView.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { Pencil, Search } from 'lucide-react'
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  Dialog,
  Field,
  Icon,
  IconButton,
  Input,
  Segment,
  StatCard,
  Tooltip,
  cn,
  toast,
  type DataTableColumn,
} from '@qvanderlinden/ui'
import {
  deleteFlow,
  deleteFlowBatch,
  fetchProjection,
  getFlow,
  listCategories,
  listLedgerAccounts,
  setFlowPaid,
  updateAccount,
  updateFlow,
} from '../api/client'
import type {
  AccountProjection,
  AccountRead,
  CategoryRead,
  FlowRead,
  LedgerAccountRead,
  ProjectionFlow,
} from '../api/types'
import { PAYMENT_METHOD_ICONS, addMonthsFrom, paymentMethodLabel, todayDateInputValue } from '../accountingDisplay'
import { describeError } from '../errors'
import { amountInput, eur, formatDate, parseDecimal, signedFlowAmount } from '../format'
import { BalanceChart } from './BalanceChart'
import { FlowForm } from './FlowForm'
import { PageHeader } from './PageHeader'

const WINDOW_OPTIONS = [
  { value: '3', label: '3m' },
  { value: '6', label: '6m' },
  { value: '12', label: '1a' },
]

interface ProjectionViewProps {
  account: AccountRead
  // Balance edits happen on this screen; the updated account flows back up
  // so the sidebar's account selector stays in sync.
  onAccountChange: (account: AccountRead) => void
}

interface UpcomingRow {
  id: string
  flow: ProjectionFlow
}

// The current balance in a small Dialog (replaces the old click-to-edit tile).
function BalanceDialog({
  account,
  asOf,
  onClose,
  onSaved,
}: {
  account: AccountRead
  asOf: string
  onClose: () => void
  onSaved: (account: AccountRead) => Promise<void>
}) {
  const formId = useId()
  const [draft, setDraft] = useState(amountInput(account.current_balance))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const value = parseDecimal(draft)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (value === null) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateAccount(account.id, { current_balance: value })
      toast('Solde enregistré.', { tone: 'positive' })
      await onSaved(updated)
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Solde actuel"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label={`Solde au ${formatDate(asOf, 'full')}`}
          error={submitted && value === null ? 'Montant illisible — par exemple 1 234,56.' : undefined}
        >
          <Input numeric value={draft} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        {error && (
          <Callout tone="negative" title="Le solde n’a pas été enregistré.">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  )
}

export function ProjectionView({ account, onAccountChange }: ProjectionViewProps) {
  const [projection, setProjection] = useState<AccountProjection | null>(null)
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountRead[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowMonths, setWindowMonths] = useState(3)
  const [editingFlow, setEditingFlow] = useState<FlowRead | null>(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)
  const [flowSearch, setFlowSearch] = useState('')
  // Only the latest request may land: switching account or window quickly
  // must not let an older, slower response overwrite a newer one.
  const requestSeq = useRef(0)

  async function refresh() {
    const seq = ++requestSeq.current
    const toDate = addMonthsFrom(todayDateInputValue(), windowMonths)
    try {
      const [fetched, fetchedCategories, fetchedLedgerAccounts] = await Promise.all([
        fetchProjection(account.id, toDate),
        listCategories(account.id),
        listLedgerAccounts(account.id),
      ])
      if (seq !== requestSeq.current) return
      setProjection(fetched)
      setCategories(fetchedCategories)
      setLedgerAccounts(fetchedLedgerAccounts)
      setLoadError(null)
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(describeError(err))
    }
  }

  // A new account starts from a blank screen rather than the previous
  // account's figures; a new window keeps the old figures until the new ones land.
  useEffect(() => {
    setProjection(null)
    setLoadError(null)
  }, [account.id])

  useEffect(() => {
    setFlowSearch('')
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, windowMonths])

  async function togglePaid(flow: ProjectionFlow) {
    try {
      await setFlowPaid(account.id, flow.id, !flow.paid)
      toast(flow.paid ? 'Flux marqué à payer.' : 'Flux marqué payé.', { tone: 'positive' })
    } catch (err) {
      toast(`Le statut n’a pas été modifié — ${describeError(err)}`, { tone: 'negative' })
    }
    await refresh()
  }

  async function startEditing(flow: ProjectionFlow) {
    // ProjectionFlow is a thin view; fetch the full flow (lines, category,
    // method) before opening the editor.
    try {
      setEditingFlow(await getFlow(account.id, flow.id))
    } catch (err) {
      toast(`Le flux n’a pas pu être ouvert — ${describeError(err)}`, { tone: 'negative' })
    }
  }

  const header = (
    <PageHeader
      title="Projection"
      actions={
        <Segment
          aria-label="Période projetée"
          options={WINDOW_OPTIONS}
          value={String(windowMonths)}
          onChange={(value) => setWindowMonths(Number(value))}
        />
      }
    />
  )

  if (projection === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {loadError ? (
          <Callout tone="negative" title="La projection n’a pas pu être chargée.">
            {loadError}{' '}
            <Button variant="link" onClick={refresh}>
              Réessayer
            </Button>
          </Callout>
        ) : (
          <p className="type-body-sm text-fg-muted">Chargement…</p>
        )}
      </div>
    )
  }

  // Lowest balance over the window, the starting balance included.
  const lowest = projection.points.reduce(
    (min, p) => (Number(p.balance) < min.balance ? { balance: Number(p.balance), date: p.date } : min),
    { balance: Number(projection.starting_balance), date: projection.as_of },
  )

  const hovered = hoveredPointIndex !== null ? (projection.points[hoveredPointIndex] ?? null) : null

  const searchTerm = flowSearch.trim().toLowerCase()
  const upcoming: UpcomingRow[] = projection.points.flatMap((point) =>
    point.flows
      .filter((flow) => flow.name.toLowerCase().includes(searchTerm))
      .map((flow) => ({ id: `${point.date}-${flow.id}`, flow })),
  )

  const columns: DataTableColumn<UpcomingRow>[] = [
    {
      key: 'date',
      header: 'date',
      render: (_, row) => <span className="whitespace-nowrap">{formatDate(row.flow.payment_date, 'full')}</span>,
    },
    {
      key: 'name',
      header: 'nom',
      render: (_, row) => <span className="font-medium text-fg-strong">{row.flow.name}</span>,
    },
    {
      key: 'method',
      header: 'moyen',
      render: (_, row) => {
        const method = row.flow.payment_method
        if (!method) return null
        return (
          <Tooltip label={paymentMethodLabel(method)}>
            <span role="img" tabIndex={0} aria-label={paymentMethodLabel(method)} className="inline-flex text-fg-muted">
              <Icon icon={PAYMENT_METHOD_ICONS[method]} size={14} />
            </span>
          </Tooltip>
        )
      },
    },
    {
      key: 'amount',
      header: 'montant',
      numeric: true,
      render: (_, row) => (
        <span className={cn('whitespace-nowrap', row.flow.kind === 'revenue' && 'text-positive-fg')}>
          {eur(signedFlowAmount(row.flow.kind, row.flow.amount))}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'payé',
      render: (_, row) => (
        <Badge asChild tone={row.flow.paid ? 'positive' : 'warning'}>
          <button
            type="button"
            className="cursor-pointer"
            onClick={() => togglePaid(row.flow)}
            aria-label={row.flow.paid ? `${row.flow.name} : marquer à payer` : `${row.flow.name} : marquer payé`}
          >
            {row.flow.paid ? 'payé' : 'à payer'}
          </button>
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (_, row) => (
        <IconButton icon={Pencil} size="sm" label={`Modifier ${row.flow.name}`} onClick={() => startEditing(row.flow)} />
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard className="relative" label="Solde actuel" value={Number(projection.starting_balance)} format="eur">
          <IconButton
            icon={Pencil}
            label="Modifier le solde actuel"
            size="sm"
            className="absolute top-4 right-4"
            onClick={() => setEditingBalance(true)}
          />
        </StatCard>
        <StatCard
          label="Plus bas projeté"
          value={lowest.balance}
          format="eur"
          // The view's one accent: only when the balance goes negative.
          accent={lowest.balance < 0}
          footnote={lowest.date === projection.as_of ? 'aujourd’hui' : `le ${formatDate(lowest.date, 'full')}`}
        />
      </div>

      <BalanceChart
        asOf={projection.as_of}
        startingBalance={Number(projection.starting_balance)}
        points={projection.points.map((p) => ({ date: p.date, balance: Number(p.balance) }))}
        nextFlowDate={projection.next_flow_date}
        windowMonths={windowMonths}
        onHoverPointChange={setHoveredPointIndex}
      >
        <div className="border-t border-line-hairline px-6 py-4">
          {hovered ? (
            <>
              <p className="type-eyebrow text-fg-subtle">flux du {formatDate(hovered.date, 'full')}</p>
              {hovered.flows.length === 0 ? (
                <p className="mt-2 type-body-sm text-fg-muted">Aucun flux ce jour-là.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {hovered.flows.map((flow) => (
                    <li key={flow.id} className="flex items-baseline justify-between gap-4 type-body-sm">
                      <span className="min-w-0 truncate text-fg-body">{flow.name}</span>
                      <span
                        className={cn(
                          'numeric shrink-0',
                          flow.kind === 'revenue' ? 'text-positive-fg' : 'text-fg-strong',
                        )}
                      >
                        {eur(signedFlowAmount(flow.kind, flow.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="type-body-sm text-fg-muted">Aucun flux sur la période.</p>
          )}
        </div>
      </BalanceChart>

      <Card
        title="Flux à venir"
        actions={
          <Input
            size="sm"
            icon={Search}
            aria-label="Rechercher un flux"
            placeholder="Rechercher un flux"
            className="w-56"
            value={flowSearch}
            onChange={(e) => setFlowSearch(e.target.value)}
          />
        }
        padding={false}
      >
        <DataTable
          columns={columns}
          rows={upcoming}
          emptyMessage={
            projection.points.length === 0
              ? 'Aucun flux à venir sur la période.'
              : `Aucun flux ne correspond à « ${flowSearch.trim()} ».`
          }
        />
      </Card>

      {editingBalance && (
        <BalanceDialog
          account={account}
          asOf={projection.as_of}
          onClose={() => setEditingBalance(false)}
          onSaved={async (updated) => {
            onAccountChange(updated)
            setEditingBalance(false)
            await refresh()
          }}
        />
      )}

      {editingFlow && (
        <FlowForm
          kind={editingFlow.kind}
          account={account}
          categories={categories}
          ledgerAccounts={ledgerAccounts}
          initialFlow={editingFlow}
          onCancel={() => setEditingFlow(null)}
          onSubmit={async (payload) => {
            await updateFlow(account.id, editingFlow.id, payload)
            toast('Flux enregistré.', { tone: 'positive' })
            setEditingFlow(null)
            await refresh()
          }}
          onDelete={async () => {
            await deleteFlow(account.id, editingFlow.id)
            toast('Flux supprimé.', { tone: 'positive' })
            setEditingFlow(null)
            await refresh()
          }}
          onDeleteBatch={
            editingFlow.batch_id != null
              ? async () => {
                  await deleteFlowBatch(account.id, editingFlow.batch_id!)
                  toast('Série supprimée.', { tone: 'positive' })
                  setEditingFlow(null)
                  await refresh()
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/BalanceChart.tsx',
  'src/components/ProjectionView.tsx',
```

- [ ] **Step 4: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 17 file(s) checked, 18 legacy file(s) skipped.`

- [ ] **Step 5: Browser walkthrough**

- On a real account (view only): serif title "Projection" with the `3m / 6m / 1a` segment; two stat cards "Solde actuel" (with a pencil) and "Plus bas projeté" (footnote "aujourd’hui" or "le 12 déc. 2026"); the chart card "Solde projeté" with the readout `€… au 04 oct. 2026`; "Flux à venir" with search, method icons (tooltip "Domiciliation"…), amounts olive for revenus and `−€…` for dépenses, `payé` / `à payer` badges. No primary button on the page; "Plus bas projeté" is terracotta only when negative.
- Chart styling: `get_css_styles` on an axis `<text>` → `font-size: 10px`, IBM Plex Mono; the line is terracotta, area fill light, zone below zero tinted rust. Switch to `1a`: one request with `to_date` a year out, the horizon widens and the page doesn't blank between loads. "Voir en tableau" toggles a date/solde table.
- In **Essai redesign**: pencil → "Solde actuel" dialog, field labelled "Solde au ‹today, e.g. 03 oct. 2026›"; **Review Focus 1:** type `2 500,5`, press Enter → toast "Solde enregistré.", the card shows `€2 500,50` and the sidebar `Select` too. Click a `à payer` badge → toast "Flux marqué payé.", the badge flips. Pencil on a row → the flow dialog; save → toast "Flux enregistré.".
- **Review Focus 2:** Tab to the chart, press ← → Home End: the crosshair, readout and the "flux du …" list follow.
- **Review Focus 4:** select **Essai vide**: both stat cards show `€0,00`, a flat chart, "Aucun flux sur la période." and "Aucun flux à venir sur la période."; no `NaN` anywhere.
- Switch accounts three times quickly: the figures shown match the last selected account's balance in the sidebar.
- `resize_page` 375×800: stat cards stack, the chart redraws at the new width without overflow, the table scrolls inside its card; `scrollWidth <= innerWidth`.
- `list_console_messages`: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/BalanceChart.tsx frontend/src/components/ProjectionView.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the projection on the design system"
```

---

### Task 6: Revenus / dépenses — toolbar, bulk bar and editable table

**Files:**
- Create: `frontend/src/components/editableTable.ts`
- Modify (full rewrite): `frontend/src/components/FlowList.tsx`, `frontend/src/components/FlowRow.tsx`, `frontend/src/components/NewFlowRow.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/accountingDisplay.ts`, `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `ConfirmDialog`, `PageHeader` (Task 3); `LinesEditor`, `linesToDrafts`, `linesToPayload`, `linesValid`, `PAYMENT_METHODS` (Task 4); `countLabel`, `eur`, `formatDate`, `signedFlowAmount` (Task 1); `describeError`; `FlowGenerator({ kind, account, categories, ledgerAccounts, onClose, onInserted })` and `FlowBulkEditDialog({ count, account, categories, showReverseCharge, onCancel, onApply })` with their current props (rewritten in Task 7 with the same props).
- Produces: `editableTable.ts` constants `HEAD`, `CELL`, `ROW`, `CELL_CONTROL` (reused by Tasks 8 and 9); `FlowList({ account; kind; onIncompleteCountChange?: (count: number) => void })`; `FlowRow` props gain nothing but `onDelete` is now `() => void` (the list confirms); `NewFlowRow` gains `colSpan: number`; `flowGapsSummary` returns French text.

- [ ] **Step 1: Shared table classes**

`frontend/src/components/editableTable.ts`:

```ts
// Shared look of fisac's editable tables (flux, catégories, plan comptable):
// the kit's DataTable - mono uppercase headers, hairlines, 4% row hover -
// built from the primitives, with dense cells and controls that read as plain
// text until hovered or focused.

/** Header cell padding, matching CELL. */
export const HEAD = 'px-2'
/** Body cell padding: denser than DataTable, since cells hold controls. */
export const CELL = 'px-2 py-1.5'
/** Row hover wash. */
export const ROW = 'hover:bg-surface-hover'
/** Input / Select trigger inside a cell: borderless until hovered, focus ring kept. */
export const CELL_CONTROL = 'border-transparent bg-transparent shadow-none hover:not-disabled:border-line-default'
```

- [ ] **Step 2: Rewrite the flow row**

`frontend/src/components/FlowRow.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Checkbox, Icon, IconButton, Input, Select, Tooltip, cn } from '@qvanderlinden/ui'
import { TableCell, TableRow } from '@qvanderlinden/ui/primitives'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
  PaymentMethod,
} from '../api/types'
import { PAYMENT_METHOD_LABELS, flowGapsSummary, isFlowIncomplete, visaPaymentDate } from '../accountingDisplay'
import { eur, formatDate, signedFlowAmount } from '../format'
import { CELL, CELL_CONTROL, ROW } from './editableTable'
import { PAYMENT_METHODS } from './FlowForm'
import { LinesEditor, linesToDrafts, linesToPayload, linesValid, type LineDraft } from './LinesEditor'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

interface FlowRowProps {
  flow: FlowRead
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  colSpan: number
  // Whether the reverse-charge (autoliquidation) column is shown.
  showReverseCharge: boolean
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  expanded: boolean
  onToggleExpanded: () => void
  // Persists a partial change (the parent merges it onto the full flow
  // payload, PATCHes, then refreshes; a failed commit reverts on refresh).
  onCommit: (changes: Partial<FlowCreate>) => Promise<void>
  onTogglePaid: () => Promise<void>
  // Asks the parent to confirm and delete.
  onDelete: () => void
}

export function FlowRow({
  flow,
  kind,
  account,
  categories,
  ledgerAccounts,
  colSpan,
  showReverseCharge,
  selected,
  onSelectedChange,
  expanded,
  onToggleExpanded,
  onCommit,
  onTogglePaid,
  onDelete,
}: FlowRowProps) {
  // Header-field drafts, committed on blur or Enter. Reseeded whenever the
  // flow prop changes (e.g. after a refresh) so a rejected edit reverts.
  const [name, setName] = useState(flow.name)
  const [invoiceDate, setInvoiceDate] = useState(flow.invoice_date)
  const [paymentDate, setPaymentDate] = useState(flow.payment_date ?? '')

  useEffect(() => {
    setName(flow.name)
    setInvoiceDate(flow.invoice_date)
    setPaymentDate(flow.payment_date ?? '')
  }, [flow])

  // Line drafts are seeded when the row (re)opens - not on every refresh - so
  // an in-progress line edit isn't clobbered by an unrelated header commit.
  const [lines, setLines] = useState<LineDraft[]>(() => linesToDrafts(flow.lines))
  const [savingLines, setSavingLines] = useState(false)

  useEffect(() => {
    if (expanded) setLines(linesToDrafts(flow.lines))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id, expanded])

  const method = flow.payment_method
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === flow.name) {
      setName(flow.name)
      return
    }
    onCommit({ name: trimmed })
  }

  function commitInvoiceDate() {
    if (invoiceDate === '' || invoiceDate === flow.invoice_date) {
      setInvoiceDate(flow.invoice_date)
      return
    }
    onCommit({ invoice_date: invoiceDate })
  }

  function commitPaymentDate() {
    const next = paymentDate || null
    if (next === (flow.payment_date ?? null)) return
    onCommit({ payment_date: next })
  }

  function changeMethod(value: string) {
    if (value === NONE) {
      // No payment method means no payment is made - clear the date too.
      onCommit({ payment_method: null, payment_date: null })
    } else if (value === 'visa') {
      // Visa flows never store their own payment date - the projection
      // derives it from the account's Visa payment day instead.
      onCommit({ payment_method: 'visa', payment_date: null })
    } else {
      onCommit({ payment_method: value as PaymentMethod })
    }
  }

  async function saveLines() {
    setSavingLines(true)
    try {
      await onCommit({ lines: linesToPayload(lines) })
    } finally {
      setSavingLines(false)
    }
  }

  const gaps = isFlowIncomplete(flow) ? flowGapsSummary(flow) : null

  return (
    <>
      <TableRow data-state={selected ? 'selected' : undefined} className={ROW}>
        <TableCell className={cn(CELL, 'w-7 pr-0')}>
          {/* Only the gaps the annual accounts care about: no category, or a
              line booked to no ledger account. */}
          {gaps && (
            <Tooltip label={gaps}>
              <span role="img" tabIndex={0} aria-label={`Incomplet : ${gaps}`} className="inline-flex text-warning-fg">
                <Icon icon={TriangleAlert} size={14} />
              </span>
            </Tooltip>
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'w-8 px-0')}>
          <IconButton
            size="sm"
            icon={expanded ? ChevronDown : ChevronRight}
            label={expanded ? 'Masquer les lignes' : 'Afficher les lignes'}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          />
        </TableCell>
        <TableCell className={cn(CELL, 'w-8')}>
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={`Sélectionner ${flow.name}`}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={blurOnEnter}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Catégorie"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={flow.category_id != null ? String(flow.category_id) : NONE}
            onValueChange={(value) => onCommit({ category_id: value === NONE ? null : Number(value) })}
            options={[
              { value: NONE, label: 'Aucune' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            type="date"
            aria-label="Date de facture"
            className={CELL_CONTROL}
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            onBlur={commitInvoiceDate}
            onKeyDown={blurOnEnter}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Moyen de paiement"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={method ?? NONE}
            onValueChange={changeMethod}
            options={[
              { value: NONE, label: 'Sans paiement' },
              ...PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
                disabled: m === 'visa' && account.visa_payment_day == null,
              })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          {method === null ? (
            <span className="px-2.5 text-fg-subtle">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Aucune date de paiement</span>
            </span>
          ) : method === 'visa' ? (
            account.visa_payment_day != null && (
              <Tooltip label="Selon le cycle Visa du compte">
                <span tabIndex={0} className="numeric px-2.5 whitespace-nowrap text-fg-muted">
                  {formatDate(
                    visaPaymentDate(flow.invoice_date, account.visa_payment_day, account.visa_closing_day),
                    'full',
                  )}
                </span>
              </Tooltip>
            )
          ) : (
            <Input
              size="sm"
              type="date"
              aria-label="Date de paiement"
              className={CELL_CONTROL}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              onBlur={commitPaymentDate}
              onKeyDown={blurOnEnter}
            />
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <span className={cn('numeric whitespace-nowrap', kind === 'revenue' ? 'text-positive-fg' : 'text-fg-strong')}>
            {eur(signedFlowAmount(kind, flow.amount_gross))}
          </span>
        </TableCell>
        {showReverseCharge && (
          <TableCell className={cn(CELL, 'text-center')}>
            <Checkbox
              checked={flow.reverse_charge}
              onCheckedChange={(v) => onCommit({ reverse_charge: v === true })}
              aria-label={`Autoliquidation pour ${flow.name}`}
            />
          </TableCell>
        )}
        <TableCell className={CELL}>
          <Badge asChild tone={flow.paid ? 'positive' : 'warning'}>
            <button
              type="button"
              className="cursor-pointer"
              onClick={onTogglePaid}
              aria-label={flow.paid ? `${flow.name} : marquer à payer` : `${flow.name} : marquer payé`}
            >
              {flow.paid ? 'payé' : 'à payer'}
            </button>
          </Badge>
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <IconButton size="sm" icon={Trash2} label={`Supprimer ${flow.name}`} onClick={onDelete} />
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
          <TableCell colSpan={colSpan} className="px-6 py-4">
            <div className="flex flex-col gap-3">
              <LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
              {!linesValid(lines) && (
                <p className="type-body-sm text-negative-fg">
                  Un montant ou un taux est illisible — corrigez les cases en rouge.
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveLines}
                  disabled={savingLines || !linesValid(lines)}
                >
                  {savingLines ? 'Enregistrement…' : 'Enregistrer les lignes'}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
```

- [ ] **Step 3: Rewrite the quick-add row**

`frontend/src/components/NewFlowRow.tsx`:

```tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Checkbox, IconButton, Input, Select, cn } from '@qvanderlinden/ui'
import { TableCell, TableRow } from '@qvanderlinden/ui/primitives'
import type { AccountRead, CategoryRead, FlowCreate, FlowKind, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS, todayDateInputValue } from '../accountingDisplay'
import { describeError } from '../errors'
import { CELL, CELL_CONTROL } from './editableTable'
import { PAYMENT_METHODS } from './FlowForm'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

interface NewFlowRowProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  colSpan: number
  // Whether the reverse-charge (autoliquidation) column is shown.
  showReverseCharge: boolean
  onCancel: () => void
  // Persists the draft (the parent POSTs, then opens the new row for line
  // entry). Rejects on failure so the draft stays put with its error shown.
  onCreate: (payload: FlowCreate) => Promise<void>
}

// The quick-add row at the bottom of the flows table. Header fields are
// entered here; amount lines are added after saving, in the expanded row.
// Enter in a field saves, Escape cancels.
export function NewFlowRow({
  kind,
  account,
  categories,
  colSpan,
  showReverseCharge,
  onCancel,
  onCreate,
}: NewFlowRowProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(NONE)
  const [invoiceDate, setInvoiceDate] = useState(todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState(NONE)
  const [paymentDate, setPaymentDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noPayment = paymentMethod === NONE
  const isVisa = paymentMethod === 'visa'

  async function save() {
    if (saving) return
    if (name.trim() === '') {
      setError('Le nom est obligatoire.')
      return
    }
    if (invoiceDate === '') {
      setError('La date de facture est obligatoire.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        kind,
        category_id: categoryId === NONE ? null : Number(categoryId),
        invoice_date: invoiceDate,
        payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
        payment_date: noPayment || isVisa ? null : paymentDate || null,
        paid,
        reverse_charge: showReverseCharge ? reverseCharge : false,
        lines: [],
      })
    } catch (err) {
      setError(`Le flux n’a pas été ajouté — ${describeError(err)}`)
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    // Keys pressed in an open Select's list (rendered in a portal) still
    // bubble here through React; only keys from the row's own fields count.
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (e.key === 'Enter' && target.tagName === 'INPUT') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <>
      <TableRow className="bg-surface-selected hover:bg-surface-selected" onKeyDown={onKeyDown}>
        <TableCell className={CELL} />
        <TableCell className={CELL} />
        <TableCell className={CELL} />
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            placeholder={kind === 'revenue' ? 'Nouveau revenu…' : 'Nouvelle dépense…'}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Catégorie"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: NONE, label: 'Aucune' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            type="date"
            aria-label="Date de facture"
            className={CELL_CONTROL}
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Moyen de paiement"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={paymentMethod}
            onValueChange={(value) => {
              setPaymentMethod(value)
              if (value === NONE || value === 'visa') setPaymentDate('')
            }}
            options={[
              { value: NONE, label: 'Sans paiement' },
              ...PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
                disabled: m === 'visa' && account.visa_payment_day == null,
              })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          {noPayment || isVisa ? (
            <span className="px-2.5 text-fg-subtle">
              <span aria-hidden="true">—</span>
              <span className="sr-only">
                {isVisa ? 'Date calculée selon le cycle Visa du compte' : 'Aucune date de paiement'}
              </span>
            </span>
          ) : (
            <Input
              size="sm"
              type="date"
              aria-label="Date de paiement"
              className={CELL_CONTROL}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'text-right type-body-sm text-fg-subtle')}>lignes après ajout</TableCell>
        {showReverseCharge && (
          <TableCell className={cn(CELL, 'text-center')}>
            <Checkbox
              checked={reverseCharge}
              onCheckedChange={(v) => setReverseCharge(v === true)}
              aria-label="Autoliquidation"
            />
          </TableCell>
        )}
        <TableCell className={CELL}>
          <Badge asChild tone={paid ? 'positive' : 'warning'}>
            <button type="button" className="cursor-pointer" onClick={() => setPaid((p) => !p)}>
              {paid ? 'payé' : 'à payer'}
            </button>
          </Badge>
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <div className="flex justify-end gap-1">
            <IconButton size="sm" icon={Check} label="Enregistrer le flux" onClick={save} disabled={saving} />
            <IconButton size="sm" icon={X} label="Annuler" onClick={onCancel} disabled={saving} />
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="px-4 py-2">
            <p role="alert" className="type-body-sm text-negative-fg">
              {error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
```

- [ ] **Step 4: Rewrite the list**

`frontend/src/components/FlowList.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Button, Callout, Card, Checkbox, Icon, Input, Select, Tag, cn, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import {
  bulkDeleteFlows,
  bulkUpdateFlows,
  createFlow,
  deleteFlow,
  listCategories,
  listFlows,
  listLedgerAccounts,
  setFlowPaid,
  updateFlow,
} from '../api/client'
import type {
  AccountRead,
  CategoryRead,
  FlowBulkUpdate,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
} from '../api/types'
import { PAYMENT_METHOD_LABELS, isFlowIncomplete } from '../accountingDisplay'
import { describeError } from '../errors'
import { countLabel } from '../format'
import { ConfirmDialog } from './ConfirmDialog'
import { CELL, HEAD } from './editableTable'
import { FlowBulkEditDialog } from './FlowBulkEditDialog'
import { PAYMENT_METHODS } from './FlowForm'
import { FlowGenerator } from './FlowGenerator'
import { FlowRow } from './FlowRow'
import { linesToDrafts, linesToPayload } from './LinesEditor'
import { NewFlowRow } from './NewFlowRow'
import { PageHeader } from './PageHeader'

// marker + chevron + select + name + category + invoice + method + payment
// date + amount + paid + delete. The reverse-charge column (expenses of
// VAT-registered accounts only) adds one more - see columnCount below.
const BASE_COLUMN_COUNT = 11

type SortKey = 'name' | 'category' | 'invoice_date' | 'payment_method' | 'payment_date' | 'amount' | 'paid'
type SortDir = 'asc' | 'desc'
type SortState = { key: SortKey; dir: SortDir } | null

// Each dimension is 'any' (no constraint), 'none' (empty value), or a
// concrete value. Active dimensions are ANDed together, with the search term
// and the incomplete toggle. Values are strings for the Selects.
type FilterState = { category: string; method: string; paid: 'any' | 'paid' | 'unpaid' }
const NO_FILTERS: FilterState = { category: 'any', method: 'any', paid: 'any' }

// A FlowRead reduced to the full FlowCreate payload the update endpoint wants
// (full-replace semantics), so a single changed field can be merged on top.
// Lines round-trip through the LinesEditor draft <-> payload pair every
// editor uses: a hand-rolled field list once dropped ledger_account_id, which
// silently unbooked every line on each inline edit.
function flowToPayload(flow: FlowRead): FlowCreate {
  return {
    name: flow.name,
    kind: flow.kind,
    category_id: flow.category_id,
    invoice_date: flow.invoice_date,
    payment_date: flow.payment_date,
    payment_method: flow.payment_method,
    paid: flow.paid,
    reverse_charge: flow.reverse_charge,
    lines: linesToPayload(linesToDrafts(flow.lines)),
  }
}

interface FlowListProps {
  account: AccountRead
  // The revenus / dépenses pages each render this component pinned to one kind.
  kind: FlowKind
  // Reports this kind's incomplete count after every load, for the sidebar badge.
  onIncompleteCountChange?: (count: number) => void
}

export function FlowList({ account, kind, onIncompleteCountChange }: FlowListProps) {
  const [flows, setFlows] = useState<FlowRead[]>([])
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountRead[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  // Missing a category, or holding a line booked to no ledger account.
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  // At most one row is expanded (showing its line editor) at a time.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  // A single unsaved draft row appended at the bottom of the table.
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = natural (server sort_key) order.
  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS)
  const [deleting, setDeleting] = useState<FlowRead | null>(null)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)
  // Only the latest load may land (switching account quickly).
  const requestSeq = useRef(0)

  async function refresh() {
    const seq = ++requestSeq.current
    try {
      const [fetchedFlows, fetchedCategories, fetchedLedgerAccounts] = await Promise.all([
        listFlows(account.id, kind),
        listCategories(account.id),
        listLedgerAccounts(account.id),
      ])
      if (seq !== requestSeq.current) return
      setFlows(fetchedFlows)
      setCategories(fetchedCategories)
      setLedgerAccounts(fetchedLedgerAccounts)
      setLoaded(true)
      onIncompleteCountChange?.(fetchedFlows.filter(isFlowIncomplete).length)
    } catch (err) {
      if (seq === requestSeq.current) setError(`Les flux n’ont pas pu être chargés — ${describeError(err)}`)
    }
  }

  useEffect(() => {
    setFlows([])
    setLoaded(false)
    setSelected(new Set())
    setSearch('')
    setOnlyIncomplete(false)
    setExpandedId(null)
    setSort(null)
    setAdding(false)
    setFilters(NO_FILTERS)
    setError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, kind])

  const categoryName = (id: number | null) => (id == null ? '' : (categories.find((c) => c.id === id)?.name ?? ''))

  const term = search.trim().toLowerCase()
  const filtersActive =
    term !== '' ||
    onlyIncomplete ||
    filters.category !== 'any' ||
    filters.method !== 'any' ||
    filters.paid !== 'any'
  // Counted over every flow of this kind, not the filtered set, so the count
  // does not drop to zero the moment the toggle is switched on.
  const incompleteCount = flows.filter(isFlowIncomplete).length

  const filtered = flows.filter((f) => {
    if (term !== '' && !`${f.name} ${categoryName(f.category_id)}`.toLowerCase().includes(term)) return false
    if (filters.category === 'none' && f.category_id !== null) return false
    if (filters.category !== 'any' && filters.category !== 'none' && f.category_id !== Number(filters.category)) {
      return false
    }
    if (filters.method === 'none' && f.payment_method !== null) return false
    if (filters.method !== 'any' && filters.method !== 'none' && f.payment_method !== filters.method) return false
    if (filters.paid === 'paid' && !f.paid) return false
    if (filters.paid === 'unpaid' && f.paid) return false
    if (onlyIncomplete && !isFlowIncomplete(f)) return false
    return true
  })

  function compareBy(a: FlowRead, b: FlowRead, key: SortKey): number {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name, 'fr')
      case 'category':
        return categoryName(a.category_id).localeCompare(categoryName(b.category_id), 'fr')
      case 'invoice_date':
        return a.invoice_date.localeCompare(b.invoice_date)
      case 'payment_method':
        return (a.payment_method ?? '').localeCompare(b.payment_method ?? '')
      case 'payment_date': {
        // Explicit null handling: undated flows sort last (ascending).
        if (a.payment_date === b.payment_date) return 0
        if (a.payment_date === null) return 1
        if (b.payment_date === null) return -1
        return a.payment_date.localeCompare(b.payment_date)
      }
      case 'amount':
        return Number(a.amount_gross) - Number(b.amount_gross)
      case 'paid':
        return Number(a.paid) - Number(b.paid)
    }
  }

  // Sorting works on a copy so the fetched (server sort_key) order stays the
  // "natural" state to return to.
  const rows = sort
    ? [...filtered].sort((a, b) => {
        const c = compareBy(a, b, sort.key)
        return sort.dir === 'asc' ? c : -c
      })
    : filtered

  // asc, then desc, then back to the natural order.
  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  function sortableHead(key: SortKey, label: string, align?: 'right') {
    const active = sort?.key === key
    return (
      <TableHead
        className={cn(HEAD, align === 'right' && 'text-right')}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-inherit uppercase [font:inherit] tracking-[inherit] transition-colors hover:text-fg-accent"
        >
          {label}
          <Icon icon={active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown} size={11} />
        </button>
      </TableHead>
    )
  }

  const visibleSelectedIds = filtered.filter((f) => selected.has(f.id)).map((f) => f.id)
  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id))
  const someFilteredSelected = filtered.some((f) => selected.has(f.id))

  function toggleSelected(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const f of filtered) {
        if (checked) next.add(f.id)
        else next.delete(f.id)
      }
      return next
    })
  }

  async function commitFlow(flow: FlowRead, changes: Partial<FlowCreate>) {
    setError(null)
    try {
      await updateFlow(account.id, flow.id, { ...flowToPayload(flow), ...changes })
    } catch (err) {
      setError(`« ${flow.name} » n’a pas été enregistré — ${describeError(err)}`)
    } finally {
      // On success this shows the new value; on failure it reverts the row.
      await refresh()
    }
  }

  async function togglePaid(flow: FlowRead) {
    setError(null)
    try {
      await setFlowPaid(account.id, flow.id, !flow.paid)
    } catch (err) {
      setError(`Le statut de « ${flow.name} » n’a pas été modifié — ${describeError(err)}`)
    } finally {
      await refresh()
    }
  }

  async function createDraft(payload: FlowCreate) {
    setError(null)
    // NewFlowRow shows failures itself (and keeps the draft) when this rejects.
    const created = await createFlow(account.id, payload)
    setAdding(false)
    toast('Flux ajouté.', { tone: 'positive' })
    await refresh()
    // Open the new row so its amount lines can be entered right away.
    setExpandedId(created.id)
  }

  async function runBulk(payload: Omit<FlowBulkUpdate, 'flow_ids'>) {
    const n = visibleSelectedIds.length
    await bulkUpdateFlows(account.id, { flow_ids: visibleSelectedIds, ...payload })
    setBulkOpen(false)
    setSelected(new Set())
    toast(`${countLabel(n, 'flux modifié', 'flux modifiés')}.`, { tone: 'positive' })
    await refresh()
  }

  async function quickSetPaid(paid: boolean) {
    setError(null)
    try {
      await runBulk({ paid })
    } catch (err) {
      setError(`La sélection n’a pas été modifiée — ${describeError(err)}`)
    }
  }

  const kindTitle = kind === 'revenue' ? 'Revenus' : 'Dépenses'
  const hasSelection = visibleSelectedIds.length > 0
  // Reverse charge (autoliquidation) is a purchase concept, only relevant for
  // VAT-registered accounts - so the column exists on dépenses only.
  const showReverseCharge = kind === 'expense' && account.vat_applicable
  const columnCount = BASE_COLUMN_COUNT + (showReverseCharge ? 1 : 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={kindTitle}
        actions={
          <>
            <Button variant="secondary" iconLeft={Sparkles} onClick={() => setGenerating(true)}>
              Générer
            </Button>
            <Button iconLeft={Plus} onClick={() => setAdding(true)} disabled={!loaded}>
              Ajouter un flux
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          icon={Search}
          aria-label="Rechercher un flux"
          placeholder="Rechercher un flux"
          className="w-60"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size="sm"
          aria-label="Filtrer par catégorie"
          className="w-48"
          value={filters.category}
          onValueChange={(value) => setFilters((f) => ({ ...f, category: value }))}
          options={[
            { value: 'any', label: 'Toutes catégories' },
            { value: 'none', label: 'Sans catégorie' },
            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />
        <Select
          size="sm"
          aria-label="Filtrer par moyen de paiement"
          className="w-44"
          value={filters.method}
          onValueChange={(value) => setFilters((f) => ({ ...f, method: value }))}
          options={[
            { value: 'any', label: 'Tous moyens' },
            { value: 'none', label: 'Sans paiement' },
            ...PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
          ]}
        />
        <Select
          size="sm"
          aria-label="Filtrer par statut de paiement"
          className="w-40"
          value={filters.paid}
          onValueChange={(value) => setFilters((f) => ({ ...f, paid: value as FilterState['paid'] }))}
          options={[
            { value: 'any', label: 'Payés et à payer' },
            { value: 'paid', label: 'Payés' },
            { value: 'unpaid', label: 'À payer' },
          ]}
        />
        <Tag selected={onlyIncomplete} onClick={() => setOnlyIncomplete((v) => !v)}>
          incomplets <span className="numeric">{incompleteCount}</span>
        </Tag>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={RotateCcw}
            onClick={() => {
              setSearch('')
              setOnlyIncomplete(false)
              setFilters(NO_FILTERS)
            }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      {hasSelection && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line-hairline bg-surface-sunken px-3 py-2">
          <span className="mr-2 type-label text-fg-strong">
            {countLabel(visibleSelectedIds.length, 'sélectionné', 'sélectionnés')}
          </span>
          <Button variant="ghost" size="sm" iconLeft={Check} onClick={() => quickSetPaid(true)}>
            Marquer payé
          </Button>
          <Button variant="ghost" size="sm" iconLeft={Undo2} onClick={() => quickSetPaid(false)}>
            Marquer impayé
          </Button>
          <Button variant="ghost" size="sm" iconLeft={Pencil} onClick={() => setBulkOpen(true)}>
            Modifier…
          </Button>
          <Button variant="ghost" size="sm" iconLeft={Trash2} onClick={() => setConfirmingBulkDelete(true)}>
            Supprimer
          </Button>
          <Button variant="ghost" size="sm" iconLeft={X} onClick={() => setSelected(new Set())}>
            Annuler
          </Button>
        </div>
      )}

      {error && (
        <Callout tone="negative" title="Action impossible">
          {error}
        </Callout>
      )}

      {!loaded && !error && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {/* Kept mounted through refreshes (every inline edit refetches) so
          scroll position and focus survive. */}
      {loaded && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD, 'w-7 pr-0')}>
                  <span className="sr-only">Incomplet</span>
                </TableHead>
                <TableHead className={cn(HEAD, 'w-8 px-0')}>
                  <span className="sr-only">Lignes</span>
                </TableHead>
                <TableHead className={cn(HEAD, 'w-8')}>
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                {sortableHead('name', 'nom')}
                {sortableHead('category', 'catégorie')}
                {sortableHead('invoice_date', 'date de facture')}
                {sortableHead('payment_method', 'moyen de paiement')}
                {sortableHead('payment_date', 'date de paiement')}
                {sortableHead('amount', 'montant', 'right')}
                {showReverseCharge && <TableHead className={cn(HEAD, 'text-center')}>autoliquidation</TableHead>}
                {sortableHead('paid', 'payé')}
                <TableHead className={HEAD}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((flow) => (
                <FlowRow
                  key={flow.id}
                  flow={flow}
                  kind={kind}
                  account={account}
                  categories={categories}
                  ledgerAccounts={ledgerAccounts}
                  colSpan={columnCount}
                  showReverseCharge={showReverseCharge}
                  selected={selected.has(flow.id)}
                  onSelectedChange={(checked) => toggleSelected(flow.id, checked)}
                  expanded={expandedId === flow.id}
                  onToggleExpanded={() => setExpandedId((prev) => (prev === flow.id ? null : flow.id))}
                  onCommit={(changes) => commitFlow(flow, changes)}
                  onTogglePaid={() => togglePaid(flow)}
                  onDelete={() => setDeleting(flow)}
                />
              ))}
              {adding && (
                <NewFlowRow
                  kind={kind}
                  account={account}
                  categories={categories}
                  colSpan={columnCount}
                  showReverseCharge={showReverseCharge}
                  onCancel={() => setAdding(false)}
                  onCreate={createDraft}
                />
              )}
              {rows.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={columnCount} className={cn(CELL, 'py-10 text-center text-fg-muted')}>
                    {flows.length === 0
                      ? kind === 'revenue'
                        ? 'Aucun revenu pour l’instant.'
                        : 'Aucune dépense pour l’instant.'
                      : 'Aucun flux ne correspond à ces filtres.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {generating && (
        <FlowGenerator
          kind={kind}
          account={account}
          categories={categories}
          ledgerAccounts={ledgerAccounts}
          onClose={() => setGenerating(false)}
          onInserted={async () => {
            setGenerating(false)
            await refresh()
          }}
        />
      )}

      {bulkOpen && (
        <FlowBulkEditDialog
          count={visibleSelectedIds.length}
          account={account}
          categories={categories}
          showReverseCharge={showReverseCharge}
          onCancel={() => setBulkOpen(false)}
          onApply={runBulk}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Supprimer ce flux ?"
          description={`« ${deleting.name} » sera supprimé définitivement.`}
          confirmLabel="Supprimer le flux"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteFlow(account.id, deleting.id)
            toast('Flux supprimé.', { tone: 'positive' })
            await refresh()
          }}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmDialog
          title={`Supprimer ${countLabel(visibleSelectedIds.length, 'flux', 'flux')} ?`}
          description="Les flux sélectionnés seront supprimés définitivement."
          confirmLabel="Supprimer"
          onClose={() => setConfirmingBulkDelete(false)}
          onConfirm={async () => {
            const n = visibleSelectedIds.length
            await bulkDeleteFlows(account.id, visibleSelectedIds)
            setSelected(new Set())
            toast(`${countLabel(n, 'flux supprimé', 'flux supprimés')}.`, { tone: 'positive' })
            await refresh()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire the sidebar badges and translate the gap summary**

In `frontend/src/App.tsx` replace:

```tsx
          {!loading && selectedAccount !== null && tab === 'revenues' && (
            <FlowList account={selectedAccount} kind="revenue" />
          )}
          {!loading && selectedAccount !== null && tab === 'expenses' && (
            <FlowList account={selectedAccount} kind="expense" />
          )}
```

with:

```tsx
          {!loading && selectedAccount !== null && tab === 'revenues' && (
            <FlowList
              account={selectedAccount}
              kind="revenue"
              onIncompleteCountChange={(n) => setIncomplete((c) => ({ ...c, revenue: n }))}
            />
          )}
          {!loading && selectedAccount !== null && tab === 'expenses' && (
            <FlowList
              account={selectedAccount}
              kind="expense"
              onIncompleteCountChange={(n) => setIncomplete((c) => ({ ...c, expense: n }))}
            />
          )}
```

In `frontend/src/accountingDisplay.ts` replace:

```ts
  if (gaps.noCategory) parts.push('No category')
  if (gaps.unbooked > 0) {
    parts.push(
      `${gaps.unbooked} of ${gaps.lineCount} ${gaps.lineCount === 1 ? 'line' : 'lines'} unbooked`,
    )
  }
  return parts.join('; ')
```

with:

```ts
  if (gaps.noCategory) parts.push('sans catégorie')
  if (gaps.unbooked > 0) {
    const s = gaps.unbooked > 1 ? 's' : ''
    parts.push(`${gaps.unbooked} ligne${s} sur ${gaps.lineCount} non imputée${s}`)
  }
  return parts.join(' ; ')
```

- [ ] **Step 6: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/FlowList.tsx',
  'src/components/FlowRow.tsx',
  'src/components/NewFlowRow.tsx',
```

- [ ] **Step 7: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 21 file(s) checked, 15 legacy file(s) skipped.`

- [ ] **Step 8: Browser walkthrough** (in **Essai redesign**, dépenses)

- Header "Dépenses" with "Générer" (secondary, Sparkles) and "Ajouter un flux" (primary). Toolbar: search "Rechercher un flux", three `Select`s (Toutes catégories / Tous moyens / Payés et à payer), the `incomplets N` tag; "Réinitialiser" appears as soon as any filter or the search is set and clears them all.
- Table inside a card: mono uppercase headers, hairlines, hover wash; columns marker, chevron, checkbox, nom, catégorie, date de facture, moyen de paiement, date de paiement, montant, autoliquidation (only here: dépenses of a VAT-registered account; absent on revenus and on **Essai vide**), payé, delete.
- Add three flows with "Ajouter un flux": the draft row appears focused at the bottom; Enter in a field saves (toast "Flux ajouté.", the new row opens on its lines); an empty name → "Le nom est obligatoire."; Escape cancels.
- Marker: a flow without category shows the triangle; hovering or focusing it shows "sans catégorie ; …"; the sidebar badge on dépenses equals the `incomplets` count; set a category and book its line → the marker disappears and the badge drops by one.
- Sort: click "montant" → ascending (arrow up, `aria-sort="ascending"`), again → descending, again → original order.
- Edit name + Enter → PATCH, value kept; clear the name + Enter → reverts. Category `Select` commits at once. Moyen "Sans paiement" → the payment-date cell shows "—"; "Visa" → it shows the computed date with the tooltip "Selon le cycle Visa du compte".
- Select two rows → the header checkbox is indeterminate; the bulk bar reads "2 sélectionnés"; "Marquer payé" → toast "2 flux modifiés."; "Supprimer" → "Supprimer 2 flux ?" → toast "2 flux supprimés."; "Annuler" clears the selection. Row delete → "Supprimer ce flux ?".
- **Review Focus 2:** with the keyboard only: Tab into a row's name, type, Enter; Tab to catégorie, Space opens it, ↓ and Enter choose (one PATCH); Tab on to the payé badge, Enter toggles; Shift+Tab back to the row's chevron, Enter opens the lines. In the draft row open the catégorie `Select` and press Escape → only the `Select` closes, the draft stays; Escape again → the draft goes.
- **Review Focus 5:** rename a flow to 120 characters; at 375×800 the table scrolls inside its card and `scrollWidth <= innerWidth`.
- **Review Focus 4:** **Essai vide** dépenses → "Aucune dépense pour l’instant.", `incomplets 0`, no badge in the sidebar.
- The generator and bulk-edit dialogs still open (old look until Task 7). `list_console_messages`: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/editableTable.ts frontend/src/components/FlowList.tsx frontend/src/components/FlowRow.tsx \
  frontend/src/components/NewFlowRow.tsx frontend/src/App.tsx frontend/src/accountingDisplay.ts frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the flows table on the design system"
```

---

### Task 7: Bulk edit and generator dialogs

**Files:**
- Modify (full rewrite): `frontend/src/components/FlowBulkEditDialog.tsx`, `frontend/src/components/FlowGenerator.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `FlowForm`, `PAYMENT_METHODS`, `LinesEditor`, `emptyLine`, `linesToPayload`, `linesTotals`, `linesValid` (Task 4); `countLabel`, `eur`, `formatDate`, `formatRate`, `parseDecimal`, `parseNumber`, `signedFlowAmount`, `toApiDecimal` (Task 1); `describeError`; `generateFlows`, `createFlowsBulk`.
- Produces: `FlowBulkEditDialog` and `FlowGenerator` with the same props as before (see Task 6 Interfaces); both render their own `Dialog`.

- [ ] **Step 1: Rewrite the bulk edit dialog**

`frontend/src/components/FlowBulkEditDialog.tsx`:

```tsx
import { useId, useState } from 'react'
import { Button, Callout, Checkbox, Dialog, Field, Input, Select } from '@qvanderlinden/ui'
import type { AccountRead, CategoryRead, FlowBulkUpdate, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { describeError } from '../errors'
import { countLabel, formatRate, parseNumber, parseDecimal } from '../format'
import { PAYMENT_METHODS } from './FlowForm'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

interface FlowBulkEditDialogProps {
  count: number
  account: AccountRead
  categories: CategoryRead[]
  // Whether the reverse-charge (autoliquidation) field is offered.
  showReverseCharge: boolean
  onCancel: () => void
  // The payload carries only the fields the user enabled (see FlowBulkUpdate).
  // Rejects to keep the dialog open with the error shown.
  onApply: (payload: Omit<FlowBulkUpdate, 'flow_ids'>) => Promise<void>
}

// Each attribute sits behind an enabling Checkbox: only enabled ones go into
// the payload, so a bulk edit can touch one field or several. Mirrors the
// backend's model_fields_set semantics.
export function FlowBulkEditDialog({
  count,
  account,
  categories,
  showReverseCharge,
  onCancel,
  onApply,
}: FlowBulkEditDialogProps) {
  const formId = useId()
  const [applyCategory, setApplyCategory] = useState(false)
  const [categoryId, setCategoryId] = useState(NONE)

  const [applyAmount, setApplyAmount] = useState(false)
  const [amountNet, setAmountNet] = useState('')
  const [vatRate, setVatRate] = useState('21')

  const [applyPayment, setApplyPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(NONE)

  const [applyPaid, setApplyPaid] = useState(false)
  const [paid, setPaid] = useState('paid')

  const [applyReverseCharge, setApplyReverseCharge] = useState(false)
  const [reverseCharge, setReverseCharge] = useState('on')

  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nothingEnabled = !applyCategory && !applyAmount && !applyPayment && !applyPaid && !applyReverseCharge
  const net = parseDecimal(amountNet)
  const amountInvalid = net === null || Number(net) < 0
  const rate = vatRate.trim() === '' ? 0 : parseNumber(vatRate)
  const rateInvalid = !Number.isFinite(rate) || rate < 0 || rate > 100

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (nothingEnabled) return
    if (applyAmount && (amountInvalid || rateInvalid)) return
    const payload: Omit<FlowBulkUpdate, 'flow_ids'> = {}
    if (applyCategory) payload.category_id = categoryId === NONE ? null : Number(categoryId)
    if (applyAmount && net !== null) {
      payload.amount_net = net
      payload.vat_rate = parseDecimal(vatRate) ?? '0'
    }
    if (applyPayment) payload.payment_method = paymentMethod === NONE ? null : (paymentMethod as PaymentMethod)
    if (applyPaid) payload.paid = paid === 'paid'
    if (applyReverseCharge) payload.reverse_charge = reverseCharge === 'on'

    setSaving(true)
    setError(null)
    try {
      await onApply(payload)
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`Modifier ${countLabel(count, 'flux', 'flux')}`}
      description="Cochez un champ pour l’appliquer à chaque flux sélectionné ; les autres restent inchangés."
      onInteractOutside={(e) => e.preventDefault()}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={saving || nothingEnabled}>
            {saving ? 'Application…' : `Appliquer à ${countLabel(count, 'flux', 'flux')}`}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Checkbox label="Catégorie" checked={applyCategory} onCheckedChange={(v) => setApplyCategory(v === true)} />
          <Select
            aria-label="Catégorie"
            disabled={!applyCategory}
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: NONE, label: 'Aucune catégorie' },
              ...categories.map((c) => ({
                value: String(c.id),
                label: `${c.name} (${formatRate(c.tax_deduction_rate)} déductible)`,
              })),
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox label="Montant" checked={applyAmount} onCheckedChange={(v) => setApplyAmount(v === true)} />
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field
              label="Montant net"
              hint={applyAmount ? 'Remplace les lignes de chaque flux par une seule ligne.' : undefined}
              error={submitted && applyAmount && amountInvalid ? 'Montant illisible — par exemple 1 234,56.' : undefined}
            >
              <Input
                numeric
                placeholder="0,00"
                disabled={!applyAmount}
                value={amountNet}
                onChange={(e) => setAmountNet(e.target.value)}
              />
            </Field>
            <Field
              label="TVA"
              error={submitted && applyAmount && rateInvalid ? 'Entre 0 et 100.' : undefined}
            >
              <Input
                numeric
                suffix="%"
                disabled={!applyAmount}
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox
            label="Moyen de paiement"
            checked={applyPayment}
            onCheckedChange={(v) => setApplyPayment(v === true)}
          />
          <Select
            aria-label="Moyen de paiement"
            disabled={!applyPayment}
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={[
              { value: NONE, label: 'Sans paiement (compte courant associés)' },
              ...PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
                disabled: m === 'visa' && account.visa_payment_day == null,
              })),
            ]}
          />
          {applyPayment && paymentMethod === 'visa' && (
            <p className="type-body-sm text-fg-muted">
              Efface aussi la date de paiement enregistrée : les flux Visa suivent le jour Visa du compte.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox label="Statut de paiement" checked={applyPaid} onCheckedChange={(v) => setApplyPaid(v === true)} />
          <Select
            aria-label="Statut de paiement"
            disabled={!applyPaid}
            value={paid}
            onValueChange={setPaid}
            options={[
              { value: 'paid', label: 'Payé' },
              { value: 'unpaid', label: 'À payer' },
            ]}
          />
        </div>

        {showReverseCharge && (
          <div className="flex flex-col gap-2">
            <Checkbox
              label="Autoliquidation"
              checked={applyReverseCharge}
              onCheckedChange={(v) => setApplyReverseCharge(v === true)}
            />
            <Select
              aria-label="Autoliquidation"
              disabled={!applyReverseCharge}
              value={reverseCharge}
              onValueChange={setReverseCharge}
              options={[
                { value: 'on', label: 'Autoliquidation' },
                { value: 'off', label: 'TVA normale' },
              ]}
            />
          </div>
        )}

        {error && (
          <Callout tone="negative" title="Les flux n’ont pas été modifiés.">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  )
}
```

- [ ] **Step 2: Rewrite the generator**

`frontend/src/components/FlowGenerator.tsx`:

```tsx
import { useState } from 'react'
import { ArrowLeft, Pencil, Sparkles, X } from 'lucide-react'
import {
  Button,
  Callout,
  Card,
  DataTable,
  Dialog,
  Field,
  IconButton,
  Select,
  Textarea,
  cn,
  toast,
  type DataTableColumn,
} from '@qvanderlinden/ui'
import { createFlowsBulk, generateFlows } from '../api/client'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
  PaymentMethod,
} from '../api/types'
import { PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { describeError } from '../errors'
import { countLabel, eur, formatDate, formatRate, signedFlowAmount, toApiDecimal } from '../format'
import { FlowForm, PAYMENT_METHODS } from './FlowForm'
import { LinesEditor, emptyLine, linesToPayload, linesTotals, linesValid, type LineDraft } from './LinesEditor'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

type Step = 'describe' | 'generating' | 'review'

interface FlowGeneratorProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  onClose: () => void
  // Called after a successful bulk insert so the parent list can refresh.
  onInserted: () => Promise<void>
}

interface ProposalRow {
  id: number
  proposal: FlowCreate
}

// Wraps an unsaved FlowCreate proposal as a pseudo-FlowRead so FlowForm can
// edit it - FlowForm only reads name/category/dates/method/paid/lines, so the
// fake id/sort_key fields are never load-bearing. Not routed through
// linesToDrafts/linesToPayload: those convert between FlowLineRead and
// LineDraft, while this synthesizes a FlowLineRead from a FlowLineCreate. It
// carries ledger_account_id through explicitly - keep that if this changes.
function proposalToFlowRead(proposal: FlowCreate, accountId: number): FlowRead {
  const totals = linesTotals(proposal.lines)
  return {
    id: -1,
    account_id: accountId,
    name: proposal.name,
    kind: proposal.kind,
    category_id: proposal.category_id,
    invoice_date: proposal.invoice_date,
    payment_date: proposal.payment_date,
    payment_method: proposal.payment_method,
    paid: proposal.paid ?? false,
    batch_id: null,
    reverse_charge: proposal.reverse_charge ?? false,
    sort_key: '',
    lines: proposal.lines.map((l, i) => ({
      id: -(i + 1),
      description: l.description ?? null,
      amount_net: l.amount_net,
      vat_rate: l.vat_rate ?? '0',
      sort_key: String(i),
      ledger_account_id: l.ledger_account_id ?? null,
    })),
    amount_net: toApiDecimal(totals.net),
    amount_vat: toApiDecimal(totals.vat),
    amount_gross: toApiDecimal(totals.gross),
  }
}

// The LLM-assisted generator in three steps: describe the recurring rule and
// the template applied to every occurrence, wait for the proposal, then
// review (edit or remove rows) and insert them in one batch.
export function FlowGenerator({
  kind,
  account,
  categories,
  ledgerAccounts,
  onClose,
  onInserted,
}: FlowGeneratorProps) {
  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  // Template fields, entered once and applied to every generated occurrence.
  const [categoryId, setCategoryId] = useState(NONE)
  const [paymentMethod, setPaymentMethod] = useState(NONE)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [proposals, setProposals] = useState<FlowCreate[]>([])
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inserting, setInserting] = useState(false)

  const noPayment = paymentMethod === NONE
  const linesOk = linesValid(lines)

  async function handleGenerate() {
    setStep('generating')
    setError(null)
    try {
      const response = await generateFlows(account.id, { description })
      const templateLines = linesToPayload(lines)
      const isVisa = paymentMethod === 'visa'
      setProposals(
        response.occurrences.map((occ) => ({
          name: occ.name,
          kind,
          category_id: categoryId === NONE ? null : Number(categoryId),
          invoice_date: occ.invoice_date,
          // A "no payment" or Visa template nulls the date - Visa flows never
          // store one (the projection derives it from the account's Visa
          // payment day); otherwise fall back to the invoice date when the
          // model left payment_date null.
          payment_date: noPayment || isVisa ? null : (occ.payment_date ?? occ.invoice_date),
          payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
          paid: false,
          lines: templateLines.map((l) => ({ ...l })),
        })),
      )
      setModel(response.model)
      setProvider(response.provider)
      setStep('review')
    } catch (err) {
      setError(describeError(err))
      setStep('describe')
    }
  }

  async function handleInsert() {
    setInserting(true)
    setError(null)
    try {
      await createFlowsBulk(account.id, proposals)
      toast(`${countLabel(proposals.length, 'flux inséré', 'flux insérés')}.`, { tone: 'positive' })
      await onInserted()
    } catch (err) {
      setError(describeError(err))
      setInserting(false)
    }
  }

  const reviewing = step === 'review'
  const generating = step === 'generating'

  const columns: DataTableColumn<ProposalRow>[] = [
    {
      key: 'invoice_date',
      header: 'date de facture',
      render: (_, row) => <span className="whitespace-nowrap">{formatDate(row.proposal.invoice_date, 'full')}</span>,
    },
    {
      key: 'payment_date',
      header: 'date de paiement',
      render: (_, row) =>
        row.proposal.payment_date ? (
          <span className="whitespace-nowrap">{formatDate(row.proposal.payment_date, 'full')}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'name',
      header: 'nom',
      render: (_, row) => <span className="font-medium text-fg-strong">{row.proposal.name}</span>,
    },
    {
      key: 'amount',
      header: 'montant',
      numeric: true,
      render: (_, row) => (
        <span className={cn('whitespace-nowrap', row.proposal.kind === 'revenue' && 'text-positive-fg')}>
          {eur(signedFlowAmount(row.proposal.kind, linesTotals(row.proposal.lines).gross))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (_, row) => (
        <div className="flex justify-end gap-1">
          <IconButton
            size="sm"
            icon={Pencil}
            label={`Modifier ${row.proposal.name}`}
            onClick={() => setEditingIndex(row.id)}
          />
          <IconButton
            size="sm"
            icon={X}
            label={`Retirer ${row.proposal.name}`}
            onClick={() => setProposals((prev) => prev.filter((_, j) => j !== row.id))}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <Dialog
        open
        size="lg"
        onClose={onClose}
        title={reviewing ? 'Vérifier les flux générés' : kind === 'revenue' ? 'Générer des revenus' : 'Générer des dépenses'}
        // The description, template and proposals are lost on close, so a
        // stray click on the scrim doesn't close it.
        onInteractOutside={(e) => e.preventDefault()}
        footer={
          reviewing ? (
            <>
              <Button variant="ghost" iconLeft={ArrowLeft} onClick={() => setStep('describe')} disabled={inserting}>
                Retour
              </Button>
              <span className="flex-1" />
              <Button variant="secondary" onClick={onClose} disabled={inserting}>
                Annuler
              </Button>
              <Button onClick={handleInsert} disabled={inserting || proposals.length === 0}>
                {inserting ? 'Insertion…' : `Insérer ${countLabel(proposals.length, 'flux', 'flux')}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={generating}>
                Annuler
              </Button>
              <Button
                iconLeft={Sparkles}
                onClick={handleGenerate}
                disabled={generating || description.trim() === '' || !linesOk}
              >
                {generating ? 'Génération…' : 'Générer'}
              </Button>
            </>
          )
        }
      >
        {reviewing ? (
          <div className="flex flex-col gap-4">
            <p className="type-body-sm text-fg-muted">
              {countLabel(proposals.length, 'flux proposé', 'flux proposés')} (modèle : {model}
              {provider ? ` via ${provider}` : ''}). Modifiez ou retirez des lignes, puis insérez.
            </p>
            <Card padding={false}>
              <DataTable
                compact
                columns={columns}
                rows={proposals.map((proposal, i) => ({ id: i, proposal }))}
                emptyMessage="Toutes les lignes ont été retirées — revenez en arrière pour régénérer."
              />
            </Card>
            {error && (
              <Callout tone="negative" title="Les flux n’ont pas été insérés.">
                {error}
              </Callout>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              label="Règle récurrente"
              hint="L’IA ne génère que les noms et les dates ; la catégorie, le moyen de paiement et les montants ci-dessous s’appliquent à chaque flux."
            >
              <Textarea
                rows={3}
                placeholder="Ex. cotisations sociales ~1000 € par trimestre, payées par domiciliation le 5 du premier mois du trimestre"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={generating}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Catégorie">
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={generating}
                  options={[
                    { value: NONE, label: 'Aucune catégorie' },
                    ...categories.map((c) => ({
                      value: String(c.id),
                      label: `${c.name} (${formatRate(c.tax_deduction_rate)} déductible)`,
                    })),
                  ]}
                />
              </Field>
              <Field label="Moyen de paiement">
                <Select
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  disabled={generating}
                  options={[
                    { value: NONE, label: 'Sans paiement (compte courant associés)' },
                    ...PAYMENT_METHODS.map((m) => ({
                      value: m,
                      label: PAYMENT_METHOD_LABELS[m],
                      disabled: m === 'visa' && account.visa_payment_day == null,
                    })),
                  ]}
                />
              </Field>
            </div>
            <LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
            {!linesOk && (
              <p className="type-body-sm text-negative-fg">
                Un montant ou un taux est illisible — corrigez les cases en rouge.
              </p>
            )}
            {error && (
              <Callout tone="negative" title="La génération a échoué.">
                {error} Reformulez la règle ou réessayez.
              </Callout>
            )}
          </div>
        )}
      </Dialog>

      {editingIndex !== null && proposals[editingIndex] && (
        <FlowForm
          kind={proposals[editingIndex].kind}
          account={account}
          categories={categories}
          ledgerAccounts={ledgerAccounts}
          initialFlow={proposalToFlowRead(proposals[editingIndex], account.id)}
          onCancel={() => setEditingIndex(null)}
          // Writes back into the local proposals - nothing touches the API
          // until the final bulk insert.
          onSubmit={async (payload) => {
            setProposals((prev) => prev.map((p, j) => (j === editingIndex ? payload : p)))
            setEditingIndex(null)
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/FlowBulkEditDialog.tsx',
  'src/components/FlowGenerator.tsx',
```

- [ ] **Step 4: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 23 file(s) checked, 13 legacy file(s) skipped.`

- [ ] **Step 5: Browser walkthrough** (in **Essai redesign**)

- Bulk edit: select two dépenses → "Modifier…" → "Modifier 2 flux" with its description; "Appliquer à 2 flux" stays disabled until a checkbox is ticked; each control is disabled until its checkbox is ticked. **Review Focus 1:** tick Montant, type `12,5x` → "Montant illisible — par exemple 1 234,56." on submit; type `12,5`, TVA `21` → apply → toast "2 flux modifiés."; both flows now carry one line of `12,50` net (expand one). Tick Moyen, pick Visa → the hint about clearing the stored payment date appears.
- Generator: "Générer" → large dialog "Générer des dépenses"; its "Générer" button is disabled until the rule is typed and while a line amount is unreadable. Type `loyer 500 € le 1er de chaque mois pendant 14 mois`, pick a category, net `500`, TVA `0` → "Génération…" → "Vérifier les flux générés": the count, model and provider, a table with full dates (`01 janv. 2027` — the year shows), amounts `−€500,00`.
- If generation fails (no LLM key), the describe step shows "La génération a échoué." with the reason and "Reformulez la règle ou réessayez." — that is the expected error path; note it and skip the review checks below.
- Review: remove a row (X); pencil on a row → nested "Modifier la dépense"; **Review Focus 3:** Escape closes only the nested form; a click on the generator's scrim does nothing; "Retour" returns to the rule with every input intact; "Insérer N flux" → toast "N flux insérés.", the rows appear in the table.
- Projection → pencil on one generated flow → "Supprimer la série" → "Supprimer toute la série ?" → toast "Série supprimée.", all of them are gone.
- `list_console_messages`: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/FlowBulkEditDialog.tsx frontend/src/components/FlowGenerator.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): move the bulk edit and generator to design-system dialogs"
```

---

### Task 8: Catégories

**Files:**
- Modify (full rewrite): `frontend/src/components/CategoriesView.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `PageHeader` (Task 3); `CELL`, `CELL_CONTROL`, `HEAD`, `ROW` (Task 6); `parseDecimal`, `parseNumber`, `rateInput` (Task 1); `describeError`; `listCategories`, `createCategory`, `updateCategory`, `moveCategory` (`{ after_id, before_id }`), `deleteCategory`.
- Produces: `CategoriesView({ accountId })` (props unchanged).

- [ ] **Step 1: Rewrite the view**

`frontend/src/components/CategoriesView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Button, Callout, Card, Icon, IconButton, Input, cn, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { createCategory, deleteCategory, listCategories, moveCategory, updateCategory } from '../api/client'
import type { CategoryCreate, CategoryRead, CategoryUpdate } from '../api/types'
import { describeError } from '../errors'
import { parseDecimal, parseNumber, rateInput } from '../format'
import { CELL, CELL_CONTROL, HEAD, ROW } from './editableTable'
import { PageHeader } from './PageHeader'

interface CategoriesViewProps {
  accountId: number
}

// grip + name + tax rate + vat rate + delete
const COLUMN_COUNT = 5

type DropPos = 'above' | 'below'

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// A rate field is fine blank (reverts, or defaults) or as a readable number.
function rateUnreadable(text: string): boolean {
  return text.trim() !== '' && !Number.isFinite(parseNumber(text))
}

// One inline-editable row. Local drafts are seeded from the fetched category
// and committed on blur or Enter, only when the value actually changed (a
// rejected commit reverts through the refresh that follows).
function CategoryRow({
  category,
  onCommit,
  onDelete,
  onMoveBy,
  dragging,
  dropPos,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: {
  category: CategoryRead
  onCommit: (patch: CategoryUpdate) => Promise<void>
  onDelete: () => Promise<void>
  // Keyboard reordering from the grip: -1 moves up, +1 down.
  onMoveBy: (delta: -1 | 1) => void
  dragging: boolean
  // Where the drop line shows on this row (null = not a drop target now).
  dropPos: DropPos | null
  onDragStart: () => void
  onDragOverRow: (pos: DropPos) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [name, setName] = useState(category.name)
  const [tax, setTax] = useState(rateInput(category.tax_deduction_rate))
  const [vat, setVat] = useState(rateInput(category.vat_deduction_rate))

  useEffect(() => {
    setName(category.name)
    setTax(rateInput(category.tax_deduction_rate))
    setVat(rateInput(category.vat_deduction_rate))
  }, [category])

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === category.name) {
      setName(category.name)
      return
    }
    onCommit({ name: trimmed })
  }

  function commitRate(
    draft: string,
    current: string,
    reset: (v: string) => void,
    key: 'tax_deduction_rate' | 'vat_deduction_rate',
  ) {
    // Unreadable text stays in the field, marked invalid, until corrected.
    if (rateUnreadable(draft)) return
    const value = parseDecimal(draft)
    if (value === null || Number(value) === Number(current)) {
      reset(rateInput(current))
      return
    }
    onCommit({ [key]: value })
  }

  return (
    <TableRow
      className={cn(
        ROW,
        dragging && 'opacity-50',
        // The terracotta drop line, drawn on the cells' top or bottom edge.
        dropPos === 'above' && '[&>td]:shadow-[inset_0_2px_0_var(--clay-500)]',
        dropPos === 'below' && '[&>td]:shadow-[inset_0_-2px_0_var(--clay-500)]',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        onDragOverRow(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below')
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <TableCell className={cn(CELL, 'w-8')}>
        <button
          type="button"
          draggable
          data-grip={category.id}
          onDragStart={(e) => {
            // Firefox only starts a drag that carries data.
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(category.id))
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              onMoveBy(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          aria-label={`Déplacer ${category.name} (flèches haut et bas)`}
          className="inline-flex cursor-grab items-center rounded-xs p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-strong active:cursor-grabbing"
        >
          <Icon icon={GripVertical} size={14} />
        </button>
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          aria-label={`Nom de ${category.name}`}
          className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          numeric
          suffix="%"
          aria-label={`Déduction fiscale de ${category.name}`}
          className={cn(CELL_CONTROL, 'w-28')}
          invalid={rateUnreadable(tax)}
          value={tax}
          onChange={(e) => setTax(e.target.value)}
          onBlur={() => commitRate(tax, category.tax_deduction_rate, setTax, 'tax_deduction_rate')}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          numeric
          suffix="%"
          aria-label={`Déduction TVA de ${category.name}`}
          className={cn(CELL_CONTROL, 'w-28')}
          invalid={rateUnreadable(vat)}
          value={vat}
          onChange={(e) => setVat(e.target.value)}
          onBlur={() => commitRate(vat, category.vat_deduction_rate, setVat, 'vat_deduction_rate')}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={cn(CELL, 'text-right')}>
        <IconButton size="sm" icon={Trash2} label={`Supprimer ${category.name}`} onClick={onDelete} />
      </TableCell>
    </TableRow>
  )
}

// The quick-add row at the bottom. Enter in a field saves, Escape cancels.
function NewCategoryRow({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (payload: CategoryCreate) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [tax, setTax] = useState('100')
  const [vat, setVat] = useState('100')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (saving) return
    if (name.trim() === '') {
      setError('Le nom est obligatoire.')
      return
    }
    if (rateUnreadable(tax) || rateUnreadable(vat)) {
      setError('Un taux est illisible — par exemple 50 ou 12,5.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        tax_deduction_rate: parseDecimal(tax) ?? '100',
        vat_deduction_rate: parseDecimal(vat) ?? '100',
      })
    } catch (err) {
      setError(`La catégorie n’a pas été ajoutée — ${describeError(err)}`)
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (e.key === 'Enter' && target.tagName === 'INPUT') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <>
      <TableRow className="bg-surface-selected hover:bg-surface-selected" onKeyDown={onKeyDown}>
        <TableCell className={CELL} />
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            placeholder="Nouvelle catégorie…"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            numeric
            suffix="%"
            aria-label="Déduction fiscale"
            className={cn(CELL_CONTROL, 'w-28')}
            invalid={rateUnreadable(tax)}
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            numeric
            suffix="%"
            aria-label="Déduction TVA"
            className={cn(CELL_CONTROL, 'w-28')}
            invalid={rateUnreadable(vat)}
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <div className="flex justify-end gap-1">
            <IconButton size="sm" icon={Check} label="Enregistrer la catégorie" onClick={save} disabled={saving} />
            <IconButton size="sm" icon={X} label="Annuler" onClick={onCancel} disabled={saving} />
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="px-4 py-2">
            <p role="alert" className="type-body-sm text-negative-fg">
              {error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function CategoriesView({ accountId }: CategoriesViewProps) {
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Drag-to-reorder state: the row being dragged and where it would drop.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null)
  // Only the latest load may land (switching account quickly).
  const requestSeq = useRef(0)

  async function refresh() {
    const seq = ++requestSeq.current
    try {
      const fetched = await listCategories(accountId)
      if (seq !== requestSeq.current) return
      setCategories(fetched)
      setLoaded(true)
    } catch (err) {
      if (seq === requestSeq.current) setError(`Les catégories n’ont pas pu être chargées — ${describeError(err)}`)
    }
  }

  useEffect(() => {
    setCategories([])
    setLoaded(false)
    setAdding(false)
    setError(null)
    setDraggingId(null)
    setDropTarget(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Runs a mutation so a failure (e.g. a duplicate name) surfaces in the
  // shared error line and the table re-syncs with the server either way.
  async function run(mutation: () => Promise<unknown>) {
    setError(null)
    try {
      await mutation()
    } catch (err) {
      setError(describeError(err))
    }
    await refresh()
  }

  async function createDraft(payload: CategoryCreate) {
    setError(null)
    // Rethrows on failure so NewCategoryRow keeps the draft open with its error.
    await createCategory(accountId, payload)
    setAdding(false)
    toast('Catégorie ajoutée.', { tone: 'positive' })
    await refresh()
  }

  // Hands the dragged (or arrow-moved) row's two new neighbours to the
  // fractional-index move endpoint, then gives the grip its focus back.
  async function moveTo(dragId: number, afterId: number | null, beforeId: number | null) {
    await run(() => moveCategory(accountId, dragId, { after_id: afterId, before_id: beforeId }))
    document.querySelector<HTMLButtonElement>(`[data-grip="${dragId}"]`)?.focus()
  }

  function endDrag() {
    setDraggingId(null)
    setDropTarget(null)
  }

  function commitReorder() {
    const dragId = draggingId
    const target = dropTarget
    endDrag()
    if (dragId == null || target == null || target.id === dragId) return
    // Order of ids without the dragged one; insert it at the target slot.
    const ids = categories.map((c) => c.id).filter((id) => id !== dragId)
    let pos = ids.indexOf(target.id)
    if (target.pos === 'below') pos += 1
    moveTo(dragId, ids[pos - 1] ?? null, ids[pos] ?? null)
  }

  function moveBy(id: number, delta: -1 | 1) {
    const index = categories.findIndex((c) => c.id === id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= categories.length) return
    const rest = categories.map((c) => c.id).filter((x) => x !== id)
    moveTo(id, rest[target - 1] ?? null, rest[target] ?? null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catégories"
        actions={
          <Button iconLeft={Plus} onClick={() => setAdding(true)} disabled={!loaded}>
            Ajouter une catégorie
          </Button>
        }
      />

      {error && (
        <Callout tone="negative" title="Action impossible">
          {error}
        </Callout>
      )}

      {!loaded && !error && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {loaded && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD, 'w-8')}>
                  <span className="sr-only">Ordre</span>
                </TableHead>
                <TableHead className={HEAD}>nom</TableHead>
                <TableHead className={HEAD}>déduction fiscale</TableHead>
                <TableHead className={HEAD}>déduction tva</TableHead>
                <TableHead className={HEAD}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onCommit={(patch) => run(() => updateCategory(accountId, category.id, patch))}
                  onDelete={() =>
                    run(async () => {
                      await deleteCategory(accountId, category.id)
                      toast('Catégorie supprimée.', { tone: 'positive' })
                    })
                  }
                  onMoveBy={(delta) => moveBy(category.id, delta)}
                  dragging={draggingId === category.id}
                  dropPos={dropTarget?.id === category.id ? dropTarget.pos : null}
                  onDragStart={() => setDraggingId(category.id)}
                  onDragOverRow={(pos) => {
                    if (draggingId != null && draggingId !== category.id) {
                      setDropTarget({ id: category.id, pos })
                    }
                  }}
                  onDrop={commitReorder}
                  onDragEnd={endDrag}
                />
              ))}
              {adding && <NewCategoryRow onCancel={() => setAdding(false)} onCreate={createDraft} />}
              {categories.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className={cn(CELL, 'py-10 text-center text-fg-muted')}>
                    Aucune catégorie pour l’instant.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/CategoriesView.tsx',
```

- [ ] **Step 3: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 24 file(s) checked, 12 legacy file(s) skipped.`

- [ ] **Step 4: Browser walkthrough** (in **Essai redesign**)

- "Catégories" with "Ajouter une catégorie" (primary); headers `nom`, `déduction fiscale`, `déduction tva`; rates mono with a `%` suffix (`100`, not `100,00`).
- Add three categories (Enter saves, toast "Catégorie ajoutée."; Escape cancels the draft).
- **Review Focus 1:** set a tax rate to `12,5` → blur → PATCH with `12.5`, the field reads `12,5` after the refresh and after a reload; type `abc` → red border, no PATCH on blur; type `150` → blur → the API rejects it, the Callout "Action impossible" names the error and the field reverts.
- Drag a row by its grip onto another: a terracotta line marks above/below while hovering; drop → the order changes and survives a reload.
- **Review Focus 2:** Tab to a grip, press ↓ → the row moves down one place and the grip keeps focus; ↑ moves it back.
- Delete a category → toast "Catégorie supprimée.".
- **Review Focus 4:** **Essai vide** → "Aucune catégorie pour l’instant.".
- `list_console_messages`: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/CategoriesView.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild catégories on the design system"
```

---

### Task 9: Plan comptable

**Files:**
- Modify (full rewrite): `frontend/src/components/LedgerAccountsView.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `PageHeader` (Task 3); `CELL`, `CELL_CONTROL`, `HEAD`, `ROW` (Task 6); `describeError`, `httpStatus` (Task 1); `listLedgerAccounts`, `createLedgerAccount`, `updateLedgerAccount`, `deleteLedgerAccount`.
- Produces: `LedgerAccountsView({ accountId })` (props unchanged).

- [ ] **Step 1: Rewrite the view**

`frontend/src/components/LedgerAccountsView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Callout, Card, IconButton, Input, Tag, cn, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { createLedgerAccount, deleteLedgerAccount, listLedgerAccounts, updateLedgerAccount } from '../api/client'
import type { LedgerAccountRead } from '../api/types'
import { describeError, httpStatus } from '../errors'
import { CELL, CELL_CONTROL, HEAD, ROW } from './editableTable'
import { PageHeader } from './PageHeader'

interface LedgerAccountsViewProps {
  accountId: number
}

// Belgian PCMN classes. Only 6 and 7 matter for flow lines, but the whole
// chart is definable. Lowercase: they show as tags.
const CLASS_LABELS: Record<number, string> = {
  1: 'capitaux propres',
  2: 'immobilisés',
  3: 'stocks',
  4: 'créances et dettes',
  5: 'trésorerie',
  6: 'charges',
  7: 'produits',
}

// Mirrors the backend's _LEDGER_CODE and the database's two check
// constraints, so a bad code is caught before a round trip.
const CODE_PATTERN = /^[1-7][0-9]*$/

// code + class + name + delete
const COLUMN_COUNT = 4

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// One row: the name is editable in place, committed on blur or Enter only
// when it changed (a rejected commit reverts through the refresh that follows).
function LedgerRow({
  row,
  onRename,
  onDelete,
}: {
  row: LedgerAccountRead
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [name, setName] = useState(row.name)

  useEffect(() => {
    setName(row.name)
  }, [row])

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === row.name) {
      setName(row.name)
      return
    }
    onRename(trimmed)
  }

  return (
    <TableRow className={ROW}>
      <TableCell className={cn(CELL, 'numeric text-fg-strong')}>{row.code}</TableCell>
      <TableCell className={CELL}>
        <Tag>
          {row.pcmn_class} {CLASS_LABELS[row.pcmn_class]}
        </Tag>
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          aria-label={`Nom du compte ${row.code}`}
          className={cn(CELL_CONTROL, 'min-w-48')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={cn(CELL, 'text-right')}>
        <IconButton size="sm" icon={Trash2} label={`Supprimer le compte ${row.code}`} onClick={onDelete} />
      </TableCell>
    </TableRow>
  )
}

export function LedgerAccountsView({ accountId }: LedgerAccountsViewProps) {
  const [rows, setRows] = useState<LedgerAccountRead[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // Only the latest load may land (switching account quickly).
  const requestSeq = useRef(0)

  async function refresh() {
    const seq = ++requestSeq.current
    try {
      const fetched = await listLedgerAccounts(accountId)
      if (seq !== requestSeq.current) return
      setRows(fetched)
      setLoaded(true)
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(`Le plan comptable n’a pas pu être chargé — ${describeError(err)}`)
      }
    }
  }

  useEffect(() => {
    setRows([])
    setLoaded(false)
    setError(null)
    setAddError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Runs a mutation so a failure (e.g. a name cleared to empty, or a delete
  // that no longer applies) surfaces in the shared error line, and the list
  // re-syncs with the server either way.
  async function run(mutation: () => Promise<unknown>) {
    setError(null)
    try {
      await mutation()
    } catch (err) {
      setError(describeError(err))
    }
    await refresh()
  }

  const codeValid = CODE_PATTERN.test(newCode)
  const canAdd = codeValid && newName.trim() !== '' && !adding

  async function add() {
    if (!canAdd) return
    setAdding(true)
    setAddError(null)
    try {
      const created = await createLedgerAccount(accountId, { code: newCode, name: newName.trim() })
      // Re-sort locally rather than refetching: the list is ordered by code.
      setRows((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
      setNewCode('')
      setNewName('')
      toast('Compte ajouté au plan comptable.', { tone: 'positive' })
    } catch (err) {
      setAddError(httpStatus(err) === 409 ? 'Ce code existe déjà.' : describeError(err))
    } finally {
      setAdding(false)
    }
  }

  function addOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  const codeHint =
    newCode !== '' && !codeValid ? 'Un code ne contient que des chiffres et commence par une classe, de 1 à 7.' : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan comptable" />
      <p className="max-w-measure type-body-sm text-fg-muted">
        Les comptes sur lesquels imputer les lignes des flux. La classe est le premier chiffre du code ; elle est
        déduite pour vous.
      </p>

      {error && (
        <Callout tone="negative" title="Action impossible">
          {error}
        </Callout>
      )}

      {!loaded && !error && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {loaded && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD, 'w-28')}>code</TableHead>
                <TableHead className={cn(HEAD, 'w-56')}>classe</TableHead>
                <TableHead className={HEAD}>nom</TableHead>
                <TableHead className={HEAD}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <LedgerRow
                  key={row.id}
                  row={row}
                  onRename={(name) => run(() => updateLedgerAccount(accountId, row.id, { name }))}
                  onDelete={() =>
                    run(async () => {
                      await deleteLedgerAccount(accountId, row.id)
                      toast('Compte retiré du plan comptable.', { tone: 'positive' })
                    })
                  }
                />
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className={cn(CELL, 'py-10 text-center text-fg-muted')}>
                    Aucun compte pour l’instant — ajoutez le premier ci-dessous.
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableCell className={CELL}>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    aria-label="Code du nouveau compte"
                    placeholder="610000"
                    className="numeric"
                    invalid={codeHint !== null}
                    value={newCode}
                    onChange={(e) => {
                      setNewCode(e.target.value.trim())
                      setAddError(null)
                    }}
                    onKeyDown={addOnEnter}
                  />
                </TableCell>
                <TableCell className={CELL}>
                  {codeValid ? (
                    <Tag>
                      {newCode[0]} {CLASS_LABELS[Number(newCode[0])]}
                    </Tag>
                  ) : (
                    <span className="px-2.5 text-fg-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className={CELL}>
                  <Input
                    size="sm"
                    aria-label="Nom du nouveau compte"
                    placeholder="Fournitures"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={addOnEnter}
                  />
                </TableCell>
                <TableCell className={cn(CELL, 'text-right')}>
                  <Button size="sm" iconLeft={Plus} disabled={!canAdd} onClick={add}>
                    Ajouter
                  </Button>
                </TableCell>
              </TableRow>
              {(codeHint || addError) && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMN_COUNT} className="px-4 py-2">
                    <p role="alert" className="type-body-sm text-negative-fg">
                      {addError ?? codeHint}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/LedgerAccountsView.tsx',
```

- [ ] **Step 3: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 25 file(s) checked, 11 legacy file(s) skipped.`

- [ ] **Step 4: Browser walkthrough** (in **Essai redesign**)

- "Plan comptable" with the one-sentence explanation; table `code` (mono), `classe` (tag such as `6 charges`), `nom` (editable), delete; the add row sits at the bottom with "Ajouter" (the page's primary).
- Type code `8` → the hint "Un code ne contient que des chiffres et commence par une classe, de 1 à 7." and "Ajouter" disabled. Type `610000` → the tag previews `6 charges`; name `Fournitures`, Enter → toast "Compte ajouté au plan comptable.", the row is inserted in code order.
- Add `610000` again → "Ce code existe déjà." under the add row.
- Rename a row + Enter → kept; clear it + Enter → reverts. Delete → toast "Compte retiré du plan comptable.".
- **Review Focus 4:** **Essai vide** → "Aucun compte pour l’instant — ajoutez le premier ci-dessous." with the add row below.
- `list_console_messages`: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/LedgerAccountsView.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the plan comptable as an editable table"
```

---

### Task 10: TVA

**Files:**
- Modify (full rewrite): `frontend/src/components/VatView.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `PageHeader` (Task 3); `eur`, `formatDate`, `formatRate` (Task 1); `describeError`; `fetchVat`.
- Produces: `VatView({ account })` (props unchanged).

- [ ] **Step 1: Rewrite the view**

`frontend/src/components/VatView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  Button,
  Callout,
  Card,
  DataTable,
  Segment,
  Select,
  StatCard,
  Tag,
  type DataTableColumn,
} from '@qvanderlinden/ui'
import { fetchVat } from '../api/client'
import type { AccountRead, AccountVat, VatFlow } from '../api/types'
import { describeError } from '../errors'
import { eur, formatDate, formatRate } from '../format'
import { PageHeader } from './PageHeader'

interface VatViewProps {
  account: AccountRead
}

const now = new Date()
const CURRENT_YEAR = now.getFullYear()
const CURRENT_QUARTER = Math.floor(now.getMonth() / 3) + 1
// Next year, this year, and six years back.
const YEARS = Array.from({ length: 8 }, (_, i) => String(CURRENT_YEAR + 1 - i))
const QUARTER_OPTIONS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `T${q}` }))

// Net VAT owed (> 0) reads as money out; a credit (< 0) as money in.
function netTone(net: string): string {
  const n = Number(net)
  if (n > 0) return 'text-negative-fg'
  if (n < 0) return 'text-positive-fg'
  return ''
}

function vatCell(value: string) {
  return Number(value) !== 0 ? eur(value) : <span className="text-fg-subtle">—</span>
}

export function VatView({ account }: VatViewProps) {
  const [vat, setVat] = useState<AccountVat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [quarter, setQuarter] = useState(String(CURRENT_QUARTER))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setVat(null)
    setError(null)
    fetchVat(account.id, Number(year))
      .then((fetched) => {
        if (!cancelled) setVat(fetched)
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [account.id, year, reloadKey])

  const selected = vat?.quarters.find((q) => q.quarter === Number(quarter)) ?? null
  // Flows that carry no VAT (e.g. uncategorized expenses, which recover 0%)
  // add nothing to either total, so they're noise here. Reverse-charge flows
  // are always listed - even one that nets to zero still has to be reported.
  const visibleFlows =
    selected?.flows.filter(
      (f) => f.reverse_charge || Number(f.output_vat) !== 0 || Number(f.deductible_vat) !== 0,
    ) ?? []

  const columns: DataTableColumn<VatFlow>[] = [
    {
      key: 'name',
      header: 'flux',
      render: (_, f) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg-strong">{f.name}</span>
            {f.reverse_charge && <Tag>autoliquidation</Tag>}
          </span>
          <span className="type-body-sm text-fg-muted">
            <span className="numeric">{eur(f.gross_vat)}</span> de TVA
            {f.vat_rate != null ? (
              <>
                {' '}
                à <span className="numeric">{formatRate(f.vat_rate)}</span>
              </>
            ) : (
              ', taux mixtes'
            )}
            {f.kind === 'expense' && (
              <>
                {' · '}
                <span className="numeric">{formatRate(f.deduction_rate)}</span> déductible
              </>
            )}
          </span>
        </div>
      ),
    },
    {
      key: 'invoice_date',
      header: 'date',
      render: (_, f) => <span className="whitespace-nowrap text-fg-muted">{formatDate(f.invoice_date)}</span>,
    },
    { key: 'output_vat', header: 'collectée', numeric: true, render: (_, f) => vatCell(f.output_vat) },
    { key: 'deductible_vat', header: 'déductible', numeric: true, render: (_, f) => vatCell(f.deductible_vat) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="TVA"
        actions={
          <>
            <Select
              size="sm"
              aria-label="Année"
              className="w-28"
              value={year}
              onValueChange={setYear}
              options={YEARS}
            />
            <Segment aria-label="Trimestre" options={QUARTER_OPTIONS} value={quarter} onChange={setQuarter} />
          </>
        }
      />

      {error && (
        <Callout tone="negative" title="La TVA n’a pas pu être chargée.">
          {error}{' '}
          <Button variant="link" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </Callout>
      )}

      {!vat && !error && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {vat && selected && (
        <>
          {!vat.vat_applicable && (
            <Callout tone="warning">Ce compte n’est pas assujetti à la TVA — montants indicatifs.</Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="TVA collectée" value={Number(selected.output_vat)} format="eur" />
            <StatCard label="TVA déductible" value={Number(selected.deductible_vat)} format="eur" />
            <StatCard
              label="TVA nette à payer"
              value={<span className={netTone(selected.net_due)}>{eur(selected.net_due)}</span>}
              footnote={Number(selected.net_due) < 0 ? 'Crédit de TVA' : undefined}
            />
          </div>

          <Card title={`Flux du T${selected.quarter} ${vat.year}`} padding={false}>
            <DataTable
              columns={columns}
              rows={visibleFlows}
              emptyMessage="Aucun flux avec de la TVA ce trimestre."
            />
          </Card>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/VatView.tsx',
```

- [ ] **Step 3: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 26 file(s) checked, 10 legacy file(s) skipped.`

- [ ] **Step 4: Browser walkthrough**

- On a real VAT-registered account (view only): "TVA" with a year `Select` and the `T1 / T2 / T3 / T4` segment (current quarter selected); three stat cards; "TVA nette à payer" in the negative tone when owed, positive with the footnote "Crédit de TVA" for a credit; the card "Flux du T3 2026" lists each flow with its secondary line (`€21,00 de TVA à 21%` · `100% déductible`) and an `autoliquidation` tag where it applies; collectée/déductible right-aligned, "—" for zero. Compare the three figures with `fetch('/api/accounts/<id>/vat?year=2026')` for the same quarter.
- On an account that is not VAT-registered: the warning Callout "Ce compte n’est pas assujetti à la TVA — montants indicatifs."
- **Review Focus 4:** **Essai vide** → three `€0,00` cards and "Aucun flux avec de la TVA ce trimestre.".
- `list_console_messages`: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/VatView.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the TVA view on the design system"
```

---

### Task 11: Comptes annuels

**Files:**
- Modify (full rewrite): `frontend/src/components/AnnualAccountsView.tsx`
- Modify: `frontend/scripts/check-design.mjs`

**Interfaces:**
- Consumes: `PageHeader` (Task 3); `countLabel`, `eur`, `signedEur` (Task 1); `describeError`; `fetchAnnualAccounts`.
- Produces: `AnnualAccountsView({ account })` (props unchanged).

- [ ] **Step 1: Rewrite the view**

`frontend/src/components/AnnualAccountsView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button, Callout, Card, Select, Switch, cn } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { fetchAnnualAccounts } from '../api/client'
import type { AccountRead, AnnualAccounts } from '../api/types'
import { describeError } from '../errors'
import { countLabel, eur, signedEur } from '../format'
import { PageHeader } from './PageHeader'

interface AnnualAccountsViewProps {
  account: AccountRead
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => String(CURRENT_YEAR + 1 - i))

// Figures are signed - revenue positive, expense negative - so the tone
// follows the sign itself, not the account's class.
function signTone(value: string): string {
  const n = Number(value)
  if (n > 0) return 'text-positive-fg'
  if (n < 0) return 'text-negative-fg'
  return ''
}

function hasActivity(current: string, prior: string): boolean {
  return Number(current) !== 0 || Number(prior) !== 0
}

// The three figure cells of a row: N, N-1 and the signed change.
function Figures({ current, prior, delta }: { current: string; prior: string; delta: string }) {
  return (
    <>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(current))}>{eur(current)}</TableCell>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(prior))}>{eur(prior)}</TableCell>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(delta))}>{signedEur(delta)}</TableCell>
    </>
  )
}

export function AnnualAccountsView({ account }: AnnualAccountsViewProps) {
  const [data, setData] = useState<AnnualAccounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [showAll, setShowAll] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetchAnnualAccounts(account.id, Number(year))
      .then((fetched) => {
        if (!cancelled) setData(fetched)
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [account.id, year, reloadKey])

  // The header (year, show-all switch) always renders, so a failed fetch
  // still leaves the year control usable.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comptes annuels"
        actions={
          <>
            <Select
              size="sm"
              aria-label="Année"
              className="w-28"
              value={year}
              onValueChange={setYear}
              options={YEARS}
            />
            <Switch label="tous les comptes" checked={showAll} onCheckedChange={setShowAll} />
          </>
        }
      />

      {error && (
        <Callout tone="negative" title="Les comptes annuels n’ont pas pu être chargés.">
          {error}{' '}
          <Button variant="link" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </Callout>
      )}
      {!error && data === null && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {data && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>compte</TableHead>
                <TableHead className="text-right">{data.year}</TableHead>
                <TableHead className="text-right">{data.year - 1}</TableHead>
                <TableHead className="text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.classes.map((cls) => {
                // Off by default: an account with no activity in either year is
                // noise. One used last year but not this one still shows -
                // an account going to zero is what the comparison is for.
                const rows = showAll ? cls.accounts : cls.accounts.filter((a) => hasActivity(a.current, a.prior))
                if (rows.length === 0) return null
                return [
                  <TableRow key={`class-${cls.pcmn_class}`} className="bg-surface-sunken">
                    <TableCell colSpan={4} className="type-subheading text-fg-strong">
                      {cls.pcmn_class} {cls.label}
                    </TableCell>
                  </TableRow>,
                  ...rows.map((a) => (
                    <TableRow key={a.id} className="hover:bg-surface-hover">
                      <TableCell>
                        <span className="numeric text-fg-muted">{a.code}</span>{' '}
                        <span className="text-fg-body">{a.name}</span>
                      </TableCell>
                      <Figures current={a.current} prior={a.prior} delta={a.delta} />
                    </TableRow>
                  )),
                  <TableRow key={`subtotal-${cls.pcmn_class}`}>
                    <TableCell className="type-label text-fg-strong">Sous-total</TableCell>
                    <Figures current={cls.current_total} prior={cls.prior_total} delta={cls.delta} />
                  </TableRow>,
                ]
              })}

              {/* Shown whatever the switch says: lines booked nowhere must stay
                  visible, or the result looks unexplained. Also shown when
                  unbooked lines net to zero, so the "N lines still unbooked"
                  signal can't hide behind a coincidental zero total. */}
              {(hasActivity(data.unassigned.current, data.unassigned.prior) || data.unassigned.line_count > 0) && (
                <TableRow className="hover:bg-surface-hover">
                  <TableCell className="text-fg-body">
                    Non affecté ({countLabel(data.unassigned.line_count, 'ligne', 'lignes')})
                  </TableCell>
                  <Figures
                    current={data.unassigned.current}
                    prior={data.unassigned.prior}
                    delta={data.unassigned.delta}
                  />
                </TableRow>
              )}

              <TableRow className="border-t-2 border-line-strong bg-surface-sunken font-semibold">
                <TableCell className="type-subheading text-fg-strong">Résultat</TableCell>
                <Figures current={data.result.current} prior={data.result.prior} delta={data.result.delta} />
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Shrink the guard's allowlist**

In `frontend/scripts/check-design.mjs`, delete from `LEGACY`:

```js
  'src/components/AnnualAccountsView.tsx',
```

- [ ] **Step 3: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes; 25 tests pass; `check:design passed: 27 file(s) checked, 9 legacy file(s) skipped.`

- [ ] **Step 4: Browser walkthrough**

- On a real account with booked lines (view only): "Comptes annuels" with the year `Select` and the "tous les comptes" switch; one table in a card: a heading row per PCMN class ("6 Charges"), its accounts (mono code + name), "Sous-total", then "Non affecté (N lignes)" when lines are unbooked, and a bold "Résultat" row under a strong rule. Columns `compte`, the year, the year before, `Δ`; Δ is signed (`+€…` / `−€…`); positive figures olive, negative rust.
- The switch shows accounts without activity; the year `Select` refetches.
- **Review Focus 4:** **Essai vide** → only the "Résultat" row at `€0,00` / `€0,00` / `€0,00` (no "Non affecté" row).
- `list_console_messages`: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/components/AnnualAccountsView.tsx frontend/scripts/check-design.mjs
git commit -m "feat(frontend): rebuild the comptes annuels table on the design system"
```

---

### Task 12: Cleanup — legacy styles, vendored primitives, unused dependencies

**Files:**
- Delete: `frontend/src/styles.css`, `frontend/src/components/ui/` (button, checkbox, dropdown-menu, input, popover, table), `frontend/src/lib/utils.ts`
- Modify (full rewrite): `frontend/src/index.css`, `frontend/src/accountingDisplay.ts`, `frontend/scripts/check-design.mjs`
- Modify: `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/package.json`, `frontend/package-lock.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `src/accountingDisplay.ts` keeps `PAYMENT_METHOD_LABELS`, `paymentMethodLabel` (null → "Sans paiement"), `PAYMENT_METHOD_ICONS`, `todayDateInputValue`, `addMonthsFrom`, `addDaysFrom`, `visaPaymentDate`, `FlowGaps`, `flowGaps`, `isFlowIncomplete`, `flowGapsSummary`, and drops `FLOW_KIND_LABELS`, `amountClass`, `formatAmount`, `formatFlowAmount`, `formatMoney`, `formatDate` (no longer imported anywhere). The guard checks every file in `src/`. The `@/` alias is gone (nothing imports it).

- [ ] **Step 1: Confirm nothing uses what is about to go**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend
grep -rnE "'@/|lib/utils|components/ui|styles\.css|clsx|tailwind-merge|class-variance|@radix-ui|@tanstack" src \
  | grep -vE "^src/(components/ui/|lib/|index\.css)"
grep -rnE "FLOW_KIND_LABELS|amountClass|formatAmount|formatFlowAmount|formatMoney" src | grep -v "^src/accountingDisplay.ts"
grep -rnE "from '\.{1,2}/accountingDisplay'" src | grep formatDate
```

Expected: all three print nothing.

- [ ] **Step 2: Delete the legacy files**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && git rm -r src/styles.css src/components/ui src/lib/utils.ts
```

Replace `frontend/src/index.css` with:

```css
/* Tailwind entry: Tailwind, then the design system's tokens, theme, type
   roles and base styles. fisac defines no colours of its own. */
@import "tailwindcss";
@import "@qvanderlinden/ui/styles.css";
```

- [ ] **Step 3: Trim `accountingDisplay.ts` to business logic**

Replace `frontend/src/accountingDisplay.ts` with:

```ts
// Accounting rules the views share: payment-method labels and icons, date
// arithmetic on ISO dates, the Visa payment cycle, and flow completeness.
// Formatting lives in format.ts.
import { CalendarCheck, CreditCard, Landmark, type LucideIcon } from 'lucide-react'
import type { FlowRead, PaymentMethod } from './api/types'

// French display labels for the English enum members (see api/types.ts).
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  direct_debit: 'Domiciliation',
  bank_transfer: 'Virement',
  visa: 'Visa',
}

// A null payment_method means no payment is actually made (compte courant
// associés) - such a flow has no payment_date and never reaches cashflow.
export function paymentMethodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : 'Sans paiement'
}

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  direct_debit: CalendarCheck,
  bank_transfer: Landmark,
  visa: CreditCard,
}

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayDateInputValue(): string {
  return toInputValue(new Date())
}

export function addMonthsFrom(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return toInputValue(new Date(year, month - 1 + months, day))
}

export function addDaysFrom(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return toInputValue(new Date(year, month - 1, day + days))
}

// The next occurrence of day-of-month `day` on or after `reference` - that
// same month if the day hasn't passed yet, otherwise the next one. Date
// overflow (e.g. day 31 in a 30-day month) rolls into the following month.
function nextDayOfMonth(reference: Date, day: number): Date {
  const candidate = new Date(reference.getFullYear(), reference.getMonth(), day)
  if (candidate >= reference) return candidate
  return new Date(reference.getFullYear(), reference.getMonth() + 1, day)
}

// When a Visa charge is actually debited, in two hops: the invoice first lands
// on a statement (the next closing day on/after it), and that statement is then
// settled on the next payment day on/after it. With closing 25 / payment 5, an
// invoice on Mar 26 closes Apr 25 and is paid May 5; one on Mar 25 closes that
// day and is paid Apr 5. With no closing day the charge is simply debited on
// the next payment day - a single hop, exactly as this worked before. Mirrors
// backend/src/fisac/routers/projection.py's _visa_payment_date.
export function visaPaymentDate(
  invoiceIso: string,
  visaDay: number,
  closingDay?: number | null,
): string {
  const [year, month, day] = invoiceIso.split('-').map(Number)
  const invoice = new Date(year, month - 1, day)
  if (closingDay == null) return toInputValue(nextDayOfMonth(invoice, visaDay))
  const statementClose = nextDayOfMonth(invoice, closingDay)
  return toInputValue(nextDayOfMonth(statementClose, visaDay))
}

// --- Completeness -----------------------------------------------------------

// What the annual accounts need from a flow but it can be missing. A flow with
// no lines is not "unbooked" - there is nothing to book yet - though it can
// still be missing a category.
export interface FlowGaps {
  noCategory: boolean
  unbooked: number
  lineCount: number
}

export function flowGaps(flow: FlowRead): FlowGaps {
  return {
    // No category makes the booking formula read 0% of the VAT as deductible,
    // so the whole VAT is booked as cost. On a revenue flow that over-states
    // the sale - see the known defect in the ledger accounts design doc.
    noCategory: flow.category_id === null,
    // Unbooked lines land in the annual accounts' "unassigned" bucket rather
    // than under any ledger account.
    unbooked: flow.lines.filter((l) => l.ledger_account_id === null).length,
    lineCount: flow.lines.length,
  }
}

export function isFlowIncomplete(flow: FlowRead): boolean {
  const gaps = flowGaps(flow)
  return gaps.noCategory || gaps.unbooked > 0
}

// One line naming every gap, for the row marker's tooltip. Empty when nothing
// is missing.
export function flowGapsSummary(flow: FlowRead): string {
  const gaps = flowGaps(flow)
  const parts: string[] = []
  if (gaps.noCategory) parts.push('sans catégorie')
  if (gaps.unbooked > 0) {
    const s = gaps.unbooked > 1 ? 's' : ''
    parts.push(`${gaps.unbooked} ligne${s} sur ${gaps.lineCount} non imputée${s}`)
  }
  return parts.join(' ; ')
}
```

- [ ] **Step 4: Drop the `@/` alias and the unused dependencies**

In `frontend/vite.config.ts` replace:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
```

with:

```ts
import { defineConfig } from 'vite'
```

and:

```ts
export default defineConfig({
  resolve: {
    // "@/..." import alias used by the vendored shadcn/ui components.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
```

with:

```ts
export default defineConfig({
  plugins: [
```

In `frontend/tsconfig.json` replace:

```json
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
```

with:

```json
    "strict": true
  },
```

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend
source /Users/quentin/projects/personal/fisac/.envrc
npm uninstall @radix-ui/react-checkbox @radix-ui/react-dropdown-menu @radix-ui/react-slot \
  @tanstack/react-table class-variance-authority clsx tailwind-merge
```

`class-variance-authority`, `clsx` and `tailwind-merge` stay installed as dependencies of `@qvanderlinden/ui`. Expected `dependencies` in `frontend/package.json` afterwards:

```json
  "dependencies": {
    "@qvanderlinden/ui": "^0.1.0",
    "@tailwindcss/vite": "^4.3.3",
    "lucide-react": "^1.26.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.3.3"
  },
```

- [ ] **Step 5: Enforce the full guard**

Replace `frontend/scripts/check-design.mjs` with (the `LEGACY` list and its skip/stale logic are gone):

```js
#!/usr/bin/env node
// Design-system compliance guard (Ledger redesign spec, "Verification").
// Scans frontend/src and fails on what @qvanderlinden/ui's rules forbid:
// emoji and glyph icons, raw hex colours, hand-rolled number formatting,
// imports of the old vendored primitives, the system's English-only
// formatDate, window.confirm, and Tailwind default-palette classes (which
// the design system removes, so they silently render nothing).
//
// Run with `npm run check:design`. Exits 1 on any violation.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = join(root, 'src')

const PALETTE =
  'gray|zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Checked line by line.
const LINE_RULES = [
  { name: 'emoji', test: /\p{Extended_Pictographic}/u },
  { name: 'glyph used as an icon (use a Lucide icon)', test: /[▾▸▲▼↕✓✕✎×⚙⚠]/u },
  { name: 'raw hex colour (use a brand utility or token)', test: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/ },
  { name: 'toFixed( (format through src/format.ts)', test: /\.toFixed\(/ },
  { name: 'toLocaleString( (format through src/format.ts)', test: /\.toLocale(?:Date|Time)?String\(/ },
  { name: 'import from the removed components/ui primitives', test: /from\s+['"][^'"]*components\/ui\// },
  { name: 'window.confirm (use a confirmation Dialog)', test: /\b(?:window\.)?confirm\(/ },
  {
    name: 'Tailwind default palette class (removed by the design system)',
    test: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|divide|decoration|shadow|accent|caret|placeholder|from|via|to)-(?:${PALETTE})-\\d{2,3}\\b`),
  },
]

// Checked on the whole file: import lists span several lines.
const DS_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@qvanderlinden\/ui['"]/g

function toPosix(path) {
  return path.split(sep).join('/')
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

const violations = []
let checked = 0

for (const file of walk(srcDir)) {
  const rel = toPosix(relative(root, file))
  checked += 1
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    for (const rule of LINE_RULES) {
      const match = line.match(rule.test)
      if (match) violations.push(`${rel}:${i + 1}: ${rule.name}: ${match[0]}`)
    }
  })
  for (const match of text.matchAll(DS_IMPORT)) {
    if (/\bformatDate\b/.test(match[1])) {
      const line = text.slice(0, match.index).split('\n').length
      violations.push(
        `${rel}:${line}: formatDate imported from @qvanderlinden/ui is English-only; use formatDate from src/format.ts`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  console.error(`\ncheck:design failed: ${violations.length} violation(s).`)
  process.exit(1)
}
console.log(`check:design passed: ${checked} file(s) checked.`)
```

- [ ] **Step 6: Build, test, guard**

Run: `cd /Users/quentin/projects/personal/fisac/.worktrees/redesign/frontend && npm run build && npm run test && npm run check:design`
Expected: build passes (the CSS bundle shrinks to about 76 kB); 25 tests pass; `check:design passed: 28 file(s) checked.`

- [ ] **Step 7: Full regression walkthrough** (hard-reload first)

Every page once on a real account (view only) and in **Essai redesign**: revenus, dépenses (edit in place, quick add, sort, filters, bulk bar, generator, bulk edit, delete confirmation), projection (chart hover and keys, balance dialog, upcoming table, flow dialog), catégories (drag and drop), plan comptable, tva, comptes annuels; the account dialog. Nothing should have changed since its task — the only difference is that `styles.css` is gone, so look for anything that relied on it (unstyled controls, missing spacing). Repeat the narrow check at 375×800 on revenus and projection. `emulate` dark colour scheme → still light. `list_console_messages`: no errors.

Then delete the throwaway accounts: Settings → "Supprimer" → "Supprimer le compte" for **Essai redesign** and **Essai vide**; the selection falls back to a real account.

- [ ] **Step 8: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add frontend/src/index.css frontend/src/accountingDisplay.ts frontend/scripts/check-design.mjs \
  frontend/vite.config.ts frontend/tsconfig.json frontend/package.json frontend/package-lock.json
git status --short   # the git rm deletions from Step 2 are staged; nothing unstaged
git commit -m "refactor(frontend): remove the pre-redesign styles and vendored primitives"
```

---

### Task 13: Docker build secret and CLAUDE.md

**Files:**
- Modify: `Dockerfile`, `CLAUDE.md` (repo root)

**Interfaces:**
- Consumes: `frontend/.npmrc` (already tracked: maps `@qvanderlinden` to `https://npm.pkg.github.com` and reads `${NODE_AUTH_TOKEN}`).
- Produces: the image builds with `docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t fisac .`; the token is never in a layer.

- [ ] **Step 1: Mount the token as a build secret**

In `Dockerfile` replace the syntax line:

```dockerfile
# syntax=docker/dockerfile:1.7
```

with:

```dockerfile
# syntax=docker/dockerfile:1.10
```

(secret mounts with `env=` need Dockerfile frontend 1.10 or later), and replace:

```dockerfile
FROM node:22-slim AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
```

with:

```dockerfile
FROM node:22-slim AS frontend-build
WORKDIR /src
# .npmrc maps @qvanderlinden to GitHub Packages and reads NODE_AUTH_TOKEN.
# The token is a build secret, mounted as an env var for this one step only,
# so it never lands in a layer (secret env mounts need dockerfile:1.10+).
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN npm ci
```

- [ ] **Step 2: Document it in CLAUDE.md**

In `CLAUDE.md` replace:

```markdown
Stack: FastAPI backend on Python 3.14 (`requires-python = ">=3.14"` in
`pyproject.toml`, pinned via `.python-version`), React + Vite frontend
(PWA-capable via vite-plugin-pwa), Postgres via SQLAlchemy 2.x async + asyncpg
+ Alembic, uv for Python deps.

There is no linter, type checker, or test suite configured for the Python side.
The frontend is typechecked by `tsc -b` as part of `npm run build`.
```

with:

```markdown
Stack: FastAPI backend on Python 3.14 (`requires-python = ">=3.14"` in
`pyproject.toml`, pinned via `.python-version`), React + Vite frontend
(PWA-capable via vite-plugin-pwa) built on the `@qvanderlinden/ui` design
system (React 19, Tailwind CSS v4), Postgres via SQLAlchemy 2.x async +
asyncpg + Alembic, uv for Python deps.

There is no linter, type checker, or test suite configured for the Python side.
The frontend is typechecked by `tsc -b` as part of `npm run build`;
`npm run test` runs its vitest unit tests (`src/format.ts`, `src/errors.ts`)
and `npm run check:design` its design-system compliance guard.
```

Replace:

```markdown
  frontend/              # React + Vite, own package.json
    src/
```

with:

```markdown
  frontend/              # React + Vite, own package.json
    src/
    scripts/
      check-design.mjs   # design-system compliance guard (npm run check:design)
```

Replace:

````markdown
# terminal 2 - frontend
cd frontend && npm install && npm run dev   # Vite on :5173, HMR
```
````

with:

````markdown
# terminal 2 - frontend
cd frontend && npm install && npm run dev   # Vite on :5173, HMR
```

The frontend depends on `@qvanderlinden/ui`, published to GitHub Packages:
`frontend/.npmrc` maps the `@qvanderlinden` scope there and reads
`NODE_AUTH_TOKEN`, so `npm install` / `npm ci` need `NODE_AUTH_TOKEN` set to a
GitHub token with `read:packages`. The repo root's gitignored `.envrc` exports
it; direnv loads it in an interactive shell, otherwise `source .envrc` first.
````

Replace:

```markdown
Frontend build/typecheck: `cd frontend && npm run build` (`tsc -b && vite build`).
```

with:

```markdown
Frontend build/typecheck: `cd frontend && npm run build` (`tsc -b && vite build`).

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
```

Replace:

````markdown
```bash
docker build -t fisac .
```
````

with:

````markdown
The frontend stage installs `@qvanderlinden/ui` from GitHub Packages, so the
build needs `NODE_AUTH_TOKEN` in the environment. It is passed as a BuildKit
secret, mounted for the `npm ci` step only, and never lands in an image layer.

```bash
docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t fisac .
```
````

- [ ] **Step 3: Build the image and prove the token stays out**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
source /Users/quentin/projects/personal/fisac/.envrc
docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t fisac:redesign .
docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN --target frontend-build -t fisac-frontend:redesign .
docker history --no-trunc fisac-frontend:redesign | grep -c "$NODE_AUTH_TOKEN"     # expect 0
docker run --rm fisac-frontend:redesign sh -c 'env | grep -c NODE_AUTH_TOKEN; cat /src/.npmrc'
docker run --rm fisac:redesign sh -c 'ls /app/dist/index.html'
```

Expected: both builds succeed; `0` from `docker history`; the run prints `0` and the `.npmrc` with the literal `${NODE_AUTH_TOKEN}` placeholder (not the token); `/app/dist/index.html` exists. If Docker is not available, report the step as BLOCKED rather than skipping it. Remove the images afterwards: `docker image rm fisac:redesign fisac-frontend:redesign`.

- [ ] **Step 4: Final checks**

```bash
cd frontend && npm run build && npm run test && npm run check:design
cd .. && git status --short          # only Dockerfile and CLAUDE.md modified
```

- [ ] **Step 5: Commit**

```bash
cd /Users/quentin/projects/personal/fisac/.worktrees/redesign
git add Dockerfile CLAUDE.md
git commit -m "build: install the design system in Docker through a build secret"
```
