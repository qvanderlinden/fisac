import { useEffect, useState } from 'react'
import {
  deleteFlow,
  deleteFlowBatch,
  fetchProjection,
  getFlow,
  listCategories,
  setFlowPaid,
  updateAccount,
  updateFlow,
} from '../api/client'
import type { AccountProjection, AccountRead, CategoryRead, FlowRead, ProjectionFlow } from '../api/types'
import {
  addMonthsFrom,
  amountClass,
  formatAmount,
  formatDate,
  formatFlowAmount,
  todayDateInputValue,
} from '../accountingDisplay'
import { BalanceChart, type WindowOption } from './BalanceChart'
import { FlowForm } from './FlowForm'

const WINDOW_OPTIONS: WindowOption[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
]

interface ProjectionViewProps {
  account: AccountRead
  // Balance edits happen right here on the projection screen; the updated
  // account must flow back up so the sidebar/settings stay in sync.
  onAccountChange: (account: AccountRead) => void
}

export function ProjectionView({ account, onAccountChange }: ProjectionViewProps) {
  const [projection, setProjection] = useState<AccountProjection | null>(null)
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [windowMonths, setWindowMonths] = useState(3)
  const [editingFlow, setEditingFlow] = useState<FlowRead | null>(null)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)
  const [flowSearch, setFlowSearch] = useState('')
  const [balanceDraft, setBalanceDraft] = useState<string | null>(null)
  const [savingBalance, setSavingBalance] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  async function refresh() {
    const toDate = addMonthsFrom(todayDateInputValue(), windowMonths)
    const [fetched, fetchedCategories] = await Promise.all([
      fetchProjection(account.id, toDate),
      listCategories(account.id),
    ])
    setProjection(fetched)
    setCategories(fetchedCategories)
  }

  useEffect(() => {
    setProjection(null)
    setBalanceDraft(null)
    setBalanceError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, windowMonths])

  async function saveBalance(e: React.FormEvent) {
    e.preventDefault()
    if (balanceDraft === null) return
    setSavingBalance(true)
    setBalanceError(null)
    try {
      const updated = await updateAccount(account.id, { current_balance: balanceDraft })
      onAccountChange(updated)
      setBalanceDraft(null)
      await refresh()
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : 'Failed to save balance')
    } finally {
      setSavingBalance(false)
    }
  }

  async function togglePaid(flow: ProjectionFlow) {
    await setFlowPaid(account.id, flow.id, !flow.paid)
    await refresh()
  }

  async function startEditing(flow: ProjectionFlow) {
    // ProjectionFlow is a thin view; fetch the full flow (lines/category/
    // method) before opening the editor.
    setEditingFlow(await getFlow(account.id, flow.id))
  }

  return (
    <div>
      {!projection && <p className="empty-state">Loading…</p>}

      {projection && (
        <div className="projection">
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Current balance</span>
              {balanceDraft === null ? (
                <button
                  type="button"
                  className="stat-value stat-value-editable"
                  title="Edit balance"
                  onClick={() => setBalanceDraft(projection.starting_balance)}
                >
                  {formatAmount(projection.starting_balance)}
                  <span className="stat-edit-hint">✎</span>
                </button>
              ) : (
                <form className="stat-edit-form" onSubmit={saveBalance}>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceDraft}
                    autoFocus
                    onChange={(e) => setBalanceDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setBalanceDraft(null)
                    }}
                  />
                  <button type="submit" className="btn-primary" disabled={savingBalance}>
                    {savingBalance ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setBalanceDraft(null)}
                    disabled={savingBalance}
                  >
                    Cancel
                  </button>
                </form>
              )}
              {balanceError && <p className="form-error">{balanceError}</p>}
            </div>
            <div className="stat-tile">
              <span className="stat-label">Lowest projected</span>
              <span className="stat-value">
                {formatAmount(
                  projection.points
                    .reduce(
                      (min, p) => Math.min(min, Number(p.balance)),
                      Number(projection.starting_balance),
                    )
                    .toFixed(2),
                )}
              </span>
            </div>
          </div>

          <BalanceChart
            asOf={projection.as_of}
            startingBalance={Number(projection.starting_balance)}
            points={projection.points.map((p) => ({ date: p.date, balance: Number(p.balance) }))}
            windowOptions={WINDOW_OPTIONS}
            selectedWindowMonths={windowMonths}
            onWindowChange={setWindowMonths}
            onHoverPointChange={setHoveredPointIndex}
          />

          <div className="hover-flows">
            {hoveredPointIndex !== null && projection.points[hoveredPointIndex] ? (
              <>
                <h3>Flows on {formatDate(projection.points[hoveredPointIndex].date)}</h3>
                {projection.points[hoveredPointIndex].flows.length === 0 ? (
                  <p className="empty-state">No flows on this day.</p>
                ) : (
                  <ul className="hover-flows-list">
                    {projection.points[hoveredPointIndex].flows.map((flow) => (
                      <li key={flow.id}>
                        <span className="cell-title">{flow.name}</span>
                        <span className={`amount-cell ${amountClass(flow.kind)}`}>
                          {formatFlowAmount(flow.kind, flow.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="empty-state">Hover the chart to see flows for a day.</p>
            )}
          </div>

          <div className="table-wrap">
            <div className="table-wrap-header">
              <h2>Upcoming flows</h2>
              <input
                type="text"
                className="table-search"
                placeholder="Search flows…"
                value={flowSearch}
                onChange={(e) => setFlowSearch(e.target.value)}
              />
            </div>
            {(() => {
              const searchTerm = flowSearch.trim().toLowerCase()
              const rows = projection.points.flatMap((point) =>
                point.flows
                  .filter((flow) => flow.name.toLowerCase().includes(searchTerm))
                  .map((flow) => ({ flow, key: `${point.date}-${flow.id}` })),
              )
              if (projection.points.length === 0) {
                return <p className="empty-state">No upcoming flows in this period.</p>
              }
              if (rows.length === 0) {
                return <p className="empty-state">No flows match “{flowSearch.trim()}”.</p>
              }
              return (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Payment date</th>
                      <th>Name</th>
                      <th className="amount-col">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ flow, key }) => (
                      <tr key={key}>
                        <td>{formatDate(flow.payment_date)}</td>
                        <td className="cell-title">{flow.name}</td>
                        <td className={`amount-cell ${amountClass(flow.kind)}`}>
                          {formatFlowAmount(flow.kind, flow.amount)}
                        </td>
                        <td className="amount-col">
                          <span className="table-row-actions">
                            <button
                              type="button"
                              className="edit-flow-button"
                              onClick={() => startEditing(flow)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={flow.paid ? 'paid-toggle paid' : 'paid-toggle'}
                              onClick={() => togglePaid(flow)}
                            >
                              {flow.paid ? 'Paid ✓' : 'Mark paid'}
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      )}

      {editingFlow && (
        <div className="modal-backdrop" onClick={() => setEditingFlow(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <FlowForm
              kind={editingFlow.kind}
              account={account}
              categories={categories}
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
    </div>
  )
}
