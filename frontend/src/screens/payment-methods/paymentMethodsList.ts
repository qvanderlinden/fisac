import type { FinancialAccountKind, FinancialAccountRead, PaymentMethodRead, PaymentMethodType } from '../../api/types'
import { formatDate } from '../../format'
import { nextStatements, type Statement } from '../../statements'

// What the table, the cards and the form share: the labels of a row, the statement days
// and the statements a card gets.

export const TYPE_LABELS: Record<PaymentMethodType, string> = {
  transfer: 'Virement',
  direct_debit: 'Domiciliation',
  card: 'Carte à débit différé',
  cash: 'Espèces',
}

// Slice A has no cash account and no accounts screen, so "espèces" cannot be created yet
// (existing cash methods still display through TYPE_LABELS). Slice B adds it back.
export const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as PaymentMethodType[])
  .filter((value) => value !== 'cash')
  .map((value) => ({ value, label: TYPE_LABELS[value] }))

/** The kind of financial account each type is paid from; a card brings its own. */
const ACCOUNT_KIND: Record<PaymentMethodType, FinancialAccountKind> = {
  transfer: 'bank',
  direct_debit: 'bank',
  card: 'card',
  cash: 'cash',
}

/** The accounts a non-card type can be tied to. */
export function accountOptions(type: PaymentMethodType, accounts: FinancialAccountRead[]) {
  return accounts.filter((a) => a.kind === ACCOUNT_KIND[type]).map((a) => ({ value: String(a.id), label: a.name }))
}

export function displayName(m: { name: string } | undefined): string {
  return m?.name || 'Moyen sans nom'
}

/** A day of the month as typed: a whole number from 1 to 31 (31 is the month's last day), or null. */
export function parseDay(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

/** Today as `YYYY-MM-DD`, in the viewer's time zone. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The statements a card shows: the open one and the next ones; none while a day is missing. */
export function statementsOf(closing: number | null, payment: number | null, count: number): Statement[] {
  return closing === null || payment === null ? [] : nextStatements(closing, payment, todayIso(), count)
}

export function statementsFor(m: PaymentMethodRead, count: number): Statement[] {
  return m.type === 'card' ? statementsOf(m.statement_closing_day, m.statement_payment_day, count) : []
}

/** "Décompte · octobre 2026". */
export function statementName(s: Statement): string {
  return `Décompte · ${formatDate(`${s.month}-01`, 'long')}`
}

/** "du 26 sept. 2026 au 25 oct. 2026". */
export function statementPeriod(s: Statement): string {
  return `du ${formatDate(s.start, 'full')} au ${formatDate(s.end, 'full')}`
}

/** "payé le 05 nov. 2026". */
export function statementPay(s: Statement): string {
  return `payé le ${formatDate(s.payment, 'full')}`
}

/** The Décompte column: the days of a card, a dash for the others, "jours à compléter" when missing. */
export function paramsLabel(m: PaymentMethodRead): string {
  if (m.type !== 'card') return '—'
  return m.statement_closing_day && m.statement_payment_day
    ? `clôture le ${m.statement_closing_day} · payé le ${m.statement_payment_day} du mois suivant`
    : 'jours à compléter'
}

/** The line under a row on mobile: "Virement · Banque". */
export function metaLabel(m: PaymentMethodRead): string {
  return `${TYPE_LABELS[m.type]} · ${m.financial_account_name}`
}

/** Cards with their statement days to show: the row, and its next statements. */
export function cardsWithStatements(rows: PaymentMethodRead[]): { row: PaymentMethodRead; statements: Statement[] }[] {
  return rows
    .map((row) => ({ row, statements: statementsFor(row, 3) }))
    .filter((c) => c.statements.length > 0)
}
