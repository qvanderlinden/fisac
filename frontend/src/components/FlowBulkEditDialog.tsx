import { useState } from 'react'
import type { CategoryRead, FlowBulkUpdate, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { PAYMENT_METHODS } from './FlowForm'
import { Checkbox } from '@/components/ui/checkbox'

interface FlowBulkEditDialogProps {
  count: number
  categories: CategoryRead[]
  // Whether the reverse-charge (autoliquidation) toggle is offered.
  showReverseCharge: boolean
  onCancel: () => void
  // Payload carries only the fields the user enabled (see FlowBulkUpdate).
  onApply: (payload: Omit<FlowBulkUpdate, 'flow_ids'>) => Promise<void>
}

// Each editable attribute has an "apply this" toggle: only enabled ones go into
// the payload, so a bulk edit can touch one field or several. Mirrors the
// backend's model_fields_set semantics.
export function FlowBulkEditDialog({
  count,
  categories,
  showReverseCharge,
  onCancel,
  onApply,
}: FlowBulkEditDialogProps) {
  const [applyCategory, setApplyCategory] = useState(false)
  const [categoryId, setCategoryId] = useState('')

  const [applyAmount, setApplyAmount] = useState(false)
  const [amountNet, setAmountNet] = useState('')
  const [vatRate, setVatRate] = useState('21')

  const [applyPayment, setApplyPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')

  const [applyPaid, setApplyPaid] = useState(false)
  const [paid, setPaid] = useState(true)

  const [applyReverseCharge, setApplyReverseCharge] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nothingSelected =
    !applyCategory && !applyAmount && !applyPayment && !applyPaid && !applyReverseCharge

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Omit<FlowBulkUpdate, 'flow_ids'> = {}
    if (applyCategory) payload.category_id = categoryId === '' ? null : Number(categoryId)
    if (applyAmount) {
      payload.amount_net = amountNet
      payload.vat_rate = vatRate.trim() === '' ? '0' : vatRate
    }
    if (applyPayment) payload.payment_method = paymentMethod === '' ? null : (paymentMethod as PaymentMethod)
    if (applyPaid) payload.paid = paid
    if (applyReverseCharge) payload.reverse_charge = reverseCharge

    setSaving(true)
    setError(null)
    try {
      await onApply(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form className="flow-form" onSubmit={handleSubmit}>
          <h2>Edit {count} flow{count === 1 ? '' : 's'}</h2>
          <p className="text-secondary generator-hint">
            Enable a field to apply it to every selected flow. Fields left off are untouched.
          </p>

          <div className="bulk-field">
            <label className="bulk-field-toggle">
              <Checkbox checked={applyCategory} onCheckedChange={(v) => setApplyCategory(v === true)} />
              <span>Category</span>
            </label>
            <select
              value={categoryId}
              disabled={!applyCategory}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({Number(c.tax_deduction_rate)}% tax deductible)
                </option>
              ))}
            </select>
          </div>

          <div className="bulk-field">
            <label className="bulk-field-toggle">
              <Checkbox checked={applyAmount} onCheckedChange={(v) => setApplyAmount(v === true)} />
              <span>Amount</span>
            </label>
            <div className="bulk-amount-inputs">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Net"
                value={amountNet}
                disabled={!applyAmount}
                onChange={(e) => setAmountNet(e.target.value)}
              />
              <span className="bulk-amount-vat">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={vatRate}
                  disabled={!applyAmount}
                  onChange={(e) => setVatRate(e.target.value)}
                />
                % VAT
              </span>
            </div>
          </div>
          {applyAmount && (
            <p className="form-hint">Replaces each selected flow's existing lines with one line.</p>
          )}

          <div className="bulk-field">
            <label className="bulk-field-toggle">
              <Checkbox checked={applyPayment} onCheckedChange={(v) => setApplyPayment(v === true)} />
              <span>Payment method</span>
            </label>
            <select
              value={paymentMethod}
              disabled={!applyPayment}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">No payment (compte courant associés)</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="bulk-field">
            <label className="bulk-field-toggle">
              <Checkbox checked={applyPaid} onCheckedChange={(v) => setApplyPaid(v === true)} />
              <span>Paid status</span>
            </label>
            <select value={paid ? 'paid' : 'unpaid'} disabled={!applyPaid} onChange={(e) => setPaid(e.target.value === 'paid')}>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {showReverseCharge && (
            <div className="bulk-field">
              <label className="bulk-field-toggle">
                <Checkbox
                  checked={applyReverseCharge}
                  onCheckedChange={(v) => setApplyReverseCharge(v === true)}
                />
                <span>Reverse charge</span>
              </label>
              <select
                value={reverseCharge ? 'on' : 'off'}
                disabled={!applyReverseCharge}
                onChange={(e) => setReverseCharge(e.target.value === 'on')}
              >
                <option value="on">Reverse charge</option>
                <option value="off">Normal VAT</option>
              </select>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving || nothingSelected}>
              {saving ? 'Applying…' : `Apply to ${count}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
