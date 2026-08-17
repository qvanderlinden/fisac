import { useState } from 'react'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  PaymentMethod,
} from '../api/types'
import {
  FLOW_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  addDaysFrom,
  todayDateInputValue,
  visaPaymentDate,
} from '../accountingDisplay'
import { LinesEditor, emptyLine, linesToPayload, netToGross, type LineDraft } from './LinesEditor'

interface FlowFormProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  initialFlow?: FlowRead
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

function toLineDraft(flow: FlowRead | undefined): LineDraft[] {
  if (!flow || flow.lines.length === 0) {
    return [emptyLine()]
  }
  return flow.lines.map((l) => ({
    description: l.description ?? '',
    amount_net: l.amount_net,
    amount_gross: netToGross(l.amount_net, l.vat_rate),
    basis: 'net' as const,
    vat_rate: l.vat_rate,
  }))
}

export function FlowForm({
  kind,
  account,
  categories,
  initialFlow,
  onSubmit,
  onCancel,
  onDelete,
  onDeleteBatch,
  batchCount,
}: FlowFormProps) {
  const [name, setName] = useState(initialFlow?.name ?? '')
  const [categoryId, setCategoryId] = useState<string>(
    initialFlow?.category_id != null ? String(initialFlow.category_id) : '',
  )
  const [invoiceDate, setInvoiceDate] = useState(initialFlow?.invoice_date ?? todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState<string>(initialFlow?.payment_method ?? '')
  const [paymentDate, setPaymentDate] = useState(initialFlow?.payment_date ?? '')
  const [paid, setPaid] = useState(initialFlow?.paid ?? false)
  const [lines, setLines] = useState<LineDraft[]>(toLineDraft(initialFlow))
  const [offsetDays, setOffsetDays] = useState('30')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noPayment = paymentMethod === ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: FlowCreate = {
        name,
        kind,
        category_id: categoryId === '' ? null : Number(categoryId),
        invoice_date: invoiceDate,
        payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
        payment_date: noPayment ? null : paymentDate || null,
        paid,
        lines: linesToPayload(lines),
      }
      await onSubmit(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(action: (() => Promise<void>) | undefined) {
    if (!action) return
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setSaving(false)
    }
  }

  const kindLabel = FLOW_KIND_LABELS[kind].toLowerCase()

  return (
    <form className="flow-form" onSubmit={handleSubmit}>
      <h2>
        {initialFlow ? 'Edit' : 'New'} {kindLabel}
      </h2>

      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>

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
        <span>Invoice date (fiscal)</span>
        <input
          type="date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          required
        />
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

      {!noPayment && (
        <label className="field">
          <span>Payment date (cashflow)</span>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <span className="autofill-row">
            {paymentMethod === 'visa' && account.visa_payment_day != null && (
              <button
                type="button"
                className="btn-link"
                onClick={() => setPaymentDate(visaPaymentDate(invoiceDate, account.visa_payment_day!))}
              >
                Visa day ({account.visa_payment_day})
              </button>
            )}
            <span className="offset-fill">
              invoice +
              <input
                type="number"
                min="0"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.value)}
              />
              days
              <button
                type="button"
                className="btn-link"
                onClick={() => setPaymentDate(addDaysFrom(invoiceDate, Number(offsetDays) || 0))}
              >
                apply
              </button>
            </span>
          </span>
        </label>
      )}

      <LinesEditor lines={lines} onChange={setLines} />

      <label className="field field-row">
        <span>Paid</span>
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        {onDelete && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => handleDelete(onDelete)}
            disabled={saving}
          >
            Delete
          </button>
        )}
        {onDeleteBatch && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => handleDelete(onDeleteBatch)}
            disabled={saving}
          >
            Delete batch{batchCount != null ? ` (${batchCount})` : ''}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
