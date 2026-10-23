import { useRef, useState } from 'react'
import { Badge, Callout, Field, Input, Select } from '@qvanderlinden/ui'
import type { FinancialAccountRead, PaymentMethodRead, PaymentMethodType } from '../../api/types'
import { useAutosave } from '../../hooks/useAutosave'
import { usesLabel } from '../../lists/inUse'
import { InfoLabel } from '../../lists/InfoLabel'
import type { SaveResult } from '../../lists/useEditSession'
import {
  TYPE_LABELS,
  TYPE_OPTIONS,
  accountOptions,
  parseDay,
  statementName,
  statementPay,
  statementPeriod,
  statementsOf,
} from './paymentMethodsList'

/** The values the form edits: the name and the statement days as typed, the type, the account id. */
export interface MethodFields {
  name: string
  type: PaymentMethodType
  /** The financial account's id as a string; blank until chosen. */
  accountId: string
  closing: string
  payment: string
}

/** What a new method starts as: a transfer, no account yet. */
export const METHOD_DEFAULTS: MethodFields = { name: '', type: 'transfer', accountId: '', closing: '', payment: '' }

/**
 * The fields of a payment method, shared by the desktop dialog and the mobile full-screen
 * form (`MoyensPaiement` and `MobileMoyenPaiementForm` artboards). A new method asks for
 * its type and, for a card, the two statement days, for the others a financial account;
 * the API needs them all, so it is created once they are valid. Once created the type and
 * the account are read-only; the name and the days save themselves, and when a save fails
 * (the session toasts it) a field goes back to the value the server confirmed, unless it
 * was changed again since.
 */
