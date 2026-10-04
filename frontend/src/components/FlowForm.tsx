import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Callout, Checkbox, Dialog, Field, Input, Select } from '@qvanderlinden/ui'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
  PaymentMethod,
} from '../api/types'
import { PAYMENT_METHOD_LABELS, addDaysFrom, todayDateInputValue, visaPaymentDate } from '../accountingDisplay'
import { frameError } from '../errors'
import { formatDate, formatRate } from '../format'
import { ConfirmDialog } from './ConfirmDialog'
import { LinesEditor, linesToDrafts, linesToPayload, linesValid, type LineDraft } from './LinesEditor'

interface FlowFormProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  initialFlow?: FlowRead
  // Rejects to keep the dialog open with the error shown.
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

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

type Confirming = 'delete' | 'batch' | null

// The full flow editor in a Dialog: header fields, lines and paid state. Used
// from the projection and the generator's review step. Mount it only while it
// should be open.
export function FlowForm({
  kind,
  account,
  categories,
  ledgerAccounts,
  initialFlow,
  onSubmit,
  onCancel,
  onDelete,
  onDeleteBatch,
  batchCount,
}: FlowFormProps) {
  const formId = useId()
  const [name, setName] = useState(initialFlow?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    initialFlow?.category_id != null ? String(initialFlow.category_id) : NONE,
  )
  const [invoiceDate, setInvoiceDate] = useState(initialFlow?.invoice_date ?? todayDateInputValue())
  const [paymentMethod, setPaymentMethod] = useState<string>(initialFlow?.payment_method ?? NONE)
  const [paymentDate, setPaymentDate] = useState(initialFlow?.payment_date ?? '')
  const [paid, setPaid] = useState(initialFlow?.paid ?? false)
  const [lines, setLines] = useState<LineDraft[]>(() => linesToDrafts(initialFlow?.lines ?? []))
  const [offsetDays, setOffsetDays] = useState('30')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)

  const noPayment = paymentMethod === NONE
  const isVisa = paymentMethod === 'visa'
  const nameMissing = name.trim() === ''
  const dateMissing = invoiceDate === ''
  const linesOk = linesValid(lines)

  function requestClose() {
    if (!saving) onCancel()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (nameMissing || dateMissing || !linesOk) return
    const payload: FlowCreate = {
      name: name.trim(),
      kind,
      category_id: categoryId === NONE ? null : Number(categoryId),
      invoice_date: invoiceDate,
      payment_method: noPayment ? null : (paymentMethod as PaymentMethod),
      // Visa flows never store a payment date; the projection derives it.
      payment_date: noPayment || isVisa ? null : paymentDate || null,
      paid,
      // PATCH replaces the whole flow: carry reverse charge through untouched.
      reverse_charge: initialFlow?.reverse_charge ?? false,
      lines: linesToPayload(lines),
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(frameError(err))
      setSaving(false)
    }
  }

  const title = initialFlow
    ? kind === 'revenue'
      ? 'Modifier le revenu'
      : 'Modifier la dépense'
    : kind === 'revenue'
      ? 'Nouveau revenu'
      : 'Nouvelle dépense'

  const categoryOptions = [
    { value: NONE, label: 'Aucune catégorie' },
    ...categories.map((c) => ({
      value: String(c.id),
      // One wrapper: the Select item is a flex row with a gap, which would
      // pull the figure away from its parentheses.
      label: (
        <span>
          {c.name} (<span className="numeric">{formatRate(c.tax_deduction_rate)}</span> déductible)
        </span>
      ),
    })),
  ]
  const methodOptions = [
    { value: NONE, label: 'Sans paiement (compte courant associés)' },
    ...PAYMENT_METHODS.map((m) => ({
      value: m,
      label:
        m === 'visa' && account.visa_payment_day == null
          ? `${PAYMENT_METHOD_LABELS[m]} (jour Visa du compte à définir)`
          : PAYMENT_METHOD_LABELS[m],
      disabled: m === 'visa' && account.visa_payment_day == null,
    })),
  ]

  return (
    <>
      <Dialog
        open
        size="lg"
        onClose={requestClose}
        title={title}
        // Typed values are lost on close, so a stray click on the scrim
        // doesn't close it; Escape, the close button and "Annuler" do. While
        // the save runs nothing closes it: a failure arriving late must stay visible.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
        footer={
          <>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                iconLeft={Trash2}
                onClick={() => setConfirming('delete')}
                disabled={saving}
              >
                Supprimer
              </Button>
            )}
            {onDeleteBatch && (
              <Button type="button" variant="ghost" onClick={() => setConfirming('batch')} disabled={saving}>
                <span>
                  Supprimer la série
                  {batchCount != null && (
                    <>
                      {' ('}
                      <span className="numeric">{batchCount}</span>
                      {')'}
                    </>
                  )}
                </span>
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nom" error={submitted && nameMissing ? 'Le nom est obligatoire.' : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Catégorie">
              <Select value={categoryId} onValueChange={setCategoryId} options={categoryOptions} />
            </Field>
            <Field
              label="Date de facture"
              hint="Date fiscale."
              error={submitted && dateMissing ? 'La date de facture est obligatoire.' : undefined}
            >
              <Input type="date" className="numeric" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Moyen de paiement">
              <Select value={paymentMethod} onValueChange={setPaymentMethod} options={methodOptions} />
            </Field>
            {!noPayment && !isVisa && (
              <Field label="Date de paiement" hint="Date du mouvement de trésorerie.">
                <Input type="date" className="numeric" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </Field>
            )}
          </div>

          {isVisa && (
            <p className="type-body-sm text-fg-muted">
              {account.visa_payment_day != null && invoiceDate !== '' ? (
                <>
                  Payée le{' '}
                  <span className="numeric">
                    {formatDate(visaPaymentDate(invoiceDate, account.visa_payment_day, account.visa_closing_day), 'full')}
                  </span>
                  , selon le cycle Visa du compte.
                </>
              ) : (
                'Définissez d’abord le jour de paiement Visa du compte.'
              )}
            </p>
          )}

          {!noPayment && !isVisa && (
            <div className="flex flex-wrap items-center gap-2 type-body-sm text-fg-muted">
              <span>Date de facture +</span>
              <Input
                size="sm"
                numeric
                inputMode="numeric"
                aria-label="Délai de paiement en jours"
                className="w-16"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.value)}
              />
              <span>jours</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={invoiceDate === ''}
                onClick={() => setPaymentDate(addDaysFrom(invoiceDate, Number.parseInt(offsetDays, 10) || 0))}
              >
                Appliquer
              </Button>
            </div>
          )}

          <LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
          {submitted && !linesOk && (
            <p className="type-body-sm text-negative-fg">
              Un montant ou un taux est illisible — corrigez les cases en rouge.
            </p>
          )}

          <Checkbox label="Payé" checked={paid} onCheckedChange={(v) => setPaid(v === true)} />

          {error && (
            <Callout tone="negative" title="Le flux n’a pas été enregistré.">
              {error}
            </Callout>
          )}
        </form>
      </Dialog>

      {confirming === 'delete' && onDelete && (
        <ConfirmDialog
          title="Supprimer ce flux ?"
          description={`« ${name.trim() || initialFlow?.name || 'Ce flux'} » sera supprimé définitivement.`}
          confirmLabel="Supprimer le flux"
          onClose={() => setConfirming(null)}
          onConfirm={onDelete}
        />
      )}
      {confirming === 'batch' && onDeleteBatch && (
        <ConfirmDialog
          title="Supprimer toute la série ?"
          description="Tous les flux créés ensemble par le générateur seront supprimés définitivement."
          confirmLabel="Supprimer la série"
          onClose={() => setConfirming(null)}
          onConfirm={onDeleteBatch}
        />
      )}
    </>
  )
}
