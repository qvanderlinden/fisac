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
import { RELOAD_LEAD, frameError } from '../errors'
import { countLabel } from '../format'
import { ConfirmDialog } from './ConfirmDialog'
import { CELL, HEAD } from './editableTable'
import { FlowBulkEditDialog } from './FlowBulkEditDialog'
import { FlowGenerator } from './FlowGenerator'
import { mergeFlowChanges, replaceFlow } from './flowPayload'
import { PAYMENT_METHODS } from './flowOptions'
import { FlowRow } from './FlowRow'
import { NewFlowRow } from './NewFlowRow'
import { PageHeader } from './PageHeader'
import { createSerialQueue } from './serialQueue'

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
  // The last mutation that failed, and the last load that failed.
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // null = natural (server sort_key) order.
  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS)
  const [deleting, setDeleting] = useState<FlowRead | null>(null)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)
  // Only the latest load may land (switching account quickly).
  const requestSeq = useRef(0)
  // Every mutation (inline commit, paid toggle, lines save, create, delete,
  // bulk change) runs through this queue, one at a time, each awaiting its
  // refresh. An inline commit PATCHes the whole flow, so it is built from the
  // freshest copy (flowsRef), which an earlier queued commit has just refreshed;
  // two quick edits (a blur-commit and a click) then cannot overwrite each other.
  const [enqueue] = useState(createSerialQueue)
  const flowsRef = useRef<FlowRead[]>([])
  // What is shown right now. refresh() runs from callbacks that outlive the
  // render that made them (after a save, a toggle, a delete), so it reads the
  // account, the kind and the report callback here rather than from its
  // closure; a late call loads and reports the current account, never the
  // one it was created for.
  const latest = useRef({ accountId: account.id, kind, report: onIncompleteCountChange })
  useEffect(() => {
    latest.current = { accountId: account.id, kind, report: onIncompleteCountChange }
  })

  async function refresh() {
    const seq = ++requestSeq.current
    const { accountId, kind: kindToLoad } = latest.current
    try {
      const [fetchedFlows, fetchedCategories, fetchedLedgerAccounts] = await Promise.all([
        listFlows(accountId, kindToLoad),
        listCategories(accountId),
        listLedgerAccounts(accountId),
      ])
      if (seq !== requestSeq.current) return
      flowsRef.current = fetchedFlows
      setFlows(fetchedFlows)
      setCategories(fetchedCategories)
      setLedgerAccounts(fetchedLedgerAccounts)
      setLoaded(true)
      setLoadError(null)
      latest.current.report?.(fetchedFlows.filter(isFlowIncomplete).length)
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(frameError(err, { client: RELOAD_LEAD }))
    }
  }

  // A failure that comes back after the account changed belongs to the
  // previous account: it must not show on this one.
  function reportError(accountId: number, message: string) {
    if (latest.current.accountId === accountId) setError(message)
  }

  useEffect(() => {
    flowsRef.current = []
    setFlows([])
    setLoaded(false)
    setSelected(new Set())
    setSearch('')
    setOnlyIncomplete(false)
    setExpandedId(null)
    setSort(null)
    setAdding(false)
    setFilters(NO_FILTERS)
    setGenerating(false)
    setBulkOpen(false)
    setDeleting(null)
    setConfirmingBulkDelete(false)
    setError(null)
    setLoadError(null)
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
      case 'payment_method': {
        // By the French label the column shows; "sans paiement" (null) sorts last (ascending).
        if (a.payment_method === b.payment_method) return 0
        if (a.payment_method === null) return 1
        if (b.payment_method === null) return -1
        return PAYMENT_METHOD_LABELS[a.payment_method].localeCompare(PAYMENT_METHOD_LABELS[b.payment_method], 'fr')
      }
      case 'payment_date': {
        // Explicit null handling: undated flows sort last (ascending).
        if (a.payment_date === b.payment_date) return 0
        if (a.payment_date === null) return 1
        if (b.payment_date === null) return -1
        return a.payment_date.localeCompare(b.payment_date)
      }
      case 'amount':
        // The unsigned size: orders by magnitude on both pages (expenses show as negative, revenues positive).
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

  function sortableHead(key: SortKey, label: string, align?: 'right', expansion?: string) {
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
          {expansion ? (
            <>
              <span aria-hidden="true">{label}</span>
              <span className="sr-only">{expansion}</span>
            </>
          ) : (
            label
          )}
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

  // Saves one inline change. The payload is built inside the queued task from
  // the freshest copy of the flow, not from the render-time `flow`. Resolves
  // to whether the server accepted the change.
  function commitFlow(flow: FlowRead, changes: Partial<FlowCreate>): Promise<boolean> {
    const accountId = account.id
    return enqueue(async () => {
      setError(null)
      try {
        const base =
          (latest.current.accountId === accountId ? flowsRef.current.find((f) => f.id === flow.id) : undefined) ?? flow
        const saved = await updateFlow(accountId, flow.id, mergeFlowChanges(base, changes))
        // Even if the reload below fails, the next commit on this row starts
        // from what was just saved, not from the value before it.
        if (latest.current.accountId === accountId) flowsRef.current = replaceFlow(flowsRef.current, saved)
        return true
      } catch (err) {
        reportError(accountId, `« ${flow.name} » n’a pas été enregistré. ${frameError(err)}`)
        return false
      } finally {
        // Shows the new value on success; on failure the row reverts itself.
        await refresh()
      }
    })
  }

  function togglePaid(flow: FlowRead): Promise<void> {
    const accountId = account.id
    return enqueue(async () => {
      setError(null)
      try {
        const saved = await setFlowPaid(accountId, flow.id, !flow.paid)
        if (latest.current.accountId === accountId) flowsRef.current = replaceFlow(flowsRef.current, saved)
      } catch (err) {
        reportError(
          accountId,
          `Le statut de « ${flow.name} » n’a pas été modifié. ${frameError(err, { client: RELOAD_LEAD })}`,
        )
      } finally {
        await refresh()
      }
    })
  }

  // Clears the search and filters first, so the saved flow and its opened
  // lines editor are not hidden by a filter that excludes it.
  function startAdding() {
    setSearch('')
    setOnlyIncomplete(false)
    setFilters(NO_FILTERS)
    setAdding(true)
  }

  function createDraft(payload: FlowCreate): Promise<void> {
    const accountId = account.id
    setError(null)
    // NewFlowRow shows failures itself (and keeps the draft) when this rejects.
    return enqueue(async () => {
      const created = await createFlow(accountId, payload)
      setAdding(false)
      toast('Flux ajouté.', { tone: 'positive' })
      await refresh()
      // Open the new row so its amount lines can be entered right away.
      setExpandedId(created.id)
    })
  }

  function runBulk(payload: Omit<FlowBulkUpdate, 'flow_ids'>): Promise<void> {
    const accountId = account.id
    const ids = visibleSelectedIds
    return enqueue(async () => {
      await bulkUpdateFlows(accountId, { flow_ids: ids, ...payload })
      setBulkOpen(false)
      setSelected(new Set())
      toast(`${countLabel(ids.length, 'flux modifié', 'flux modifiés')}.`, { tone: 'positive' })
      await refresh()
    })
  }

  async function quickSetPaid(paid: boolean) {
    const accountId = account.id
    setError(null)
    try {
      await runBulk({ paid })
    } catch (err) {
      reportError(
        accountId,
        `La sélection n’a pas été modifiée. ${frameError(err, { client: RELOAD_LEAD })}`,
      )
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
            <Button iconLeft={Plus} onClick={startAdding} disabled={!loaded}>
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
          {/* One inline run: the Tag lays its children out as flex items, which drop a bare space. */}
          <span>
            incomplets <span className="numeric">{incompleteCount}</span>
          </span>
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
            <span className="numeric">{visibleSelectedIds.length}</span>{' '}
            {visibleSelectedIds.length > 1 ? 'sélectionnés' : 'sélectionné'}
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

      {loadError && (
        <Callout tone="negative" title="Les flux n’ont pas pu être chargés.">
          {loadError}{' '}
          <Button variant="link" onClick={refresh}>
            Réessayer
          </Button>
        </Callout>
      )}

      {error && (
        <Callout tone="negative" title="Action impossible.">
          {error}
        </Callout>
      )}

      {!loaded && !loadError && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {/* Kept mounted through refreshes (every inline edit refetches) so
          scroll position and focus survive. */}
      {loaded && (
        <Card padding={false} className="@container">
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
                {sortableHead('payment_method', 'moyen', undefined, 'moyen de paiement')}
                {sortableHead('payment_date', 'date de paiement')}
                {sortableHead('amount', 'montant', 'right')}
                {showReverseCharge && (
                  <TableHead className={cn(HEAD, 'text-center')}>
                    <span aria-hidden="true">autoliq.</span>
                    <span className="sr-only">autoliquidation</span>
                  </TableHead>
                )}
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
            await enqueue(refresh)
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
          onConfirm={() => {
            const accountId = account.id
            const flowId = deleting.id
            return enqueue(async () => {
              await deleteFlow(accountId, flowId)
              toast('Flux supprimé.', { tone: 'positive' })
              await refresh()
            })
          }}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmDialog
          title={`Supprimer ${countLabel(visibleSelectedIds.length, 'flux', 'flux')} ?`}
          description="Les flux sélectionnés seront supprimés définitivement."
          confirmLabel="Supprimer"
          onClose={() => setConfirmingBulkDelete(false)}
          onConfirm={() => {
            const accountId = account.id
            const ids = visibleSelectedIds
            return enqueue(async () => {
              await bulkDeleteFlows(accountId, ids)
              setSelected(new Set())
              toast(`${countLabel(ids.length, 'flux supprimé', 'flux supprimés')}.`, { tone: 'positive' })
              await refresh()
            })
          }}
        />
      )}
    </div>
  )
}
