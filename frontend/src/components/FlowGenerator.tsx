import { useState } from 'react'
import { createFlowsBulk, generateFlows } from '../api/client'
import type { AccountRead, CategoryRead, FlowCreate, FlowKind, FlowRead, PaymentMethod } from '../api/types'
import {
  FLOW_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  amountClass,
  formatDate,
  formatFlowAmount,
} from '../accountingDisplay'
import { FlowForm, PAYMENT_METHODS } from './FlowForm'
import { LinesEditor, emptyLine, linesToPayload, linesTotals, type LineDraft } from './LinesEditor'

type Step = 'describe' | 'generating' | 'review'

interface FlowGeneratorProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  onClose: () => void
  // Called after a successful bulk insert so the parent list can refresh.
  onInserted: () => Promise<void>
}

// Wraps an unsaved FlowCreate proposal as a pseudo-FlowRead so the existing
// FlowForm can edit it - FlowForm only reads name/category/dates/method/paid/
// lines, so the fake id/sort_key fields are never load-bearing.
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
    })),
    amount_net: totals.net.toFixed(2),
    amount_vat: totals.vat.toFixed(2),
    amount_gross: totals.gross.toFixed(2),
  }
}

export function FlowGenerator({ kind, account, categories, onClose, onInserted }: FlowGeneratorProps) {
  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  // Template fields, entered once and applied to every generated occurrence.
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [proposals, setProposals] = useState<FlowCreate[]>([])
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inserting, setInserting] = useState(false)

  const noPayment = paymentMethod === ''

  async function handleGenerate() {
    setStep('generating')
    setError(null)
    try {
      const response = await generateFlows(account.id, { description })
      const templateLines = linesToPayload(lines)
      setProposals(
        response.occurrences.map((occ) => ({
          name: occ.name,
          kind,
          category_id: categoryId === '' ? null : Number(categoryId),
          invoice_date: occ.invoice_date,
          // A "No payment" template nulls the date to satisfy the
          // no-method=>no-date rule; otherwise fall back to the invoice date
          // when the model left payment_date null.
          payment_date: noPayment ? null : (occ.payment_date ?? occ.invoice_date),
          payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
          paid: false,
          lines: templateLines.map((l) => ({ ...l })),
        })),
      )
      setModel(response.model)
      setProvider(response.provider)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStep('describe')
    }
  }

  async function handleInsert() {
    setInserting(true)
    setError(null)
    try {
      await createFlowsBulk(account.id, proposals)
      await onInserted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insert failed')
      setInserting(false)
    }
  }

  const kindLabel = FLOW_KIND_LABELS[kind].toLowerCase()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {step !== 'review' && (
          <div className="flow-form">
            <h2>Generate {kindLabel} flows</h2>
            <label className="field">
              <span>Describe the recurring rule</span>
              <textarea
                rows={3}
                placeholder="e.g. cotisations sociales ~1000€ par trimestre, payées par domiciliation le 5 du premier mois du trimestre"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoFocus
              />
            </label>
            <p className="text-secondary generator-hint">
              The AI generates only the names and dates. Category, payment method and amounts
              below are applied to every generated flow.
            </p>

            <label className="field">
              <span>Category</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({Number(c.tax_deduction_rate)}% tax deductible)
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Payment method</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">No payment (compte courant associés)</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            <LinesEditor lines={lines} onChange={setLines} />

            {error && <p className="form-error">{error}</p>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={step === 'generating'}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerate}
                disabled={step === 'generating' || description.trim() === ''}
              >
                {step === 'generating' ? 'Generating…' : '✨ Generate'}
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="flow-form">
            <h2>Review generated flows</h2>
            <p className="text-secondary generator-hint">
              {proposals.length} proposed flow{proposals.length === 1 ? '' : 's'} (model: {model}
              {provider ? ` via ${provider}` : ''}).
              Edit or remove rows, then insert.
            </p>

            {proposals.length === 0 ? (
              <p className="empty-state">All rows removed — go back to regenerate.</p>
            ) : (
              <div className="table-wrap generator-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice date</th>
                      <th>Payment date</th>
                      <th>Name</th>
                      <th className="amount-col">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((proposal, i) => (
                      <tr key={i}>
                        <td>{formatDate(proposal.invoice_date)}</td>
                        <td>{proposal.payment_date ? formatDate(proposal.payment_date) : '—'}</td>
                        <td className="cell-title">{proposal.name}</td>
                        <td className={`amount-cell ${amountClass(proposal.kind)}`}>
                          {formatFlowAmount(proposal.kind, linesTotals(proposal.lines).gross.toFixed(2))}
                        </td>
                        <td className="amount-col">
                          <span className="table-row-actions">
                            <button type="button" className="edit-flow-button" onClick={() => setEditingIndex(i)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="line-remove"
                              onClick={() => setProposals((prev) => prev.filter((_, j) => j !== i))}
                              aria-label={`Remove ${proposal.name}`}
                            >
                              ×
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep('describe')}
                disabled={inserting}
              >
                Back
              </button>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={inserting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleInsert}
                disabled={inserting || proposals.length === 0}
              >
                {inserting
                  ? 'Inserting…'
                  : `Insert ${proposals.length} flow${proposals.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {editingIndex !== null && proposals[editingIndex] && (
          <div className="modal-backdrop" onClick={() => setEditingIndex(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <FlowForm
                kind={proposals[editingIndex].kind}
                account={account}
                categories={categories}
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
      </div>
    </div>
  )
}