export function PaymentMethodsForm({
  row,
  mobile,
  accounts,
  onSave,
}: {
  /** The saved method; undefined while a new one is not complete enough to exist. */
  row: PaymentMethodRead | undefined
  mobile: boolean
  accounts: FinancialAccountRead[]
  onSave(patch: Partial<MethodFields>): Promise<SaveResult<MethodFields>>
}) {
  const created = row !== undefined
  const [name, setName] = useState(row?.name ?? METHOD_DEFAULTS.name)
  const [nameTyped, setNameTyped] = useState(false)
  const [type, setType] = useState<PaymentMethodType>(row?.type ?? METHOD_DEFAULTS.type)
  const [accountId, setAccountId] = useState(METHOD_DEFAULTS.accountId)
  const [closing, setClosing] = useState(row?.statement_closing_day?.toString() ?? '')
  const [payment, setPayment] = useState(row?.statement_payment_day?.toString() ?? '')
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ name, closing, payment })

  const nameSaver = useAutosave(async (value) => {
    const result = await onSave({ name: value })
    if (!result.ok && typed.current.name === value) {
      typed.current.name = result.server.name
      setName(result.server.name)
    }
  })

  const closingSaver = useAutosave(async (value) => {
    if (parseDay(value) === null) return
    const result = await onSave({ closing: value.trim() })
    if (!result.ok && typed.current.closing === value) {
      typed.current.closing = result.server.closing
      setClosing(result.server.closing)
    }
  })

  const paymentSaver = useAutosave(async (value) => {
    if (parseDay(value) === null) return
    const result = await onSave({ payment: value.trim() })
    if (!result.ok && typed.current.payment === value) {
      typed.current.payment = result.server.payment
      setPayment(result.server.payment)
    }
  })

  function pickType(value: string) {
    const next = value as PaymentMethodType
    setType(next)
    // The account fits one kind of type: a pick made for the previous type goes.
    setAccountId('')
    void onSave({ type: next, accountId: '' })
  }

  function pickAccount(value: string) {
    setAccountId(value)
    void onSave({ accountId: value })
  }

  const card = type === 'card'
  const closeDay = parseDay(closing)
  const payDay = parseDay(payment)
  const nameError =
    nameTyped && name.trim() === ''
      ? created
        ? 'Donnez-lui un nom : sans nom, le précédent est gardé.'
        : 'Donnez-lui un nom : un moyen sans nom n’est pas gardé.'
      : undefined
  const closeError = closeDay === null && (created || closing !== '') ? 'Un jour de 1 à 31 ; 31 = dernier jour du mois' : undefined
  const payError = payDay === null && (created || payment !== '') ? 'Un jour de 1 à 31, le mois suivant' : undefined
  const preview = statementsOf(closeDay, payDay, 3)
  const options = accountOptions(type, accounts)
  const uses = row?.uses ?? 0

  const nameField = (
    <Field label="Nom" error={nameError}>
      <Input
        placeholder="Virement bancaire, carte Visa…"
        value={name}
        onChange={(e) => {
          typed.current.name = e.target.value
          setName(e.target.value)
          setNameTyped(true)
          nameSaver.onChange(e.target.value)
        }}
        onBlur={nameSaver.onBlur}
      />
    </Field>
  )

  const typeAndAccount = created ? (
    <div className="flex flex-col rounded-md border border-line-hairline">
      <div className="flex justify-between gap-3 border-b border-line-hairline px-3 py-2.5 text-sm">
        <span className="text-fg-muted">Type</span>
        <span className="text-right text-fg-strong">{TYPE_LABELS[row.type]}</span>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2.5 text-sm">
        <span className="text-fg-muted">Compte financier</span>
        <span className="text-right text-fg-strong">{row.financial_account_name}</span>
      </div>
    </div>
  ) : (
    <>
      <Field label="Type">
        <Select options={TYPE_OPTIONS} value={type} onValueChange={pickType} />
      </Field>
      {card ? null : (
        <Field
          label="Compte financier"
          error={options.length === 0 ? 'Aucun compte de ce type : il faut en avoir un pour ce moyen.' : undefined}
        >
          <Select
            placeholder="Choisir un compte"
            options={options}
            value={accountId}
            onValueChange={pickAccount}
          />
        </Field>
      )}
    </>
  )

  const statementDays = card ? (
    <div className="flex flex-col gap-3.5 rounded-lg bg-surface-sunken p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg-strong">Décompte mensuel</span>
        <span className="text-xs text-fg-muted">Les achats faits avec la carte sont payés en une fois, depuis la banque.</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-start gap-4">
        <Field
          label={
            <InfoLabel
              info={
                closeDay === null
                  ? 'Un jour de 1 à 31 ; 31 = dernier jour du mois'
                  : `Les achats jusqu’au ${closeDay}${closeDay === 31 ? ' (fin du mois)' : ''} forment le décompte du mois`
              }
            >
              Jour de clôture
            </InfoLabel>
          }
          error={closeError}
        >
          <Input
            numeric
            invalid={closeError !== undefined}
            value={closing}
            onChange={(e) => {
              typed.current.closing = e.target.value
              setClosing(e.target.value)
              closingSaver.onChange(e.target.value)
            }}
            onBlur={closingSaver.onBlur}
          />
        </Field>
        <Field
          label={
            <InfoLabel
              info={
                payDay === null
                  ? 'Un jour de 1 à 31, le mois suivant'
                  : `Le décompte est payé le ${payDay} du mois suivant, depuis la banque`
              }
            >
              Jour de paiement
            </InfoLabel>
          }
          error={payError}
        >
          <Input
            numeric
            invalid={payError !== undefined}
            value={payment}
            onChange={(e) => {
              typed.current.payment = e.target.value
              setPayment(e.target.value)
              paymentSaver.onChange(e.target.value)
            }}
            onBlur={paymentSaver.onBlur}
          />
        </Field>
      </div>
      <div className="flex flex-col border-t border-line-hairline">
        {preview.length === 0 ? (
          <span className="pt-2 text-sm text-warning-fg">jours à compléter</span>
        ) : (
          preview.map((s) => (
            <div
              key={s.month}
              className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-line-hairline py-2 text-sm"
            >
              <span className="text-fg-strong">{statementName(s)}</span>
              <span className="font-mono text-xs text-fg-muted">
                {statementPeriod(s)} · {statementPay(s)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  ) : null

  const pending = created ? null : (
    <span className="text-xs text-fg-muted">
      {card
        ? 'Le moyen est créé dès que le nom et les deux jours du décompte sont renseignés.'
        : 'Le moyen est créé dès que le nom et le compte financier sont renseignés.'}
    </span>
  )

  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Porté par ${usesLabel(uses)}`}>
        Il ne peut pas être supprimé tant que des pièces le portent.
      </Callout>
    ) : null

  if (!mobile) {
    return (
      <>
        {nameField}
        {typeAndAccount}
        {statementDays}
        {pending}
        {inUse}
      </>
    )
  }

  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="type-eyebrow text-fg-muted">utilisé</span>
          <span className="numeric text-md text-fg-strong">{usesLabel(uses)}</span>
        </div>
        <Badge tone="neutral">{TYPE_LABELS[type]}</Badge>
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">moyen de paiement</span>
        {nameField}
        {typeAndAccount}
        {pending}
      </section>
      {statementDays}
      {inUse}
    </>
  )
}
