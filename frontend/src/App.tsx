import { useEffect, useState } from 'react'
import { listAccounts } from './api/client'
import type { AccountRead } from './api/types'
import { AccountSwitcher } from './components/AccountSwitcher'
import { CategoriesView } from './components/CategoriesView'
import { FlowList } from './components/FlowList'
import { ProjectionView } from './components/ProjectionView'
import { VatView } from './components/VatView'

type Tab = 'revenues' | 'expenses' | 'categories' | 'projection' | 'vat'

const SELECTED_ACCOUNT_KEY = 'fisac.selectedAccountId'

export default function App() {
  const [accounts, setAccounts] = useState<AccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(() => {
    const stored = localStorage.getItem(SELECTED_ACCOUNT_KEY)
    return stored ? Number(stored) : null
  })
  const [tab, setTab] = useState<Tab>('projection')

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null

  useEffect(() => {
    listAccounts().then((fetched) => {
      setAccounts(fetched)
      setLoading(false)
      setSelectedAccountId((current) =>
        current !== null && fetched.some((a) => a.id === current) ? current : (fetched[0]?.id ?? null),
      )
    })
  }, [])

  useEffect(() => {
    if (selectedAccountId !== null) {
      localStorage.setItem(SELECTED_ACCOUNT_KEY, String(selectedAccountId))
    }
  }, [selectedAccountId])

  const wideTab = tab === 'revenues' || tab === 'expenses' || tab === 'categories'
  const pageClass = wideTab ? 'page page-wide' : tab === 'vat' ? 'page page-fill' : 'page'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Fisac</div>

        <AccountSwitcher
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={setSelectedAccountId}
          onAccountsChange={setAccounts}
        />

        {selectedAccountId !== null && (
          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item${tab === 'revenues' ? ' active' : ''}`}
              onClick={() => setTab('revenues')}
            >
              💰 Revenues
            </button>
            <button
              className={`sidebar-nav-item${tab === 'expenses' ? ' active' : ''}`}
              onClick={() => setTab('expenses')}
            >
              🧾 Expenses
            </button>
            <button
              className={`sidebar-nav-item${tab === 'categories' ? ' active' : ''}`}
              onClick={() => setTab('categories')}
            >
              🏷️ Categories
            </button>
            <button
              className={`sidebar-nav-item${tab === 'projection' ? ' active' : ''}`}
              onClick={() => setTab('projection')}
            >
              📊 Cashflow Projection
            </button>
            <button
              className={`sidebar-nav-item${tab === 'vat' ? ' active' : ''}`}
              onClick={() => setTab('vat')}
            >
              🧮 VAT
            </button>
          </nav>
        )}
      </aside>

      <main className="main-content">
        {/* Revenues/expenses/categories fill the full width; VAT keeps the
            centered width but fills the height so its flows table scrolls
            internally; the projection tab is a plain centered page. */}
        <div className={pageClass}>
          {loading && <p className="empty-state">Loading…</p>}
          {!loading && selectedAccountId === null && (
            <p className="empty-state">No accounts yet. Add one from the sidebar to get started.</p>
          )}
          {!loading && selectedAccount !== null && tab === 'revenues' && (
            <FlowList account={selectedAccount} kind="revenue" />
          )}
          {!loading && selectedAccount !== null && tab === 'expenses' && (
            <FlowList account={selectedAccount} kind="expense" />
          )}
          {!loading && selectedAccount !== null && tab === 'categories' && (
            <CategoriesView accountId={selectedAccount.id} />
          )}
          {!loading && selectedAccount !== null && tab === 'projection' && (
            <ProjectionView
              account={selectedAccount}
              onAccountChange={(updated) =>
                setAccounts((current) => current.map((a) => (a.id === updated.id ? updated : a)))
              }
            />
          )}
          {!loading && selectedAccount !== null && tab === 'vat' && (
            <VatView account={selectedAccount} />
          )}
        </div>
      </main>
    </div>
  )
}
