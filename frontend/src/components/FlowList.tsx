import { useEffect, useState } from 'react'
import { ListFilter, MoreHorizontal, Plus, Search, Sparkles } from 'lucide-react'
import {
  bulkDeleteFlows,
  bulkUpdateFlows,
  createFlow,
  deleteFlow,
  listCategories,
  listFlows,
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
  PaymentMethod,
} from '../api/types'
import { FLOW_KIND_LABELS, PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { FlowGenerator } from './FlowGenerator'
import { FlowBulkEditDialog } from './FlowBulkEditDialog'
import { FlowRow } from './FlowRow'
import { NewFlowRow } from './NewFlowRow'
import { PAYMENT_METHODS } from './FlowForm'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover } from '@/components/ui/popover'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// chevron + select + name + category + invoice + method + payment date +
// amount + paid + delete. The reverse-charge column (expenses of VAT-registered
// accounts only) adds one more - see columnCount below.
const BASE_COLUMN_COUNT = 10

type SortKey =
  | 'name'
  | 'category'
  | 'invoice_date'
  | 'payment_method'
  | 'payment_date'
  | 'amount'
  | 'paid'
type SortDir = 'asc' | 'desc'
type SortState = { key: SortKey; dir: SortDir } | null

// Each dimension is 'any' (no constraint), 'none' (empty value), or a concrete
// value. All active dimensions are ANDed together (and with the search term).
type FilterState = {
  category: 'any' | 'none' | number
  method: 'any' | 'none' | PaymentMethod
  paid: 'any' | 'paid' | 'unpaid'
}
const NO_FILTERS: FilterState = { category: 'any', method: 'any', paid: 'any' }

// A FlowRead reduced to the editable FlowCreate payload the update endpoint
// wants (full-replace semantics), so a single changed field can be merged on top.
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
    lines: flow.lines.map((l) => ({
      description: l.description,
      amount_net: l.amount_net,
      vat_rate: l.vat_rate,
    })),
  }
}

interface FlowListProps {
  account: AccountRead
  // The Revenues/Expenses tabs each render this component pinned to one kind.
  kind: FlowKind
}

