import { CalendarCheck, CreditCard, Landmark, type LucideIcon } from 'lucide-react'
import type { FlowKind, PaymentMethod } from './api/types'

export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  revenue: 'Revenue',
  expense: 'Expense',
}

// French display labels for the English enum members (see api/types.ts).
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  direct_debit: 'Domiciliation',
  bank_transfer: 'Virement',
  visa: 'Visa',
}

// A null payment_method means no payment is actually made (compte courant
// associés) - such a flow has no payment_date and never reaches cashflow.
export function paymentMethodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : 'No payment'
}

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  direct_debit: CalendarCheck,
  bank_transfer: Landmark,
  visa: CreditCard,
}

export function amountClass(kind: FlowKind): 'amount-positive' | 'amount-negative' {
  return kind === 'revenue' ? 'amount-positive' : 'amount-negative'
}

// For genuinely signed values only: account current_balance and the computed
// running balance in a projection point. Flow amounts are never signed - see
// formatFlowAmount below.
export function formatAmount(value: string): string {
  const n = Number(value)
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

// Flow gross amounts are an unsigned magnitude; kind (revenue/expense) carries
// the sign, applied here for display only.
export function formatFlowAmount(kind: FlowKind, amount: string): string {
  const n = Number(amount)
  return kind === 'revenue' ? `+${n.toFixed(2)}` : `-${n.toFixed(2)}`
}

// Plain two-decimal amount, no forced sign (a natural "-" still shows for
// negatives). For figures that stand on their own, e.g. VAT collected/due.
export function formatMoney(value: string): string {
  return Number(value).toFixed(2)
}

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Parses a YYYY-MM-DD date-only string as a *local* date, not UTC midnight -
// new Date('2026-09-15') would otherwise display as the previous day in
// timezones behind UTC.
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function todayDateInputValue(): string {
  return toInputValue(new Date())
}

export function addMonthsFrom(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return toInputValue(new Date(year, month - 1 + months, day))
}

export function addDaysFrom(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return toInputValue(new Date(year, month - 1, day + days))
}

// The next occurrence of day-of-month `day` on or after `reference` - that
// same month if the day hasn't passed yet, otherwise the next one. Date
// overflow (e.g. day 31 in a 30-day month) rolls into the following month.
function nextDayOfMonth(reference: Date, day: number): Date {
  const candidate = new Date(reference.getFullYear(), reference.getMonth(), day)
  if (candidate >= reference) return candidate
  return new Date(reference.getFullYear(), reference.getMonth() + 1, day)
}

// When a Visa charge is actually debited, in two hops: the invoice first lands
// on a statement (the next closing day on/after it), and that statement is then
// settled on the next payment day on/after it. With closing 25 / payment 5, an
// invoice on Mar 26 closes Apr 25 and is paid May 5; one on Mar 25 closes that
// day and is paid Apr 5. With no closing day the charge is simply debited on
// the next payment day - a single hop, exactly as this worked before. Mirrors
// backend/src/fisac/routers/projection.py's _visa_payment_date.
export function visaPaymentDate(
  invoiceIso: string,
  visaDay: number,
  closingDay?: number | null,
): string {
  const [year, month, day] = invoiceIso.split('-').map(Number)
  const invoice = new Date(year, month - 1, day)
  if (closingDay == null) return toInputValue(nextDayOfMonth(invoice, visaDay))
  const statementClose = nextDayOfMonth(invoice, closingDay)
  return toInputValue(nextDayOfMonth(statementClose, visaDay))
}
