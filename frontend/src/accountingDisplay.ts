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

// The next occurrence of day-of-month `visaDay` on or after the invoice date -
// the invoice month if that day hasn't passed yet, otherwise the next month.
// Date overflow (e.g. day 31 in a 30-day month) rolls into the following month,
// which is acceptable for an auto-fill the user can still override.
export function visaPaymentDate(invoiceIso: string, visaDay: number): string {
  const [year, month, day] = invoiceIso.split('-').map(Number)
  const invoice = new Date(year, month - 1, day)
  let candidate = new Date(year, month - 1, visaDay)
  if (candidate < invoice) candidate = new Date(year, month, visaDay)
  return toInputValue(candidate)
}
