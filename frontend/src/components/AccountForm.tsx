import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Callout, Dialog, Field, Input, Switch, toast } from '@qvanderlinden/ui'
import { createAccount, deleteAccount, updateAccount } from '../api/client'
import type { AccountCreate, AccountRead } from '../api/types'
import { frameError } from '../errors'
import { MAX_AMOUNT, amountInput, isBadAmount, parseDecimal } from '../format'
import { ConfirmDialog } from './ConfirmDialog'

interface AccountFormProps {
  /** The account to edit; null creates a new one. */
  account: AccountRead | null
  onClose: () => void
  onSaved: (account: AccountRead) => void
  onDeleted: (accountId: number) => void
}

// A Visa day field: empty means "not set", otherwise a whole day of the month.
function parseDay(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d{1,2}$/.test(trimmed)) return 'invalid'
  const day = Number(trimmed)
  return day >= 1 && day <= 31 ? day : 'invalid'
}

// The account settings in a Dialog. Saves (create or update) and deletes
// through the API itself, then reports the result to the shell. Mount it only
// while it should be open, keyed by the account, so its drafts start fresh.
export function AccountForm({ account, onClose, onSaved, onDeleted }: AccountFormProps) {
  const formId = useId()
  const [name, setName] = useState(account?.name ?? '')
  const [balance, setBalance] = useState(amountInput(account?.current_balance ?? 0))
  const [isCompany, setIsCompany] = useState(account?.is_company ?? false)
  const [vatApplicable, setVatApplicable] = useState(account?.vat_applicable ?? false)
  const [paymentDayText, setPaymentDayText] = useState(
    account?.visa_payment_day != null ? String(account.visa_payment_day) : '',
  )
  const [closingDayText, setClosingDayText] = useState(
    account?.visa_closing_day != null ? String(account.visa_closing_day) : '',
  )
  // Field errors show only after the first submit attempt.
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const balanceValue = parseDecimal(balance)
  const balanceInvalid = balanceValue === null || isBadAmount(balance, { signed: true, max: MAX_AMOUNT })
  const paymentDay = parseDay(paymentDayText)
  const closingDay = parseDay(closingDayText)

  function requestClose() {
    if (!saving) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (name.trim() === '' || balanceValue === null || balanceInvalid || paymentDay === 'invalid' || closingDay === 'invalid') {
      return
    }
    const payload: AccountCreate = {
      name: name.trim(),
      current_balance: balanceValue,
      is_company: isCompany,
      // Only a company can be VAT-registered; the backend normalizes the same way.
      vat_applicable: isCompany && vatApplicable,
      visa_payment_day: paymentDay,
      visa_closing_day: closingDay,
    }
    setSaving(true)
    setError(null)
    try {
      const saved = account ? await updateAccount(account.id, payload) : await createAccount(payload)
      toast(account ? 'Compte enregistré.' : 'Compte créé.', { tone: 'positive' })
      onSaved(saved)
    } catch (err) {
      setError(frameError(err))
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={requestClose}
        title={account ? 'Modifier le compte' : 'Nouveau compte'}
        // Typed values are lost on close, so only Escape, the close button
        // and "Annuler" close it, not a stray click on the scrim. While the
        // save runs nothing closes it: a failure arriving late must stay visible.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
        footer={
          <>
            {account && (
              <Button
                type="button"
                variant="ghost"
                iconLeft={Trash2}
                className="mr-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Supprimer
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nom" error={submitted && name.trim() === '' ? 'Le nom est obligatoire.' : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field
            label="Solde actuel"
            error={submitted && balanceInvalid ? 'Montant illisible ou trop grand — par exemple 1 234,56.' : undefined}
          >
            <Input numeric value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
          <Switch label="Société" checked={isCompany} onCheckedChange={setIsCompany} />
          {isCompany && (
            <Switch label="Assujetti à la TVA" checked={vatApplicable} onCheckedChange={setVatApplicable} />
          )}
          <Field
            label="Jour de paiement Visa"
            hint="Jour du mois où la Visa est débitée."
            error={submitted && paymentDay === 'invalid' ? 'Un jour entre 1 et 31, ou vide.' : undefined}
          >
            <Input
              numeric
              inputMode="numeric"
              value={paymentDayText}
              onChange={(e) => setPaymentDayText(e.target.value)}
            />
          </Field>
          <Field
            label="Jour de clôture Visa"
            hint="Une facture datée après ce jour passe sur le relevé suivant ; vide, elle est payée au jour de paiement."
            error={submitted && closingDay === 'invalid' ? 'Un jour entre 1 et 31, ou vide.' : undefined}
          >
            <Input
              numeric
              inputMode="numeric"
              value={closingDayText}
              onChange={(e) => setClosingDayText(e.target.value)}
            />
          </Field>
          {error && (
            <Callout tone="negative" title="Le compte n’a pas été enregistré.">
              {error}
            </Callout>
          )}
        </form>
      </Dialog>

      {confirmingDelete && account && (
        <ConfirmDialog
          title="Supprimer ce compte ?"
          description={`« ${account.name} » et tous ses flux, catégories et comptes du plan comptable seront supprimés définitivement.`}
          confirmLabel="Supprimer le compte"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await deleteAccount(account.id)
            toast('Compte supprimé.', { tone: 'positive' })
            onDeleted(account.id)
          }}
        />
      )}
    </>
  )
}
