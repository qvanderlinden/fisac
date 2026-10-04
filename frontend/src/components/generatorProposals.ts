import type { FlowCreate, FlowKind, FlowLineCreate, PaymentMethod, ScheduleOccurrence } from '../api/types'
import { NONE } from './flowOptions'

/** What the user enters once; it is applied to every occurrence the model proposes. */
export interface GeneratorTemplate {
  /** A category id as a string, or the `NONE` sentinel. */
  categoryId: string
  /** A payment method, or the `NONE` sentinel for "no payment". */
  paymentMethod: string
  lines: FlowLineCreate[]
}

/**
 * One unsaved flow per occurrence: the model supplies the names and dates, the
 * template everything else. A "no payment" or Visa template nulls the payment
 * date (Visa flows never store one: the projection derives it from the
 * account's Visa payment day); otherwise a null payment date from the model
 * falls back to the invoice date.
 */
export function buildProposals(
  occurrences: ScheduleOccurrence[],
  kind: FlowKind,
  template: GeneratorTemplate,
): FlowCreate[] {
  const noPayment = template.paymentMethod === NONE
  const isVisa = template.paymentMethod === 'visa'
  return occurrences.map((occ) => ({
    name: occ.name,
    kind,
    category_id: template.categoryId === NONE ? null : Number(template.categoryId),
    invoice_date: occ.invoice_date,
    payment_date: noPayment || isVisa ? null : (occ.payment_date ?? occ.invoice_date),
    payment_method: noPayment ? null : (template.paymentMethod as PaymentMethod),
    paid: false,
    lines: template.lines.map((l) => ({ ...l })),
  }))
}
