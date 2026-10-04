// Every figure and date fisac shows goes through this module. Money and typed
// numbers use the design system's formatters (decimal comma, U+202F digit
// groups, true minus); dates use a French port of its three brand styles,
// since the system's formatDate is English-only. Upstream candidate: a
// `locale` option on the system's formatDate.
import { formatEur, formatNumber, parseNumber } from '@qvanderlinden/ui'
import type { FlowKind } from './api/types'

export { formatEur, formatNumber, parseNumber }

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// A date-only ISO string is a calendar date in local time; new Date('2026-09-15')
// would be UTC midnight and show as the 14th in timezones behind UTC.
function toDate(date: Date | string): Date {
  if (date instanceof Date) return date
  const m = ISO_DATE.exec(date)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date)
}

/**
 * Brand date styles, in French:
 * - `table` (default) → `04 oct.`
 * - `month` → `août 2026` (lists)
 * - `long` → `novembre 2026` (prose)
 * - `full` → `04 oct. 2026` (tables whose rows can span several years)
 */
export type DateStyle = 'table' | 'month' | 'long' | 'full'

export function formatDate(date: Date | string, style: DateStyle = 'table'): string {
  const d = toDate(date)
  const month = d.getMonth()
  const day = String(d.getDate()).padStart(2, '0')
  if (style === 'month') return `${MONTHS_SHORT[month]} ${d.getFullYear()}`
  if (style === 'long') return `${MONTHS_LONG[month]} ${d.getFullYear()}`
  if (style === 'full') return `${day} ${MONTHS_SHORT[month]} ${d.getFullYear()}`
  return `${day} ${MONTHS_SHORT[month]}`
}

/** An API decimal string (or a number) as brand money: `"-42.5"` → `−€42,50`. */
export function eur(value: string | number): string {
  return formatEur(typeof value === 'number' ? value : Number(value))
}

/** A change, always signed: `"1234"` → `+€1 234,00`, `"-42.5"` → `−€42,50`. */
export function signedEur(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  const formatted = formatEur(n)
  return n > 0 && formatted !== formatEur(0) ? `+${formatted}` : formatted
}

/** Flow amounts are unsigned magnitudes; the kind carries the sign. */
export function signedFlowAmount(kind: FlowKind, amount: string | number): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  return kind === 'expense' ? -n : n
}

/** A rate (0-100) for an editable field: `"21.00"` → `21`, `"5.50"` → `5,5`. */
export function rateInput(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  return formatNumber(n, { decimals: 2 }).replace(/,?0+$/, '')
}

/** A rate for display: `"21.00"` → `21%`. */
export function formatRate(value: string | number): string {
  return `${rateInput(value)}%`
}

/** An amount for an editable field, as it would be typed: `1 234,50`. */
export function amountInput(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  return formatNumber(n, { decimals: 2 })
}

/** A number as the API's decimal string: dot decimal, rounded to cents, no grouping. */
export function toApiDecimal(value: number): string {
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  return String(value < 0 && rounded !== 0 ? -rounded : rounded)
}

// Digits after the last separator, ignoring a trailing unit ("12,50 €").
const TRAILING_DECIMALS = /[.,](\d+)[^\d.,]*$/

/**
 * Typed input (comma or dot decimals, any spacing) as an API decimal string.
 * Null when unreadable, and null when it has more than two decimals: "1,234"
 * must not be stored as 1.23 (and a thousands separator typed by habit would
 * otherwise turn 1,234 into 1,23).
 */
export function parseDecimal(text: string): string | null {
  const n = parseNumber(text)
  if (!Number.isFinite(n)) return null
  if ((TRAILING_DECIMALS.exec(text)?.[1].length ?? 0) > 2) return null
  return toApiDecimal(n)
}

/** The backend stores amounts as Numeric(12,2): ten billion and up is rejected. */
export const MAX_AMOUNT = 10_000_000_000

/**
 * True when typed text cannot be sent as an amount: unreadable (a blank field
 * included), a third decimal, negative unless `signed`, or - with `max` - of
 * that size or more. Validation and the request share parseDecimal, so what
 * passes is what is stored. Callers that accept a blank field check it first.
 */
export function isBadAmount(text: string, { signed = false, max = Infinity }: { signed?: boolean; max?: number } = {}): boolean {
  const d = parseDecimal(text)
  if (d === null) return true
  const n = Number(d)
  return (!signed && n < 0) || Math.abs(n) >= max
}

/** The noun for a count, French plural from 2: `pluralNoun(1, 'flux inséré', 'flux insérés')` → `flux inséré`. */
export function pluralNoun(n: number, singular: string, plural: string): string {
  return n > 1 ? plural : singular
}

/** A count and its noun, French plural from 2: `countLabel(3, 'flux modifié', 'flux modifiés')` → `3 flux modifiés`. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${pluralNoun(n, singular, plural)}`
}

/**
 * A percentage (0-100) as typed ("21", "5,5") as an API decimal string, a blank
 * field reading as `blank`; null when it can't be sent as typed: unreadable, a
 * third decimal, below 0 or above 100. Validation and the request share this
 * one reading.
 */
export function parseRate(text: string, blank: string): string | null {
  const rate = text.trim() === '' ? blank : parseDecimal(text)
  return rate === null || Number(rate) < 0 || Number(rate) > 100 ? null : rate
}

/** A VAT rate as typed, blank for 0. */
export function parseVatRate(text: string): string | null {
  return parseRate(text, '0')
}
