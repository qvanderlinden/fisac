import { useId, useState } from 'react'
import { Button, Callout, Checkbox, Dialog, Field, Input, Select } from '@qvanderlinden/ui'
import type { AccountRead, CategoryRead, FlowBulkUpdate, PaymentMethod } from '../api/types'
import { frameError } from '../errors'
import { MAX_AMOUNT, isBadAmount, parseDecimal, parseVatRate } from '../format'
import { CountFigure } from './CountFigure'
import { NONE, categoryOptions, paymentMethodOptions } from './flowOptions'

interface FlowBulkEditDialogProps {
  count: number
  account: AccountRead
  categories: CategoryRead[]
  // Whether the reverse-charge (autoliquidation) field is offered.
  showReverseCharge: boolean
  onCancel: () => void
  // The payload carries only the fields the user enabled (see FlowBulkUpdate).
  // Rejects to keep the dialog open with the error shown.
  onApply: (payload: Omit<FlowBulkUpdate, 'flow_ids'>) => Promise<void>
}

// Each attribute sits behind an enabling Checkbox: only enabled ones go into
// the payload, so a bulk edit can touch one field or several. Mirrors the
// backend's model_fields_set semantics.
export function FlowBulkEditDialog({
  count,
  account,
  categories,
  showReverseCharge,
  onCancel,
  onApply,
}: FlowBulkEditDialogProps) {
  const formId = useId()
  const [applyCategory, setApplyCategory] = useState(false)
  const [categoryId, setCategoryId] = useState(NONE)

  const [applyAmount, setApplyAmount] = useState(false)
  const [amountNet, setAmountNet] = useState('')
  const [vatRate, setVatRate] = useState('21')

  const [applyPayment, setApplyPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(NONE)

  const [applyPaid, setApplyPaid] = useState(false)
  const [paid, setPaid] = useState('paid')

  const [applyReverseCharge, setApplyReverseCharge] = useState(false)
  const [reverseCharge, setReverseCharge] = useState('on')

  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nothingEnabled = !applyCategory && !applyAmount && !applyPayment && !applyPaid && !applyReverseCharge
  const net = parseDecimal(amountNet)
  const amountInvalid = isBadAmount(amountNet, { max: MAX_AMOUNT })
  // Validated and sent through the same reading, so what passes is what is stored.
  const rate = parseVatRate(vatRate)
  const rateInvalid = rate === null

  // Typed values are lost on close, and a failure arriving late must stay
  // visible: nothing closes the dialog while the request runs.
  function requestClose() {
    if (!saving) onCancel()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (nothingEnabled) return
    if (applyAmount && (amountInvalid || rateInvalid)) return
    const payload: Omit<FlowBulkUpdate, 'flow_ids'> = {}
    if (applyCategory) payload.category_id = categoryId === NONE ? null : Number(categoryId)
    if (applyAmount && net !== null && rate !== null) {
      payload.amount_net = net
      payload.vat_rate = rate
    }
    if (applyPayment) payload.payment_method = paymentMethod === NONE ? null : (paymentMethod as PaymentMethod)
    if (applyPaid) payload.paid = paid === 'paid'
    if (applyReverseCharge) payload.reverse_charge = reverseCharge === 'on'

    setSaving(true)
    setError(null)
    try {
      await onApply(payload)
    } catch (err) {
      setError(frameError(err))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={requestClose}
      title={
        <>
          Modifier <CountFigure n={count} singular="flux" plural="flux" />
        </>
      }
      description="Cochez un champ pour l’appliquer à chaque flux sélectionné ; les autres restent inchangés."
      // Typed values are lost on close, so a stray click on the scrim doesn't
      // close it; Escape, the close button and "Annuler" do (not while saving).
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => saving && e.preventDefault()}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={saving || nothingEnabled}>
            {saving ? (
              'Application…'
            ) : (
              <span>
                Appliquer à <CountFigure n={count} singular="flux" plural="flux" />
              </span>
            )}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Checkbox label="Catégorie" checked={applyCategory} onCheckedChange={(v) => setApplyCategory(v === true)} />
          <Select
            aria-label="Catégorie"
            disabled={!applyCategory}
            value={categoryId}
            onValueChange={setCategoryId}
            options={categoryOptions(categories, { detailed: true })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox label="Montant" checked={applyAmount} onCheckedChange={(v) => setApplyAmount(v === true)} />
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field
              label="Montant net"
              hint={applyAmount ? 'Remplace les lignes de chaque flux par une seule ligne.' : undefined}
              error={submitted && applyAmount && amountInvalid ? 'Montant illisible ou trop grand — par exemple 1 234,56.' : undefined}
            >
              <Input
                numeric
                placeholder="0,00"
                disabled={!applyAmount}
                value={amountNet}
                onChange={(e) => setAmountNet(e.target.value)}
              />
            </Field>
            <Field label="TVA" error={submitted && applyAmount && rateInvalid ? 'Entre 0 et 100, deux décimales au plus.' : undefined}>
              <Input
                numeric
                suffix="%"
                disabled={!applyAmount}
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox
            label="Moyen de paiement"
            checked={applyPayment}
            onCheckedChange={(v) => setApplyPayment(v === true)}
          />
          <Select
            aria-label="Moyen de paiement"
            disabled={!applyPayment}
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={paymentMethodOptions(account, { detailed: true })}
          />
          {applyPayment && paymentMethod === 'visa' && (
            <p className="type-body-sm text-fg-muted">
              Efface aussi la date de paiement enregistrée : les flux Visa suivent le jour Visa du compte.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Checkbox label="Statut de paiement" checked={applyPaid} onCheckedChange={(v) => setApplyPaid(v === true)} />
          <Select
            aria-label="Statut de paiement"
            disabled={!applyPaid}
            value={paid}
            onValueChange={setPaid}
            options={[
              { value: 'paid', label: 'Payé' },
              { value: 'unpaid', label: 'À payer' },
            ]}
          />
        </div>

        {showReverseCharge && (
          <div className="flex flex-col gap-2">
            <Checkbox
              label="Autoliquidation"
              checked={applyReverseCharge}
              onCheckedChange={(v) => setApplyReverseCharge(v === true)}
            />
            <Select
              aria-label="Autoliquidation"
              disabled={!applyReverseCharge}
              value={reverseCharge}
              onValueChange={setReverseCharge}
              options={[
                { value: 'on', label: 'Autoliquidation' },
                { value: 'off', label: 'TVA normale' },
              ]}
            />
          </div>
        )}

        {error && (
          <Callout tone="negative" title="Les flux n’ont pas été modifiés.">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  )
}
