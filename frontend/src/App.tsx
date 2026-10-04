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
import { frameError } from './errors'
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

// localStorage can throw (blocked site data, private windows) or hold junk;
// the app then simply starts on the first account.
function readStoredAccountId(): number | null {
  try {
    const id = Number(localStorage.getItem(SELECTED_ACCOUNT_KEY))
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function storeAccountId(accountId: number) {
  try {
    localStorage.setItem(SELECTED_ACCOUNT_KEY, String(accountId))
  } catch {
    // Not remembered across reloads; nothing else depends on it.
  }
}

const LOAD_ERROR_LEAD = 'Vérifiez que l’API tourne, puis rechargez la page.'

type AccountDialogState = { account: AccountRead | null } | null

type IncompleteCounts = Record<FlowKind, number>
const NO_INCOMPLETE: IncompleteCounts = { revenue: 0, expense: 0 }

function countIncomplete(flows: FlowRead[]): IncompleteCounts {
  return {
    revenue: flows.filter((f) => f.kind === 'revenue' && isFlowIncomplete(f)).length,
    expense: flows.filter((f) => f.kind === 'expense' && isFlowIncomplete(f)).length,
  }
}

export default function App() {
  const [accounts, setAccounts] = useState<AccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(readStoredAccountId)
  const [tab, setTab] = useState<Tab>('projection')
  const [accountDialog, setAccountDialog] = useState<AccountDialogState>(null)
  // Sidebar counters: incomplete flows per kind, hidden at 0. Keyed by the
  // account they were counted for, so another account's numbers never show.
  const [counted, setCounted] = useState<{ accountId: number; counts: IncompleteCounts } | null>(null)

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null
  const incomplete = counted !== null && counted.accountId === selectedAccountId ? counted.counts : NO_INCOMPLETE

  useEffect(() => {
    listAccounts()
      .then((fetched) => {
        setAccounts(fetched)
        setSelectedAccountId((current) =>
          current !== null && fetched.some((a) => a.id === current) ? current : (fetched[0]?.id ?? null),
        )
      })
      .catch((err) => setLoadError(frameError(err, { client: LOAD_ERROR_LEAD, other: LOAD_ERROR_LEAD })))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedAccountId !== null) storeAccountId(selectedAccountId)
  }, [selectedAccountId])

  // Recounted on every account or page change, so edits made elsewhere (e.g.
  // a category set from the projection's flow dialog) show up on the badges.
  useEffect(() => {
    if (selectedAccountId === null) return
    const accountId = selectedAccountId
    let cancelled = false
    listFlows(accountId)
      .then((flows) => {
        if (!cancelled) setCounted({ accountId, counts: countIncomplete(flows) })
      })
      // The counters are a hint. A failed count keeps this account's previous
      // badges (never another account's) and the views report their own load errors.
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

  // A list reports its own count after each load, keeping the badge in step
  // with edits. It applies only to the account it was counted for: a report
  // that arrives after the account changed must not touch another account's
  // numbers (the recount above supplies those).
  function reportIncomplete(accountId: number, kind: FlowKind, count: number) {
    setCounted((c) =>
      c !== null && c.accountId === accountId ? { ...c, counts: { ...c.counts, [kind]: count } } : c,
    )
  }

  function incompleteCount(value: Tab): number {
    return value === 'revenues' ? incomplete.revenue : value === 'expenses' ? incomplete.expense : 0
  }

  const navItems: SidebarItem[] = selectedAccount
    ? NAV.flatMap((g) => [
        { group: g.group },
        ...g.tabs.map((t) => {
          const count = incompleteCount(t.value)
          return { value: t.value, label: t.label, icon: t.icon, badge: count > 0 ? count : undefined }
        }),
      ])
    : []

  // The narrow-screen page picker has no badge column, so the count joins the label.
  const pageOptions = NAV.flatMap((g) =>
    g.tabs.map((t) => {
      const count = incompleteCount(t.value)
      return {
        value: t.value,
        label:
          count > 0 ? (
            <span>
              {t.label} · <span className="numeric">{count}</span>
            </span>
          ) : (
            t.label
          ),
      }
    }),
  )

  const switcher = (
    <AccountSwitcher
      accounts={accounts}
      // Only a loaded account counts as selected: while accounts load (or fail
      // to), the stored id would otherwise show a Settings button that opens nothing.
      selectedAccountId={selectedAccount?.id ?? null}
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
        {/* Below 760px the sidebar folds into this bar, which stays on screen
            while the page scrolls; the breadcrumbs only fit above it. */}
        <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-line-hairline bg-surface-page px-4 py-3 min-[760px]:hidden">
          {switcher}
          {selectedAccount && (
            <Select
              aria-label="Page"
              value={tab}
              onValueChange={(value) => setTab(value as Tab)}
              options={pageOptions}
            />
          )}
        </div>
        <div className="sticky top-0 z-10 hidden border-b border-line-hairline bg-surface-page px-8 py-3 min-[760px]:block">
          <Breadcrumbs items={crumbs} />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-4 min-[760px]:p-8">
          {loading && <p className="type-body-sm text-fg-muted">Chargement…</p>}
          {!loading && loadError && (
            <Callout tone="negative" title="Les comptes n’ont pas pu être chargés.">
              {loadError}
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
            <FlowList
              account={selectedAccount}
              kind="revenue"
              onIncompleteCountChange={(n) => reportIncomplete(selectedAccount.id, 'revenue', n)}
            />
          )}
          {!loading && selectedAccount !== null && tab === 'expenses' && (
            <FlowList
              account={selectedAccount}
              kind="expense"
              onIncompleteCountChange={(n) => reportIncomplete(selectedAccount.id, 'expense', n)}
            />
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
