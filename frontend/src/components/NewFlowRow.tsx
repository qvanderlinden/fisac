import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Checkbox, IconButton, Input, Select, cn } from '@qvanderlinden/ui'
import { TableCell, TableRow } from '@qvanderlinden/ui/primitives'
import type { AccountRead, CategoryRead, FlowCreate, FlowKind, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS, todayDateInputValue } from '../accountingDisplay'
import { frameError } from '../errors'
import { CELL, CELL_CONTROL } from './editableTable'
import { PAYMENT_METHODS } from './FlowForm'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

interface NewFlowRowProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  colSpan: number
  // Whether the reverse-charge (autoliquidation) column is shown.
  showReverseCharge: boolean
  onCancel: () => void
  // Persists the draft (the parent POSTs, then opens the new row for line
  // entry). Rejects on failure so the draft stays put with its error shown.
  onCreate: (payload: FlowCreate) => Promise<void>
}

// The quick-add row at the bottom of the flows table. Header fields are
// entered here; amount lines are added after saving, in the expanded row.
// Enter in a field saves, Escape cancels.
export function NewFlowRow({
  kind,
  account,
  categories,
  colSpan,
  showReverseCharge,
  onCancel,
  onCreate,
}: NewFlowRowProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(NONE)
  const [invoiceDate, setInvoiceDate] = useState(todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState(NONE)
  const [paymentDate, setPaymentDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noPayment = paymentMethod === NONE
  const isVisa = paymentMethod === 'visa'

  async function save() {
    if (saving) return
    if (name.trim() === '') {
      setError('Le nom est obligatoire.')
      return
    }
    if (invoiceDate === '') {
      setError('La date de facture est obligatoire.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        kind,
        category_id: categoryId === NONE ? null : Number(categoryId),
        invoice_date: invoiceDate,
        payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
        payment_date: noPayment || isVisa ? null : paymentDate || null,
        paid,
        reverse_charge: showReverseCharge ? reverseCharge : false,
        lines: [],
      })
    } catch (err) {
      setError(`Le flux n’a pas été ajouté. ${frameError(err)}`)
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    // Keys pressed in an open Select's list (rendered in a portal) still
    // bubble here through React; only keys from the row's own fields count.
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (e.key === 'Enter' && target.tagName === 'INPUT') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <>
      <TableRow className="bg-surface-selected hover:bg-surface-selected" onKeyDown={onKeyDown}>
        <TableCell className={CELL} />
        <TableCell className={CELL} />
        <TableCell className={CELL} />
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            placeholder={kind === 'revenue' ? 'Nouveau revenu…' : 'Nouvelle dépense…'}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Catégorie"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: NONE, label: 'Aucune' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            type="date"
            aria-label="Date de facture"
            className={CELL_CONTROL}
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Moyen de paiement"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={paymentMethod}
            onValueChange={(value) => {
              setPaymentMethod(value)
              if (value === NONE || value === 'visa') setPaymentDate('')
            }}
            options={[
              { value: NONE, label: 'Sans paiement' },
              ...PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
                disabled: m === 'visa' && account.visa_payment_day == null,
              })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          {noPayment || isVisa ? (
            <span className="px-2.5 text-fg-subtle">
              <span aria-hidden="true">—</span>
              <span className="sr-only">
                {isVisa ? 'Date calculée selon le cycle Visa du compte' : 'Aucune date de paiement'}
              </span>
            </span>
          ) : (
            <Input
              size="sm"
              type="date"
              aria-label="Date de paiement"
              className={CELL_CONTROL}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'text-right type-body-sm text-fg-subtle')}>lignes après ajout</TableCell>
        {showReverseCharge && (
          <TableCell className={cn(CELL, 'text-center')}>
            <Checkbox
              checked={reverseCharge}
              onCheckedChange={(v) => setReverseCharge(v === true)}
              aria-label="Autoliquidation"
            />
          </TableCell>
        )}
        <TableCell className={CELL}>
          <Badge asChild tone={paid ? 'positive' : 'warning'}>
            <button type="button" className="cursor-pointer" onClick={() => setPaid((p) => !p)}>
              {paid ? 'payé' : 'à payer'}
            </button>
          </Badge>
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <div className="flex justify-end gap-1">
            <IconButton size="sm" icon={Check} label="Enregistrer le flux" onClick={save} disabled={saving} />
            <IconButton size="sm" icon={X} label="Annuler" onClick={onCancel} disabled={saving} />
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="px-4 py-2">
            <p role="alert" className="type-body-sm text-negative-fg">
              {error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
