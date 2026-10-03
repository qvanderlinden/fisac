# Ledger redesign — design

Date: 2026-10-03
Status: approved, not yet implemented
Branch: `redesign` (from `main`, carries `@qvanderlinden/ui@0.1.0` and `frontend/.npmrc`)

## Goal

Rebuild the fisac frontend on the user's design system `@qvanderlinden/ui`
(React 19 components on shadcn/Radix and Tailwind CSS v4), following the
**Ledger** UI kit in its Storybook (`Kits / Ledger`: dashboard, transactions,
budgets, settings, add-transaction dialog). Same features and data — no
backend change — but each view adopts the system's patterns where they fit
(`StatCard`, `DataTable`, `Segment`, `Callout`, `EmptyState`, `Dialog`,
toasts), so some layouts change, not just the styling.

The package's own rules (`node_modules/@qvanderlinden/ui/SKILL.md` and
`docs/brand.md`) bind every screen: components first, then the restyled
primitives; brand utilities only, never raw colours; type through roles; every
figure mono and tabular; Lucide icons, no emoji; one terracotta (primary)
action per view; lowercase navigation, tabs, tags and eyebrows, sentence case
for headings and buttons; errors say what happened and what to do.

## Scope

In scope: every view on `main` — the shell and account management, revenus /
dépenses (flows), projection, catégories, plan comptable, TVA, comptes annuels —
plus the flow dialogs (generator, bulk edit, flow form) and the Docker build.

Out of scope:

- The IPP calculator. It lives on the unmerged `feat/ipp-calculator`; that
  branch adopts the design later in its own migration.
- The older `design` branch (one styling commit); this redesign supersedes it.
- New screens or information architecture (no dashboard, no merging of
  revenus and dépenses).
- Dark mode: the design system is light-only, so fisac drops it.
- Backend and API changes.

## Decisions

| Topic | Decision |
|---|---|
| Depth | Re-skin plus the system's view patterns (option B of the brainstorm) |
| Dark mode | Dropped; light only, as the system |
| Language | All French (`lang="fr"`) |
| Account selector | Top of the sidebar, under the logo |
| Sidebar counters | Incomplete flows on revenus / dépenses, hidden at 0 |
| Flows table | Keeps editing in place, built from the system's primitives |
| Projection chart | fisac's own chart kept, restyled with the system's tokens |
| Migration | Foundation first, then view by view, in a separate worktree |

## Foundation

