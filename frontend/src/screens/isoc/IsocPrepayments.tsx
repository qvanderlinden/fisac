import { useState } from 'react'
import { Badge, Callout, Card, Checkbox, Field, Input, Select, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { api } from '../../api/client'
import type { IsocPrepaymentRead, IsocPrepaymentView, IsocRead, PaymentMethodRead } from '../../api/types'
import { isApiError, messageOf } from '../../errors'
import { amountInput, countLabel, eur, formatDate, formatRate, isBadAmount, parseDecimal } from '../../format'
import { useSavedPick, useSavedText } from '../../pieces/useSavedField'
import { createSerialQueue } from '../../serialQueue'
import { STATE_TONE, bonificationText, exemptReasons, prepaymentState } from './isocView'

const INVALID_AMOUNT = 'Montant invalide : il n’a pas été enregistré'

type Body = Partial<Pick<IsocPrepaymentRead, 'amount' | 'payment_method_id' | 'payment_date' | 'paid'>>

/** Field errors of the advance payments, keyed `${id}:${field}`. */
type Errors = Record<string, string>

export interface PrepaymentEditor {
  errors: Errors
  /** PATCHes one advance payment; resolves false when refused (toasted, the field marked). */
  save(row: IsocPrepaymentRead, body: Body): Promise<boolean>
}

/**
 * The saves of the four advance payments: one at a time in the order typed; each answer
 * replaces its row, then the ISOC read is reloaded (the balance, the bonification and the
 * majoration follow). A 422 marks its field and is toasted.
 */
export function usePrepaymentEditor(onSaved: (row: IsocPrepaymentRead) => void, reload: () => Promise<void>): PrepaymentEditor {
  const [enqueue] = useState(createSerialQueue)
  const [errors, setErrors] = useState<Errors>({})

  function save(row: IsocPrepaymentRead, body: Body) {
    return enqueue(async () => {
      try {
        onSaved(await api.patch<IsocPrepaymentRead>(`/isoc-prepayments/${row.id}`, body))
        // The row as saved satisfies every rule: its earlier refusals no longer hold.
        setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${row.id}:`))))
        await reload()
        return true
      } catch (e) {
        toast(messageOf(e), { tone: 'negative' })
        if (isApiError(e)) {
          const fields = Object.entries(e.fields).map(([f, m]) => [`${row.id}:${f}`, m] as const)
          setErrors((prev) => ({ ...prev, ...Object.fromEntries(fields) }))
        }
        return false
      }
    })
  }

  return { errors, save }
}

interface RowProps {
  row: IsocPrepaymentRead
  view: IsocPrepaymentView | undefined
  methods: PaymentMethodRead[]
  editor: PrepaymentEditor
}

/** The fields of one advance payment, saving themselves. */
function usePrepaymentFields({ row, methods, editor }: RowProps) {
  const amount = useSavedText(amountInput(row.amount), (text) => {
    const value = text.trim() === '' ? '0' : parseDecimal(text)
    // Refused on blur (the field says so, a toast too), then the stored value comes back.
    if (value === null || (text.trim() !== '' && isBadAmount(text))) return Promise.resolve(true)
    if (Number(value) === Number(row.amount)) return Promise.resolve(true)
    return editor.save(row, { amount: value })
  })
  const date = useSavedText(row.payment_date ?? '', (text) => {
    if (text === (row.payment_date ?? '')) return Promise.resolve(true)
    return editor.save(row, { payment_date: text || null })
  }, { delay: null })
  const [method, pickMethod] = useSavedPick(row.payment_method_id, (v) => editor.save(row, { payment_method_id: v }))
  // Ticked with no date yet: paid on its due date, the date stays editable.
  const [paid, pickPaid] = useSavedPick(row.paid, (v) =>
    editor.save(row, v && !row.payment_date ? { paid: true, payment_date: row.due_date } : { paid: v }),
  )
  const amountBad = amount.value.trim() !== '' && isBadAmount(amount.value)
  const options = methods
    .filter((m) => m.type !== 'card' || m.id === row.payment_method_id)
    .map((m) => ({ value: String(m.id), label: m.name }))
  const error = (field: string) => editor.errors[`${row.id}:${field}`]
  const name = `VA${row.number}`

  const amountInputEl = (
    <Input
      size="sm"
      numeric
      aria-label={`Montant ${name}`}
      placeholder="0,00"
      invalid={amountBad || error('amount') !== undefined}
      {...amount}
      onBlur={() => {
        amount.onBlur()
        if (amountBad) toast(INVALID_AMOUNT, { tone: 'negative' })
      }}
    />
  )
  const methodSelect = (
    <Select
      size="sm"
      aria-label={`Moyen de paiement ${name}`}
      className="w-full min-w-0"
      invalid={error('payment_method_id') !== undefined}
      options={options}
      value={String(method)}
      onValueChange={(v) => pickMethod(Number(v))}
    />
  )
  const dateInput = (
    <Input size="sm" type="date" aria-label={`Payé le ${name}`} invalid={error('payment_date') !== undefined} {...date} />
  )
  const paidBox = <Checkbox label="Payé" checked={paid} onCheckedChange={(v) => pickPaid(v === true)} />
  const errorText = ['amount', 'payment_method_id', 'payment_date', 'paid'].map(error).find((m) => m !== undefined)
  return { name, amountInputEl, methodSelect, dateInput, paidBox, errorText }
}

function StateBadge({ row }: { row: IsocPrepaymentRead }) {
  const state = prepaymentState(row)
  return <Badge tone={STATE_TONE[state]}>{state}</Badge>
}

/** One advance payment as a table row (desktop). */
function PrepaymentRow(props: RowProps) {
  const { row, view } = props
  const f = usePrepaymentFields(props)
  return (
    <TableRow>
      <TableCell className="align-top">
        <span className="flex flex-col items-start gap-1">
          <span className="text-sm font-medium text-fg-strong">{f.name}</span>
          <StateBadge row={row} />
        </span>
      </TableCell>
      <TableCell className="numeric align-top text-sm whitespace-nowrap text-fg-muted">{formatDate(row.due_date, 'full')}</TableCell>
      <TableCell className="numeric align-top text-xs text-fg-muted">{bonificationText(view)}</TableCell>
      <TableCell className="align-top">{f.amountInputEl}</TableCell>
      <TableCell className="align-top">{f.methodSelect}</TableCell>
      <TableCell className="align-top">
        <span className="flex flex-col gap-1">
          {f.dateInput}
          {f.errorText ? <span className="text-2xs text-negative-fg">{f.errorText}</span> : null}
        </span>
      </TableCell>
      <TableCell className="align-top">{f.paidBox}</TableCell>
    </TableRow>
  )
}

/** One advance payment as a card (mobile). */
function PrepaymentCard(props: RowProps) {
  const { row, view } = props
  const f = usePrepaymentFields(props)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line-hairline bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="text-sm font-medium text-fg-strong">{f.name}</span>
          <span className="font-mono text-2xs text-fg-muted">échéance {formatDate(row.due_date, 'full')}</span>
        </span>
        <StateBadge row={row} />
      </div>
      <span className="font-mono text-2xs text-fg-muted">bonification {bonificationText(view)}</span>
      <Field label="Montant">{f.amountInputEl}</Field>
      <Field label="Moyen de paiement">{f.methodSelect}</Field>
      <Field label="Payé le">{f.dateInput}</Field>
      {f.paidBox}
      {f.errorText ? <span className="text-2xs text-negative-fg">{f.errorText}</span> : null}
    </div>
  )
}

const PREPAYMENT_NOTE =
  'Un versement payé est un mouvement « impôt » du journal financier ; il réduit le solde à payer sans entrer dans le résultat. Plus il est payé tôt, plus sa bonification réduit la majoration.'

/**
 * "Versements anticipés": VA1–VA4 editable in place (amount, payment method, date, paid),
 * with each one's due date and bonification, a table on desktop and cards on mobile.
 */
export function IsocPrepayments({
  rows,
  isoc,
  methods,
  editor,
  mobile,
}: {
  rows: IsocPrepaymentRead[]
  isoc: IsocRead
  methods: PaymentMethodRead[]
  editor: PrepaymentEditor
  mobile: boolean
}) {
  const viewOf = (n: number) => isoc.prepayments.find((p) => p.number === n)
  const total = rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0) / 100
  const paid = rows.filter((r) => r.paid && Number(r.amount) > 0).length
  const totalNote = `${countLabel(paid, 'payé', 'payés')} · ${eur(isoc.paid_total)}`

  if (mobile) {
    return (
      <section aria-label="Versements anticipés" className="flex flex-col gap-3">
        <h2 className="m-0 type-eyebrow text-fg-muted">versements anticipés</h2>
        {rows.map((r) => (
          <PrepaymentCard key={r.id} row={r} view={viewOf(r.number)} methods={methods} editor={editor} />
        ))}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex flex-col">
            <span className="font-semibold text-fg-strong">Total des versements</span>
            <span className="text-2xs text-fg-muted">{totalNote}</span>
          </span>
          <span className="numeric font-semibold text-fg-strong">{eur(total)}</span>
        </div>
        <p className="m-0 text-xs text-fg-muted">{PREPAYMENT_NOTE}</p>
      </section>
    )
  }

  return (
    <Card title="Versements anticipés" subtitle="Chaque versement payé réduit le solde à payer et la majoration" padding={false}>
      <Table className="min-w-240">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Versement</TableHead>
            <TableHead className="w-32">Échéance</TableHead>
            <TableHead>Bonification</TableHead>
            <TableHead className="w-36">Montant</TableHead>
            <TableHead className="w-48">Moyen</TableHead>
            <TableHead className="w-44">Payé le</TableHead>
            <TableHead className="w-24">Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <PrepaymentRow key={r.id} row={r} view={viewOf(r.number)} methods={methods} editor={editor} />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="text-sm font-semibold text-fg-strong">
              Total des versements <span className="ml-2 text-2xs font-normal text-fg-muted">{totalNote}</span>
            </TableCell>
            <TableCell className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(total)}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      </Table>
      <p className="m-0 border-t border-line-hairline px-4 py-3 text-xs text-fg-muted">{PREPAYMENT_NOTE}</p>
    </Card>
  )
}

/**
 * The majoration for insufficient advance payments: the gross amount (the rate of the tax), the
 * bonification of each paid advance payment, the threshold under which none is due, and
 * the exemption of a small company in its first three fiscal years.
 */
export function IsocMajoration({ isoc, mobile }: { isoc: IsocRead; mobile: boolean }) {
  const m = isoc.majoration
  const cents = (v: string) => Math.round(Number(v) * 100)
  const net = Math.max(0, cents(m.gross) - cents(m.bonification_total)) / 100
  const belowThreshold = !m.exempt && net > 0 && cents(m.amount) === 0
  const bonified = isoc.prepayments.filter((p) => cents(p.bonification) > 0 && p.bonification_rate !== null)
  const rows: { key: string; label: string; meta: string; amount: string | number; total?: boolean }[] = [
    { key: 'gross', label: 'Majoration brute', meta: `${formatRate(m.rate)} de ${eur(isoc.tax)}`, amount: m.gross },
    ...bonified.map((p) => ({
      key: `va${p.number}`,
      label: `Bonification VA${p.number}`,
      meta: `${formatRate(p.bonification_rate ?? '0')} de ${eur(p.amount)}${p.quarter !== p.number ? ` · compte pour VA${p.quarter}` : ''}`,
      amount: cents(p.bonification) === 0 ? p.bonification : `-${p.bonification}`,
    })),
    ...(bonified.length === 0 ? [{ key: 'none', label: 'Bonifications', meta: 'aucun versement payé', amount: '0' }] : []),
    { key: 'net', label: 'Après bonifications', meta: 'jamais sous zéro', amount: net },
    {
      key: 'threshold',
      label: 'Seuil',
      meta: belowThreshold ? 'sous le seuil : aucune majoration' : 'aucune majoration en dessous',
      amount: m.threshold,
    },
    { key: 'amount', label: 'Majoration', meta: m.exempt ? 'exonérée' : '', amount: m.amount, total: true },
  ]
  const note = (
    <Callout tone={m.exempt ? 'positive' : 'info'} title={m.exempt ? 'Majoration exonérée' : undefined}>
      {exemptReasons[m.exempt_reason]}
    </Callout>
  )
  const list = (
    <ul className="m-0 flex list-none flex-col divide-y divide-line-hairline rounded-lg border border-line-hairline p-0">
      {rows.map((r) => (
        <li key={r.key} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${r.total ? 'bg-surface-sunken' : ''}`}>
          <span className="flex min-w-0 flex-col">
            <span className={`text-sm text-fg-strong ${r.total ? 'font-semibold' : ''}`}>{r.label}</span>
            {r.meta ? <span className="font-mono text-2xs text-fg-muted">{r.meta}</span> : null}
          </span>
          <span className={`numeric text-sm whitespace-nowrap text-fg-strong ${r.total ? 'font-semibold' : ''}`}>{eur(r.amount)}</span>
        </li>
      ))}
    </ul>
  )
  if (mobile) {
    return (
      <section aria-label="Majoration" className="flex flex-col gap-3">
        <h2 className="m-0 type-eyebrow text-fg-muted">majoration</h2>
        {note}
        {list}
      </section>
    )
  }
  return (
    <Card title="Majoration" subtitle="Pour versements anticipés insuffisants">
      <div className="flex flex-col gap-4">
        {note}
        {list}
      </div>
    </Card>
  )
}
