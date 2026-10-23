import { useState, type ReactNode } from 'react'
import { CalendarPlus, RotateCcw } from 'lucide-react'
import { Button, Checkbox, Field, Input, Select } from '@qvanderlinden/ui'
import type { PieceKind, PieceRead } from '../api/types'
import type { PieceRefs, PieceSide } from './usePieceRefs'
import { useSavedPick, useSavedText } from './useSavedField'

const KIND_OPTIONS = [
  { value: 'invoice', label: 'facture' },
  { value: 'credit_note', label: 'note de crédit' },
]

const COPY = {
  sale: { tiers: 'Client', placeholder: 'Ce qui est facturé', paid: 'Payée' },
  purchase: { tiers: 'Fournisseur', placeholder: 'Ce qui a été acheté', paid: 'Payé' },
}

/**
 * A date field that saves itself on blur only: Chrome's date input reports each partial
 * year typed ("0002"), so a timer would send them. A blank date is not sent (the stored
 * one comes back on blur).
 */
function DateField({
  label,
  server,
  save,
}: {
  label: ReactNode
  server: string
  save(date: string): Promise<boolean>
}) {
  const field = useSavedText(server, (text) => (text ? save(text) : Promise.resolve(true)), { delay: null })
  return (
    <Field label={label}>
      <Input type="date" {...field} />
    </Field>
  )
}

/**
 * The header of a sale or a purchase: type, tiers, description, the document date, the
 * booking date (hidden while it is the document date, with "Rétablir" once it differs),
 * the payment method (no card for a sale), the payment date and "payée". Each field
 * PATCHes itself alone through `onPatch`.
 */
export function PieceHeader({
  piece,
  side,
  refs,
  mobile,
  onPatch,
}: {
  piece: PieceRead
  side: PieceSide
  refs: PieceRefs
  mobile: boolean
  onPatch(body: Partial<Record<keyof PieceRead, unknown>>): Promise<boolean>
}) {
  const copy = COPY[side]
  const [kind, pickKind] = useSavedPick<PieceKind>(piece.kind, (v) => onPatch({ kind: v }))
  const [tiers, pickTiers] = useSavedPick(piece.third_party_id, (v) => onPatch({ third_party_id: v }))
  const [method, pickMethod] = useSavedPick(piece.payment_method_id, (v) => onPatch({ payment_method_id: v }))
  const [paid, pickPaid] = useSavedPick(piece.paid, (v) => onPatch({ paid: v }))
  const description = useSavedText(piece.description, (text) => onPatch({ description: text.trim() }))
  const overridden = piece.booking_date !== piece.document_date
  const [showBooking, setShowBooking] = useState(false)

  const tiersOptions = [
    { value: 'none', label: 'Aucun tiers' },
    ...[...refs.thirdParties]
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((t) => ({ value: String(t.id), label: t.name })),
  ]
  const methodOptions = refs.paymentMethods.map((m) => ({ value: String(m.id), label: m.name }))
  // A method the side does not offer (a card on a sale) stays named while the piece uses it.
  if (!refs.paymentMethods.some((m) => m.id === piece.payment_method_id)) {
    methodOptions.push({ value: String(piece.payment_method_id), label: 'Moyen non admis' })
  }

  const kindField = (
    <Field label="Type">
      <Select options={KIND_OPTIONS} value={kind} onValueChange={(v) => pickKind(v as PieceKind)} />
    </Field>
  )
  const tiersField = (
    <Field label={copy.tiers}>
      <Select
        options={tiersOptions}
        placeholder="Choisir un tiers"
        value={tiers === null ? '' : String(tiers)}
        onValueChange={(v) => pickTiers(v === 'none' ? null : Number(v))}
      />
    </Field>
  )
  const descriptionField = (
    <Field label="Description">
      <Input placeholder={copy.placeholder} maxLength={200} {...description} />
    </Field>
  )
  const documentDate = (
    <DateField label="Date du document" server={piece.document_date} save={(d) => onPatch({ document_date: d })} />
  )
  const bookingDate =
    overridden || showBooking ? (
      <div className="flex min-w-0 flex-col gap-1">
        <DateField
          label="Date de comptabilisation"
          server={piece.booking_date}
          save={(d) => {
            setShowBooking(true)
            return onPatch({ booking_date: d })
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          {piece.booking_date < piece.document_date ? (
            <span role="status" className="text-xs text-warning-fg">
              Avant la date du document
            </span>
          ) : (
            <span />
          )}
          {overridden ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={RotateCcw}
              title="Revenir à la date du document"
              onClick={() => {
                setShowBooking(false)
                void onPatch({ booking_date: null })
              }}
            >
              Rétablir
            </Button>
          ) : null}
        </div>
      </div>
    ) : (
      <Field label="Date de comptabilisation">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <span className="text-sm text-fg-muted">La date du document</span>
          <Button variant="ghost" size="sm" iconLeft={CalendarPlus} onClick={() => setShowBooking(true)}>
            Changer
          </Button>
        </div>
      </Field>
    )
  const methodField = (
    <Field label="Moyen de paiement">
      <Select options={methodOptions} value={String(method)} onValueChange={(v) => pickMethod(Number(v))} />
    </Field>
  )
  const paymentDate = (
    <DateField
      label={paid ? 'Date de paiement' : 'Paiement prévu le'}
      server={piece.payment_date}
      save={(d) => onPatch({ payment_date: d })}
    />
  )
  const paidField = (
    <Field label="Statut">
      <Checkbox label={copy.paid} checked={paid} onCheckedChange={(v) => pickPaid(v === true)} />
    </Field>
  )

  if (mobile) {
    return (
      <>
        <section className="flex flex-col gap-4">
          <span className="type-eyebrow text-fg-muted">{side === 'sale' ? 'facture' : 'pièce'}</span>
          {kindField}
          {tiersField}
          {descriptionField}
          {documentDate}
          {bookingDate}
        </section>
        <section className="flex flex-col gap-4">
          <span className="type-eyebrow text-fg-muted">paiement</span>
          {methodField}
          {paymentDate}
          {paidField}
        </section>
      </>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-start gap-x-6 gap-y-4">
      <div className="col-span-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-x-6">
        {kindField}
        {tiersField}
        {descriptionField}
      </div>
      {documentDate}
      {bookingDate}
      {methodField}
      {paymentDate}
      {paidField}
    </div>
  )
}