- **Styles.** A Tailwind entry `src/index.css`: `@import "tailwindcss";` then
  `@import "@qvanderlinden/ui/styles.css";`. `main.tsx` imports
  `@qvanderlinden/ui/fonts.css` and renders `<Toaster />` once at the root.
  `styles.css` and `shadcn.css` shrink as views migrate and are deleted at
  the end. fisac's own styling (projection chart, editable tables, drag
  handles) uses brand utilities and tokens only (`bg-surface-*`, `text-fg-*`,
  `border-line-*`, the system's radii and 4px spacing) — no raw hex.
- **Theme.** Light only: the `prefers-color-scheme: dark` blocks go. PWA
  manifest `theme_color` = terracotta (`--clay-600`, #B04A2A) and
  `background_color` = cream (`--cream-100`, #F9F5ED) — the manifest is the one
  place a literal colour is unavoidable. `index.html` gets `lang="fr"` and the
  system's favicon.
- **Formatting** in one module, `src/format.ts`, replacing the formatting half
  of `accountingDisplay.ts`:
  - money: the system's `formatEur` (`€84 210,00`, U+202F groups, true minus
    `−€42,50`); replaces every `toFixed`, `formatMoney`, `formatAmount`,
    `formatFlowAmount` and `toLocaleString` money call. Money is mono and
    right-aligned; income olive, expenses ink, as in the kit;
  - dates: the system's `formatDate` is English-only, so `format.ts` adds a
    French equivalent with the same three brand styles — `04 oct.` (tables),
    `août 2026` (lists), `novembre 2026` (prose). Upstream candidate: a
    `locale` option on the system's `formatDate`;
  - typed numbers: the system's `parseNumber` (comma or dot decimals).
- **Copy.** French throughout; lowercase navigation, tabs, tags, eyebrows;
  sentence case for headings and buttons; no emoji (the 7 nav emoji and ✨ go)
  and no glyph icons (⚙ ▾ ▸ ⚠ ✓ ✕ ✎ ▲▼↕ × become Lucide icons).
- **Feedback.** `window.confirm()` becomes a confirmation `Dialog`; successful
  actions raise a `toast()` (sentence ending in a full stop, e.g. "Flux
  enregistrés.").

## Shell and navigation

- **Sidebar**: `SidebarNav`, `tone="cream"`, fixed 236px, sticky.
  - Header: `Logo` (horizontal lockup), then the account selector — a system
    `Select` (account name + balance in mono) — with two `IconButton`s:
    `Settings` (edit) and `Plus` (create), both opening the account form in a
    `Dialog`.
  - Items, grouped (eyebrows lowercase):
    - **flux** — revenus (`TrendingUp`, badge = incomplete count),
      dépenses (`Receipt`, badge = incomplete count), projection (`LineChart`);
    - **comptabilité** — catégories (`Tags`), plan comptable (`BookOpen`),
      tva (`Percent`), comptes annuels (`Library`).
  - Badges hidden at 0. No footer. View switching stays `useState` (no
    router).
- **Top bar** (sticky, hairline below): `Breadcrumbs` "fisac / ‹compte› /
  ‹page›", lowercase.
- **Page header pattern**: serif title (`type-title`) and the view's actions on
  the right — at most one `primary` Button per view, the rest `secondary` or
  `ghost`. Content column fluid with 32px padding.
- **States**: no account → `EmptyState` (`Wallet`, "Aucun compte.", action
  "Créer un compte"); loading → a short muted line.
- **Narrow screens** (< 760px): the sidebar folds into a top bar holding the
  account selector and the navigation as a `Select`; no horizontal page
  scroll.

## Views

### Revenus / dépenses

One component per `kind`, as today.

- **Header**: title, "Générer" (`secondary`, `Sparkles`), "Ajouter un flux"
  (`primary`).
- **Toolbar** (inline, as in the kit — the system has no Popover): search
  `Input` with a `Search` icon ("Rechercher un flux"); three `Select`s —
  catégorie, moyen de paiement, payé; an "incomplets" toggle `Tag` with its
  count; a "Réinitialiser" ghost button when a filter is active.
- **Bulk actions bar** (the system has no DropdownMenu): shown above the table
  while rows are selected — "N sélectionnés" and Marquer payé, Marquer impayé,
  Modifier…, Supprimer, Annuler.
- **Editable table** from the system's primitives (`Table`, `Input`, `Select`,
  `Checkbox` from `@qvanderlinden/ui/primitives`), styled like the kit's
  `DataTable` (mono uppercase headers, hairlines, 4% row hover). Columns:
  incomplete marker (`TriangleAlert` + `Tooltip` naming what's missing),
  expand chevron, select checkbox, nom, catégorie, date de facture, moyen de
  paiement, date de paiement, montant (mono, right, olive for revenus),
  autoliquidation (only where applicable), payé (a clickable `Badge`: "payé"
  positive / "à payer" warning), delete `IconButton`.
- **Kept interactions**: sortable headers (Lucide arrows, `aria-sort`), edit
  in cell (commit on blur or Enter), quick-add row (Enter saves, Escape
  cancels), expandable line editor, select-all with indeterminate state.
- **Dialogs** (system `Dialog`): generator (3 steps, `size="lg"`, review step
  in a `DataTable`), bulk edit (each field behind an enabling `Checkbox`),
  full flow form (opened from the projection), delete confirmation. Fields go
  through `Field` (label, hint, error).
- **Line editor**: same inputs, system components; totals through
  `formatEur`; "Ajouter une ligne" as a ghost Button with `Plus`.

### Catégories

Same editable table pattern. Drag-and-drop reordering kept (HTML5 drag,
`GripVertical` handle, terracotta drop line, `moveCategory` as today). Rates
mono with `%`.

### Plan comptable

The div list becomes an editable primitive `Table`: code (mono), PCMN class
as a `Tag`, name editable in place; the add row stays at the bottom; a 409
reads "Ce code existe déjà." inline.

### Projection (default view)

- **Header**: title, `Segment` "3m / 6m / 1a".
- **Two `StatCard`s**: "Solde actuel" (`formatEur`) with an `IconButton`
  (`Pencil`) opening a small `Dialog` to edit it — replaces the click-to-edit
  tile; "Plus bas projeté", accented (terracotta) when negative — the view's
  one accent.
- **Chart**: fisac's own step chart, kept for its interactions (hover and
  keyboard to show a day's flows, "voir en tableau"), restyled with the
  system's tokens — series `--chart-1` (terracotta), grid lines 9% ink, axis
  labels 10px mono, area fill 10%, negative zone in the rust status tone,
  figures through `format.ts`. Upstream candidate: a hover callback on the
  system's `LineChart`.
- **Flux à venir**: a `Card` with `padding={false}` holding a `DataTable`
  (date, nom, moyen as a Lucide icon, montant, payé `Badge`, actions), the
  search in the card header; edit opens the flow `Dialog`.

### TVA

Header: title, year `Select`, `Segment` "T1 / T2 / T3 / T4". Not
VAT-registered → `Callout` tone `warning`: "Ce compte n'est pas assujetti à la
TVA — montants indicatifs.". Three `StatCard`s — TVA collectée, TVA
déductible, TVA nette à payer (negative tone when owed, positive for a
credit). Quarter flows in a `DataTable` (flux with its secondary line, date,
collectée, déductible); reverse charge as a `Tag` "autoliquidation".

### Comptes annuels

Header: title, year `Select`, `Switch` "tous les comptes". The CSS grid
becomes a primitive `Table`: a row per PCMN class heading, subtotals, "non
affecté (N lignes)", and a bold "Résultat" row. Columns: compte (mono code +
name), N, N−1, Δ (signed, negative / positive tones).

### Account management

The account form (`AccountForm`) in a `Dialog`: `Field`s for nom, solde
actuel, jours Visa (paiement, clôture, with their hint); `Switch`es for
société and assujetti TVA (the latter only for a société); delete through a
confirmation `Dialog`.

## Cleanup

- Delete `src/styles.css`, `src/shadcn.css`, the vendored `src/components/ui/`
  (button, checkbox, dropdown-menu, input, popover, table) and the `@/`
  alias if nothing uses it anymore.
- Remove unused dependencies: `@tanstack/react-table` (already unused), and
  `@radix-ui/react-checkbox`, `@radix-ui/react-dropdown-menu`,
  `@radix-ui/react-slot`, `class-variance-authority`, `clsx`,
  `tailwind-merge` if nothing imports them after the vendored primitives go.
- `accountingDisplay.ts` keeps only business logic (completeness, Visa
  dates, payment-method labels translated to French and icons); formatting
  lives in `format.ts`.
- **Docker**: the frontend stage copies `frontend/.npmrc` and runs `npm ci`
  with `RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN`; the
  image is built with `docker build --secret
  id=node_auth_token,env=NODE_AUTH_TOKEN .`. The token never lands in a layer.
  `CLAUDE.md` documents the new build command and the `.npmrc` /
  `NODE_AUTH_TOKEN` requirement for `npm install`.

## Workspace

Implementation happens on `redesign` in a separate worktree
(`.worktrees/redesign`), so the main checkout — where the user's dev server
runs — stays usable. The main checkout must leave `redesign` first (git
won't check out a branch twice), e.g. back to `feat/ipp-calculator`.

## Verification

fisac has no frontend tests and the redesign changes no logic, so each phase
ends with:

1. `cd frontend && npm run build` (`tsc -b` + `vite build`).
2. A compliance guard, `frontend/scripts/check-design.mjs` (run by
   `npm run check:design`), failing on: an emoji, a raw hex colour in `src/`
   outside the manifest, `toFixed(` or `toLocaleString(` in `src/`, an import
   from `components/ui/` once that folder is gone.
3. A browser walkthrough of the migrated views on a real account (Chrome
   DevTools), compared with the Ledger kit: every interaction (edit in place,
   quick add, sort, filters, bulk actions, drag-and-drop, generator, dialogs,
   chart hover) and a narrow viewport.

Backend tests are untouched.

## Phases

1. Foundation, `format.ts`, shell and navigation, account selector and
   account dialog, compliance guard.
2. Projection (chart included).
3. Revenus / dépenses: editable table, line editor, generator, bulk edit,
   flow form.
4. Catégories and plan comptable.
5. TVA and comptes annuels.
6. Cleanup (old CSS, vendored primitives, dependencies) and Docker.

Each phase leaves the app building and every migrated view working; views
not yet migrated may look off under the new reset until their phase.
