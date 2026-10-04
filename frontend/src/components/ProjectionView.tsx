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
  listFlows,
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
import { RELOAD_LEAD, frameError } from '../errors'
import { MAX_AMOUNT, amountInput, eur, formatDate, isBadAmount, parseDecimal, signedFlowAmount } from '../format'
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
  const invalid = value === null || isBadAmount(draft, { signed: true, max: MAX_AMOUNT })

  function requestClose() {
    if (!saving) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (value === null || invalid) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateAccount(account.id, { current_balance: value })
      toast('Solde enregistré.', { tone: 'positive' })
      await onSaved(updated)
    } catch (err) {
      setError(frameError(err))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={requestClose}
      title="Solde actuel"
      // The typed value is lost on close, so a stray click on the scrim doesn't
      // close it; Escape, the close button and "Annuler" do. While the save
      // runs nothing closes it: a failure arriving late must stay visible.
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => saving && e.preventDefault()}
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
          label={
            <>
              Solde au <span className="numeric">{formatDate(asOf, 'full')}</span>
            </>
          }
          error={submitted && invalid ? 'Montant illisible ou trop grand — par exemple 1 234,56.' : undefined}
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
  // The window `projection` was fetched for: the chart draws its horizon from
  // this, so a failed switch never stretches the old points over a new window.
  const [loadedWindowMonths, setLoadedWindowMonths] = useState(3)
  const [editingFlow, setEditingFlow] = useState<FlowRead | null>(null)
  const [editingBatchCount, setEditingBatchCount] = useState<number | undefined>(undefined)
  const [editingBalance, setEditingBalance] = useState(false)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)
  const [flowSearch, setFlowSearch] = useState('')
  // Only the latest request may land: switching account or window quickly
  // must not let an older, slower response overwrite a newer one.
  const requestSeq = useRef(0)
  // What is selected right now. refresh() runs from callbacks that outlive the
  // render that made them (after a save, a toggle), so it reads the selection
  // here rather than from its closure; a late call loads the current account
  // and window, never the one it was created for.
  const selection = useRef({ accountId: account.id, windowMonths })
  useEffect(() => {
    selection.current = { accountId: account.id, windowMonths }
  })

  async function refresh() {
    const seq = ++requestSeq.current
    const { accountId, windowMonths: months } = selection.current
    const toDate = addMonthsFrom(todayDateInputValue(), months)
    try {
      const [fetched, fetchedCategories, fetchedLedgerAccounts] = await Promise.all([
        fetchProjection(accountId, toDate),
        listCategories(accountId),
        listLedgerAccounts(accountId),
      ])
      if (seq !== requestSeq.current) return
      setProjection(fetched)
      setLoadedWindowMonths(months)
      setCategories(fetchedCategories)
      setLedgerAccounts(fetchedLedgerAccounts)
      setLoadError(null)
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(frameError(err, { client: RELOAD_LEAD }))
    }
  }

  // A new account starts from a blank screen rather than the previous
  // account's figures; a new window keeps the old figures until the new ones land.
  useEffect(() => {
    setProjection(null)
    setLoadError(null)
    setHoveredPointIndex(null)
    setFlowSearch('')
  }, [account.id])

  // Also when the account's balance or Visa days change (the account dialog
  // edits them while this view is showing): the projection derives from them.
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, windowMonths, account.current_balance, account.visa_payment_day, account.visa_closing_day])

  async function togglePaid(flow: ProjectionFlow) {
    try {
      await setFlowPaid(account.id, flow.id, !flow.paid)
      toast(flow.paid ? 'Flux marqué à payer.' : 'Flux marqué payé.', { tone: 'positive' })
    } catch (err) {
      toast(`Le statut n’a pas été modifié. ${frameError(err, { client: RELOAD_LEAD })}`, { tone: 'negative' })
    }
    await refresh()
  }

  async function startEditing(flow: ProjectionFlow) {
    const accountId = account.id
    // ProjectionFlow is a thin view; fetch the full flow (lines, category,
    // method) before opening the editor.
    try {
      const full = await getFlow(accountId, flow.id)
      // The editor offers "Supprimer la série (N)": count the series' flows.
      // Without the count (the fetch failed) the button simply omits it.
      let batchCount: number | undefined
      if (full.batch_id != null) {
        try {
          batchCount = (await listFlows(accountId)).filter((f) => f.batch_id === full.batch_id).length
        } catch {
          // The count is optional: the editor opens without it.
        }
      }
      // A late answer after an account switch must not open the editor on
      // the account now shown.
      if (selection.current.accountId !== accountId) return
      setEditingBatchCount(batchCount)
      setEditingFlow(full)
    } catch (err) {
      if (selection.current.accountId !== accountId) return
      toast(`Le flux n’a pas pu être ouvert. ${frameError(err, { client: RELOAD_LEAD })}`, { tone: 'negative' })
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

  const loadFailure = loadError ? (
    <Callout tone="negative" title="La projection n’a pas pu être chargée.">
      {loadError}{' '}
      <Button variant="link" onClick={refresh}>
        Réessayer
      </Button>
    </Callout>
  ) : null

  if (projection === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {loadFailure ?? <p className="type-body-sm text-fg-muted">Chargement…</p>}
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
      render: (_, row) => (
        <span className="numeric whitespace-nowrap">{formatDate(row.flow.payment_date, 'full')}</span>
      ),
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
            // The name starts with the visible text (WCAG 2.5.3).
            aria-label={`${row.flow.name} : ${row.flow.paid ? 'payé' : 'à payer'} — marquer ${row.flow.paid ? 'à payer' : 'payé'}`}
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

      {loadFailure}

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
          footnote={
            lowest.date === projection.as_of ? (
              'aujourd’hui'
            ) : (
              <>
                le <span className="numeric">{formatDate(lowest.date, 'full')}</span>
              </>
            )
          }
        />
      </div>

      <BalanceChart
        asOf={projection.as_of}
        startingBalance={Number(projection.starting_balance)}
        points={projection.points.map((p) => ({ date: p.date, balance: Number(p.balance) }))}
        nextFlowDate={projection.next_flow_date}
        windowMonths={loadedWindowMonths}
        onHoverPointChange={setHoveredPointIndex}
      >
        <div className="border-t border-line-hairline px-6 py-4">
          {hovered ? (
            <>
              <p className="type-eyebrow text-fg-subtle">
                flux du <span className="numeric">{formatDate(hovered.date, 'full')}</span>
              </p>
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
            // No day is picked: the empty period, or the chart's starting point
            // (the current balance, before any flow).
            <p className="type-body-sm text-fg-muted">
              {projection.points.length === 0 ? 'Aucun flux sur la période.' : 'Solde actuel, avant les flux de la période.'}
            </p>
          )}
        </div>
      </BalanceChart>

      <Card
        title="Flux à venir"
        actions={
          <Input
            size="sm"
            icon={Search}
            name="flow-search"
            aria-label="Rechercher un flux"
            placeholder="Rechercher un flux"
            className="w-40 sm:w-56"
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
            searchTerm !== ''
              ? `Aucun flux ne correspond à « ${flowSearch.trim()} ».`
              : 'Aucun flux à venir sur la période.'
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
          batchCount={editingBatchCount}
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
