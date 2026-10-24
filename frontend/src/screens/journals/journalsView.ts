import type { JournalRead, MovementRead, PaymentMethodRead } from '../../api/types'
import { statementFor } from '../../statements'

export type MovementFilter = 'all' | 'done' | 'planned'

export const MOVEMENT_FILTERS: { value: MovementFilter; label: string }[] = [
  { value: 'all', label: 'Réalisés et prévus' },
  { value: 'done', label: 'Réalisés' },
  { value: 'planned', label: 'Prévus' },
]

/** The movements to show; each keeps the running balance the server computed over the whole journal. */
export function filterMovements(movements: MovementRead[], filter: MovementFilter): MovementRead[] {
  if (filter === 'all') return movements
  return movements.filter((m) => m.planned === (filter === 'planned'))
}

const cents = (value: string) => Math.round(Number(value) * 100)

/** The Recette column: the amount of a movement that brings money in, null otherwise. */
export function receiptOf(m: MovementRead): string | null {
  return cents(m.amount) > 0 ? m.amount : null
}

/** The Dépense column: the amount, unsigned, of a movement that takes money out, null otherwise. */
export function paymentOf(m: MovementRead): string | null {
  return cents(m.amount) < 0 ? m.amount.replace('-', '') : null
}

/** What a movement is, for the line under its label: "vente", "achat", "décompte", "impôt". */
export const KIND_LABELS: Record<MovementRead['kind'], string> = {
  sale: 'vente',
  purchase: 'achat',
  card_statement: 'décompte',
  isoc_prepayment: 'impôt',
}

export interface StatementPurchases {
  /** The card purchases the statement settles, as the card's journal has them. */
  purchases: MovementRead[]
  /** False when they do not add up to the statement: some are in the previous fiscal year. */
  complete: boolean
}

/**
 * The card purchases a statement movement settles. The API gives the statement's amount only,
 * so they are derived: the card (the payment method named like the statement) has a journal
 * whose purchase movements are dated at their payment; the ones whose statement
 * (`statementFor`, the backend's rule) is paid on the movement's date belong to it. A purchase
 * paid late in the previous fiscal year is not in this year's journal, hence `complete`.
 * Null when the card, its days or its journal cannot be found.
 */
export function statementPurchases(
  journals: JournalRead[],
  methods: PaymentMethodRead[],
  movement: MovementRead,
): StatementPurchases | null {
  const card = methods.find(
    (m) => m.type === 'card' && m.name === movement.label && m.statement_closing_day && m.statement_payment_day,
  )
  const journal = card && journals.find((j) => j.account.id === card.financial_account_id)
  if (!card || !journal) return null
  const purchases = journal.movements.filter(
    (m) =>
      m.kind === 'purchase' &&
      statementFor(m.date, card.statement_closing_day!, card.statement_payment_day!).payment === movement.date,
  )
  const sum = purchases.reduce((total, m) => total + cents(m.amount), 0)
  return { purchases, complete: Math.abs(sum) === Math.abs(cents(movement.amount)) }
}
