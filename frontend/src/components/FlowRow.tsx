import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { CategoryRead, FlowCreate, FlowKind, FlowRead, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS, amountClass, formatFlowAmount } from '../accountingDisplay'
import { PAYMENT_METHODS } from './FlowForm'
import { LinesEditor, linesToDrafts, linesToPayload, type LineDraft } from './LinesEditor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'

interface FlowRowProps {
  flow: FlowRead
  kind: FlowKind
  categories: CategoryRead[]
  colSpan: number
  // Whether the reverse-charge (autoliquidation) checkbox column is shown.
  showReverseCharge: boolean
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  expanded: boolean
  onToggleExpanded: () => void
  // Persists a partial change (parent merges it onto the full flow payload and
  // PATCHes, then refreshes). Rejects on failure so the row can revert.
  onCommit: (changes: Partial<FlowCreate>) => Promise<void>
  onTogglePaid: () => Promise<void>
  onDelete: () => Promise<void>
}

export function FlowRow({
  flow,
  kind,
  categories,
  colSpan,
  showReverseCharge,
  selected,
  onSelectedChange,
  expanded,
  onToggleExpanded,
  onCommit,
  onTogglePaid,
  onDelete,
}: FlowRowProps) {
  // Header-field drafts, committed on blur/change. Reseeded whenever the flow
  // prop changes (e.g. after a refresh) so a rejected edit reverts to server
  // state.
  const [name, setName] = useState(flow.name)
  const [invoiceDate, setInvoiceDate] = useState(flow.invoice_date)
  const [paymentMethod, setPaymentMethod] = useState<string>(flow.payment_method ?? '')
  const [paymentDate, setPaymentDate] = useState(flow.payment_date ?? '')

  useEffect(() => {
    setName(flow.name)
    setInvoiceDate(flow.invoice_date)
    setPaymentMethod(flow.payment_method ?? '')
    setPaymentDate(flow.payment_date ?? '')
  }, [flow])

  // Line drafts are seeded when the row (re)opens - not on every refresh - so an
  // in-progress line edit isn't clobbered by an unrelated header commit.
  const [lines, setLines] = useState<LineDraft[]>(() => linesToDrafts(flow.lines))
  const [savingLines, setSavingLines] = useState(false)

  useEffect(() => {
    if (expanded) setLines(linesToDrafts(flow.lines))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id, expanded])

  const noPayment = paymentMethod === ''
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === flow.name) {
      setName(flow.name)
      return
    }
    onCommit({ name: trimmed })
  }

  function commitInvoiceDate() {
    if (invoiceDate === '' || invoiceDate === flow.invoice_date) {
      setInvoiceDate(flow.invoice_date)
      return
    }
    onCommit({ invoice_date: invoiceDate })
  }

  function commitPaymentDate() {
    const next = paymentDate || null
    if (next === (flow.payment_date ?? null)) return
    onCommit({ payment_date: next })
  }

  function changeCategory(value: string) {
    onCommit({ category_id: value === '' ? null : Number(value) })
  }

  function changeMethod(value: string) {
    setPaymentMethod(value)
    if (value === '') {
      // No payment method means no payment is made - clear the date too.
      setPaymentDate('')
      onCommit({ payment_method: null, payment_date: null })
    } else {
      onCommit({ payment_method: value as PaymentMethod })
    }
  }

  async function saveLines() {
    setSavingLines(true)
    try {
      await onCommit({ lines: linesToPayload(lines) })
    } finally {
      setSavingLines(false)
    }
  }

  return (
    <>
      <TableRow data-state={selected ? 'selected' : undefined}>
        <TableCell className="flow-expand-cell">
          <button
            type="button"
            className="flow-expand-btn"
            onClick={onToggleExpanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </TableCell>
        <TableCell>
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={`Select ${flow.name}`}
          />
        </TableCell>
        <TableCell>
          <input
            type="text"
            className="cell-input cell-input-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={blurOnEnter}
            aria-label="Name"
          />
        </TableCell>
        <TableCell>
          <select
            className="cell-input"
            value={flow.category_id != null ? String(flow.category_id) : ''}
            onChange={(e) => changeCategory(e.target.value)}
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
            onBlur={commitInvoiceDate}
            aria-label="Invoice date"
          />
        </TableCell>
        <TableCell>
          <select
            className="cell-input"
            value={paymentMethod}
            onChange={(e) => changeMethod(e.target.value)}
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
            onBlur={commitPaymentDate}
            aria-label="Payment date"
          />
        </TableCell>
        <TableCell>
          <div className={`text-right amount-cell ${amountClass(kind)}`}>
            {formatFlowAmount(kind, flow.amount_gross)}
          </div>
        </TableCell>
        {showReverseCharge && (
          <TableCell>
            <div className="flex justify-center">
              <Checkbox
                checked={flow.reverse_charge}
                onCheckedChange={(v) => onCommit({ reverse_charge: v === true })}
                aria-label="Reverse charge"
              />
            </div>
          </TableCell>
        )}
        <TableCell>
          <div className="text-right">
            <button
              type="button"
              className={flow.paid ? 'paid-toggle paid' : 'paid-toggle'}
              onClick={onTogglePaid}
            >
              {flow.paid ? 'Paid ✓' : 'Mark paid'}
            </button>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-right">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${flow.name}`}
            >
              <Trash2 />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="flow-expanded-row hover:bg-transparent">
          <TableCell colSpan={colSpan} className="flow-expanded-cell">
            <LinesEditor lines={lines} onChange={setLines} />
            <div className="flow-expanded-actions">
              <Button size="sm" onClick={saveLines} disabled={savingLines}>
                {savingLines ? 'Saving…' : 'Save lines'}
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
