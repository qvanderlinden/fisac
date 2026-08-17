import { useState } from 'react'
import type { CategoryRead, FlowCreate, FlowKind, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS, todayDateInputValue } from '../accountingDisplay'
import { PAYMENT_METHODS } from './FlowForm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'

interface NewFlowRowProps {
  kind: FlowKind
  categories: CategoryRead[]
  // Whether the reverse-charge (autoliquidation) checkbox column is shown.
  showReverseCharge: boolean
  onCancel: () => void
  // Persists the draft (parent POSTs, then opens the new row for line entry).
  // Rejects on failure so the draft stays put with its error shown.
  onCreate: (payload: FlowCreate) => Promise<void>
}

// An unsaved flow rendered as an inline table row (added via the header's "Add"
// button). Header fields are entered here; amount lines are added after saving,
// by expanding the created row.
export function NewFlowRow({
  kind,
  categories,
  showReverseCharge,
  onCancel,
  onCreate,
}: NewFlowRowProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noPayment = paymentMethod === ''

  async function save() {
    if (name.trim() === '') {
      setError('Name is required')
      return
    }
    if (invoiceDate === '') {
      setError('Invoice date is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        kind,
        category_id: categoryId === '' ? null : Number(categoryId),
        invoice_date: invoiceDate,
        payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
        payment_date: noPayment ? null : paymentDate || null,
        paid,
        reverse_charge: showReverseCharge ? reverseCharge : false,
        lines: [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <TableRow className="flow-draft-row hover:bg-transparent" onKeyDown={onKeyDown}>
      <TableCell className="flow-expand-cell" />
      <TableCell />
      <TableCell>
        <input
          type="text"
          className="cell-input cell-input-name"
          placeholder={`New ${kind}…`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
        />
      </TableCell>
      <TableCell>
        <select
          className="cell-input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category"
        >
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <input
          type="date"
          className="cell-input"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          aria-label="Invoice date"
        />
      </TableCell>
      <TableCell>
        <select
          className="cell-input"
          value={paymentMethod}
          onChange={(e) => {
            setPaymentMethod(e.target.value)
            if (e.target.value === '') setPaymentDate('')
          }}
          aria-label="Payment method"
        >
          <option value="">No payment</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <input
          type="date"
          className="cell-input"
          value={paymentDate}
          disabled={noPayment}
          onChange={(e) => setPaymentDate(e.target.value)}
          aria-label="Payment date"
        />
      </TableCell>
      <TableCell>
        <div className="text-right text-muted-foreground">—</div>
      </TableCell>
      {showReverseCharge && (
        <TableCell>
          <div className="flex justify-center">
            <Checkbox
              checked={reverseCharge}
              onCheckedChange={(v) => setReverseCharge(v === true)}
              aria-label="Reverse charge"
            />
          </div>
        </TableCell>
      )}
      <TableCell>
        <div className="text-right">
          <button
            type="button"
            className={paid ? 'paid-toggle paid' : 'paid-toggle'}
            onClick={() => setPaid((p) => !p)}
          >
            {paid ? 'Paid ✓' : 'Mark paid'}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flow-draft-actions">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} aria-label="Cancel">
            ✕
          </Button>
        </div>
        {error && <p className="flow-draft-error">{error}</p>}
      </TableCell>
    </TableRow>
  )
}