export function FlowList({ account, kind }: FlowListProps) {
  const [flows, setFlows] = useState<FlowRead[]>([])
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
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

  async function refresh() {
    setLoading(true)
    try {
      const [fetchedFlows, fetchedCategories] = await Promise.all([
        listFlows(account.id, kind),
        listCategories(account.id),
      ])
      setFlows(fetchedFlows)
      setCategories(fetchedCategories)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelected(new Set())
    setSearch('')
    setExpandedId(null)
    setSort(null)
    setAdding(false)
    setFilters(NO_FILTERS)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, kind])

  const categoryName = (id: number | null) =>
    id == null ? '' : (categories.find((c) => c.id === id)?.name ?? '')

  const term = search.trim().toLowerCase()
  const activeFilterCount = Object.values(filters).filter((v) => v !== 'any').length

  const filtered = flows.filter((f) => {
    if (term !== '' && !`${f.name} ${categoryName(f.category_id)}`.toLowerCase().includes(term)) {
      return false
    }
    if (filters.category === 'none' && f.category_id !== null) return false
    if (typeof filters.category === 'number' && f.category_id !== filters.category) return false
    if (filters.method === 'none' && f.payment_method !== null) return false
    if (filters.method !== 'any' && filters.method !== 'none' && f.payment_method !== filters.method) {
      return false
    }
    if (filters.paid === 'paid' && !f.paid) return false
    if (filters.paid === 'unpaid' && f.paid) return false
    return true
  })

  function compareBy(a: FlowRead, b: FlowRead, key: SortKey): number {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'category':
        return categoryName(a.category_id).localeCompare(categoryName(b.category_id))
      case 'invoice_date':
        return a.invoice_date.localeCompare(b.invoice_date)
      case 'payment_method':
        return (a.payment_method ?? '').localeCompare(b.payment_method ?? '')
      case 'payment_date': {
        // Explicit null handling: undated flows sort last (ascending). A "~"
        // sentinel + localeCompare doesn't work - locale collation orders
        // punctuation before digits, putting nulls first.
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

  // Sorting is applied to a copy so the fetched (server sort_key) order is
  // preserved as the "natural" state to return to.
  const rows = sort
    ? [...filtered].sort((a, b) => {
        const c = compareBy(a, b, sort.key)
        return sort.dir === 'asc' ? c : -c
      })
    : filtered

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null // third click clears back to natural order
    })
  }

  function sortableHead(key: SortKey, label: string, align?: 'right') {
    const active = sort?.key === key
    return (
      <TableHead
        className={align === 'right' ? 'text-right' : undefined}
        aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={align === 'right' ? 'sort-header sort-header-right' : 'sort-header'}
          onClick={() => toggleSort(key)}
        >
          {label}
          <span className="sort-indicator">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
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
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      // On success this reflects the new value; on failure it reverts the row's
      // drafts to server state.
      await refresh()
    }
  }

  async function togglePaid(flow: FlowRead) {
    setError(null)
    try {
      await setFlowPaid(account.id, flow.id, !flow.paid)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      await refresh()
    }
  }

  async function deleteRow(flow: FlowRead) {
    if (!confirm(`Delete “${flow.name}”?`)) return
    setError(null)
    try {
      await deleteFlow(account.id, flow.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function createDraft(payload: FlowCreate) {
    setError(null)
    // Let NewFlowRow surface failures (keeps the draft open) by rethrowing.
    const created = await createFlow(account.id, payload)
    setAdding(false)
    await refresh()
    // Open the new row so the amount lines can be entered right away.
    setExpandedId(created.id)
  }

  async function runBulk(payload: Omit<FlowBulkUpdate, 'flow_ids'>) {
    await bulkUpdateFlows(account.id, { flow_ids: visibleSelectedIds, ...payload })
    setBulkOpen(false)
    setSelected(new Set())
    await refresh()
  }

  async function quickSetPaid(paid: boolean) {
    setError(null)
    try {
      await runBulk({ paid })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed')
    }
  }

  async function bulkDelete() {
    const n = visibleSelectedIds.length
    if (!confirm(`Delete ${n} selected flow${n === 1 ? '' : 's'}? This cannot be undone.`)) return
    setError(null)
    try {
      await bulkDeleteFlows(account.id, visibleSelectedIds)
      setSelected(new Set())
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed')
    }
  }

  const kindLabel = FLOW_KIND_LABELS[kind]
  const kindLower = kindLabel.toLowerCase()
  const hasSelection = visibleSelectedIds.length > 0
  // Reverse charge (autoliquidation) is a purchase concept, and only relevant
  // for VAT-registered accounts - so the column exists on the Expenses tab only.
  const showReverseCharge = kind === 'expense' && account.vat_applicable
  const columnCount = BASE_COLUMN_COUNT + (showReverseCharge ? 1 : 0)

  return (
    <div className="flows-view">
      <div className="flows-toolbar">
        <div className="flows-toolbar-row">
          <div className="flow-search-wrap">
            <Search className="flow-search-icon" aria-hidden />
            <input
              type="search"
              className="flow-search-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search flows"
            />
          </div>

          <div className="flows-toolbar-actions">
            <Popover
              align="right"
              triggerClassName={activeFilterCount > 0 ? 'toolbar-btn is-active' : 'toolbar-btn'}
              trigger={
                <>
                  <ListFilter className="toolbar-btn-icon" aria-hidden />
                  Filter
                  {activeFilterCount > 0 && <span className="toolbar-badge">{activeFilterCount}</span>}
                </>
              }
            >
              <div className="filter-panel">
                <div className="popover-title">Filters</div>
                <label className="filter-field">
                  <span>Category</span>
                  <select
                    value={typeof filters.category === 'number' ? String(filters.category) : filters.category}
                    onChange={(e) => {
                      const v = e.target.value
                      setFilters((f) => ({ ...f, category: v === 'any' || v === 'none' ? v : Number(v) }))
                    }}
                  >
                    <option value="any">Any</option>
                    <option value="none">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-field">
                  <span>Payment method</span>
                  <select
                    value={filters.method}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, method: e.target.value as FilterState['method'] }))
                    }
                  >
                    <option value="any">Any</option>
                    <option value="none">No payment</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-field">
                  <span>Paid</span>
                  <select
                    value={filters.paid}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, paid: e.target.value as FilterState['paid'] }))
                    }
                  >
                    <option value="any">Any</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </label>
                <div className="popover-footer">
                  <button
                    type="button"
                    className="btn-link"
                    disabled={activeFilterCount === 0}
                    onClick={() => setFilters(NO_FILTERS)}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </Popover>

            <Popover
              align="right"
              triggerClassName="toolbar-btn toolbar-btn-square"
              triggerLabel="Bulk actions"
              trigger={
                <>
                  <MoreHorizontal className="toolbar-btn-icon" aria-hidden />
                  {hasSelection && <span className="toolbar-badge">{visibleSelectedIds.length}</span>}
                </>
              }
            >
              {(close) => (
                <div className="menu">
                  <div className="popover-title">
                    {hasSelection ? `${visibleSelectedIds.length} selected` : 'No rows selected'}
                  </div>
                  <button
                    type="button"
                    className="menu-item"
                    disabled={!hasSelection}
                    onClick={() => {
                      close()
                      quickSetPaid(true)
                    }}
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    disabled={!hasSelection}
                    onClick={() => {
                      close()
                      quickSetPaid(false)
                    }}
                  >
                    Mark unpaid
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    disabled={!hasSelection}
                    onClick={() => {
                      close()
                      setBulkOpen(true)
                    }}
                  >
                    Edit fields…
                  </button>
                  <button
                    type="button"
                    className="menu-item menu-item-danger"
                    disabled={!hasSelection}
                    onClick={() => {
                      close()
                      bulkDelete()
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    disabled={!hasSelection}
                    onClick={() => {
                      close()
                      setSelected(new Set())
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </Popover>

            <button className="btn-secondary" onClick={() => setGenerating(true)}>
              <Sparkles className="toolbar-btn-icon" aria-hidden /> Generate
            </button>
          </div>
        </div>
      </div>

      {loading && flows.length === 0 && <p className="empty-state">Loading…</p>}

      {/* Kept mounted through refreshes (loading flips true briefly on every
          inline edit) so scroll position and focus survive. */}
      {(flows.length > 0 || adding || !loading) && (
        <div className="flows-table-region">
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="flow-expand-cell" />
                  <TableHead>
                    <Checkbox
                      checked={
                        allFilteredSelected
                          ? true
                          : someFilteredSelected
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  {sortableHead('name', 'Name')}
                  {sortableHead('category', 'Category')}
                  {sortableHead('invoice_date', 'Invoice date')}
                  {sortableHead('payment_method', 'Payment method')}
                  {sortableHead('payment_date', 'Payment date')}
                  {sortableHead('amount', 'Amount', 'right')}
                  {showReverseCharge && (
                    <TableHead className="text-center" title="Reverse charge (autoliquidation)">
                      RC
                    </TableHead>
                  )}
                  {sortableHead('paid', 'Paid', 'right')}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((flow) => (
                  <FlowRow
                    key={flow.id}
                    flow={flow}
                    kind={kind}
                    categories={categories}
                    colSpan={columnCount}
                    showReverseCharge={showReverseCharge}
                    selected={selected.has(flow.id)}
                    onSelectedChange={(checked) => toggleSelected(flow.id, checked)}
                    expanded={expandedId === flow.id}
                    onToggleExpanded={() =>
                      setExpandedId((prev) => (prev === flow.id ? null : flow.id))
                    }
                    onCommit={(changes) => commitFlow(flow, changes)}
                    onTogglePaid={() => togglePaid(flow)}
                    onDelete={() => deleteRow(flow)}
                  />
                ))}
                {adding && (
                  <NewFlowRow
                    kind={kind}
                    categories={categories}
                    showReverseCharge={showReverseCharge}
                    onCancel={() => setAdding(false)}
                    onCreate={createDraft}
                  />
                )}
                {rows.length === 0 && !adding && (
                  <TableRow className="hover:bg-transparent">
                    <td colSpan={columnCount} className="text-muted-foreground h-16 text-center">
                      {flows.length === 0
                        ? `No ${kindLower} flows yet.`
                        : 'No flows match your search or filters.'}
                    </td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Sticky to the viewport bottom so it's always reachable. */}
          <button type="button" className="flow-newentry" onClick={() => setAdding(true)}>
            <Plus className="flow-newentry-icon" aria-hidden /> New entry
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {generating && (
        <FlowGenerator
          kind={kind}
          account={account}
          categories={categories}
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
          categories={categories}
          showReverseCharge={showReverseCharge}
          onCancel={() => setBulkOpen(false)}
          onApply={runBulk}
        />
      )}
    </div>
  )
}
