import type { ReactNode } from 'react'
import type { PurchaseRead, SaleRead, VatRegime } from '../api/types'
import { eur, formatDate, formatRate } from '../format'
import { statementFor } from '../statements'
import { quarterOf, signOf, todayIso } from './piecesList'
import { reference } from './pieceStatus'
import type { PieceRefs, PieceSide } from './usePieceRefs'

interface Row {
  label: string
  amount: string
}

function cents(amount: string): number {
  return Math.round(Number(amount) * 100)
}

/** Sums cents by key, in the order keys first appear. */
function sumBy<K>(items: { key: K; cents: number }[]): Map<K, number> {
  const sums = new Map<K, number>()
  for (const i of items) sums.set(i.key, (sums.get(i.key) ?? 0) + i.cents)
  return sums
}

/** "T2 2026" for a quarterly return, "avril 2026" for a monthly one; null without returns. */
export function vatPeriodLabel(bookingDate: string, regime: VatRegime): string | null {
  if (regime === 'quarterly') {
    const [year, q] = quarterOf(bookingDate).split('-')
    return `T${q} ${year}`
  }
  if (regime === 'monthly') return formatDate(bookingDate, 'long')
  return null
}

function Box({ title, rows, note }: { title: string; rows: Row[]; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken px-4 py-3.5">
      <span className="text-sm font-semibold text-fg-strong">{title}</span>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-2 text-sm">
          <span className="min-w-0">{r.label}</span>
          <span className="numeric whitespace-nowrap text-fg-strong">{r.amount}</span>
        </div>
      ))}
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
    </div>
  )
}

/**
 * What a piece does elsewhere (`Ventes` and `Achats` artboards): its share of the result
 * by category, its movement in the financial journal, and its place in the VAT return.
 * Read from the piece as the server answered it; a credit note counts negative.
 */
export function EffectCards({
  piece,
  side,
  refs,
}: {
  piece: SaleRead | PurchaseRead
  side: PieceSide
  refs: Pick<PieceRefs, 'categories' | 'vatSchemes' | 'paymentMethods' | 'vatRegime' | 'accounts'>
}) {
  const sign = signOf(piece.kind)
  const money = (c: number) => eur((sign * c) / 100)
  const categoryLabel = (id: number) => refs.categories.find((c) => c.id === id)?.label ?? 'Sans catégorie'

  // The result: a sale line's net; a purchase line's charge, unless a fixed asset takes it over.
  const result: Row[] = []
  const registered: Row[] = []
  if (side === 'sale') {
    for (const [id, c] of sumBy(piece.lines.map((l) => ({ key: l.category_id, cents: cents(l.net) })))) {
      result.push({ label: categoryLabel(id), amount: money(c) })
    }
  } else {
    const lines = (piece as PurchaseRead).lines
    const charged = lines.filter((l) => l.fixed_asset_id === null)
    for (const [id, c] of sumBy(charged.map((l) => ({ key: l.category_id, cents: cents(l.charge) })))) {
      result.push({ label: categoryLabel(id), amount: money(c) })
    }
    for (const l of lines) {
      if (l.fixed_asset_number !== null) {
        registered.push({ label: `${reference('I', l.fixed_asset_number)} · au registre`, amount: 'son amortissement' })
      }
    }
  }

  // The journal: a sale brings money in, a purchase takes it out; a credit note the other way.
  // The word carries the direction, so the amount shows as typed.
  const receipt = (side === 'sale') === (piece.kind === 'invoice')
  const method = refs.paymentMethods.find((m) => m.id === piece.payment_method_id)
  const movement = [receipt ? 'Recette' : 'Dépense', method?.financial_account_name, formatDate(piece.payment_date)]
    .filter(Boolean)
    .join(' · ')
  let cash: Row[] = [{ label: movement, amount: eur(piece.total) }]
  let cashNote = piece.paid
    ? 'Réalisée.'
    : piece.status === 'late'
      ? 'En retard : la date de paiement prévue est passée.'
      : side === 'sale'
        ? 'Planifiée tant qu’elle n’est pas payée.'
        : 'Planifiée tant que l’achat n’est pas payé.'
  // Paid by card: the purchase leaves the card's account on its payment date, and the bank
  // pays it with the card's statement, on the statement's payment date (closing and payment
  // days of the method, as the journals compute it). The bank's movement is the effect shown.
  if (method?.type === 'card' && method.statement_closing_day !== null && method.statement_payment_day !== null) {
    const statement = statementFor(piece.payment_date, method.statement_closing_day, method.statement_payment_day)
    const bank = refs.accounts.find((a) => a.id === method.settlement_account_id)?.name
    const month = formatDate(`${statement.month}-01`, 'long').split(' ')[0]
    const label = [receipt ? 'Recette' : 'Dépense', bank, formatDate(statement.payment)].filter(Boolean).join(' · ')
    cash = [{ label, amount: eur(piece.total) }]
    cashNote = `Avec le décompte ${method.name} de ${month}, ${
      statement.payment > todayIso() ? 'prévu' : 'payé'
    } le ${formatDate(statement.payment, 'full')}. Par carte le ${formatDate(piece.payment_date, 'full')}, au journal ${method.financial_account_name}.`
  }

  // The VAT return of the booking date's period.
  const period = vatPeriodLabel(piece.booking_date, refs.vatRegime)
  const vatRows: Row[] = []
  if (side === 'sale') {
    const rateOf = (id: number) => refs.vatSchemes.find((v) => v.id === id)?.rate ?? '0'
    const bases = sumBy(piece.lines.map((l) => ({ key: Number(rateOf(l.vat_scheme_id)), cents: cents(l.net) })))
    for (const [rate, c] of bases) {
      vatRows.push({ label: bases.size > 1 ? `Base à ${formatRate(rate)}` : 'Base imposable', amount: money(c) })
    }
    vatRows.push({ label: 'TVA due', amount: money(cents(piece.vat)) })
  } else {
    const p = piece as PurchaseRead
    vatRows.push({ label: 'Base des achats', amount: money(cents(p.net)) })
    vatRows.push({ label: 'TVA récupérée', amount: money(cents(p.recovered)) })
    const kept = cents(p.vat) - cents(p.recovered)
    if (kept !== 0) vatRows.push({ label: 'TVA non récupérée · dans la charge', amount: money(kept) })
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      <Box
        title="Dans le résultat"
        rows={[...result, ...registered]}
        note={
          side === 'sale'
            ? 'Le HTVA, à la date de comptabilisation.'
            : 'Le HTVA et la TVA que l’on ne récupère pas, à la date de comptabilisation.'
        }
      />
      <Box title="Dans le journal financier" rows={cash} note={cashNote} />
      {period ? (
        <Box title={`Dans la déclaration TVA · ${period}`} rows={vatRows} />
      ) : (
        <Box title="Dans la déclaration TVA" rows={[]} note="La société ne dépose pas de déclaration TVA." />
      )}
    </div>
  )
}
