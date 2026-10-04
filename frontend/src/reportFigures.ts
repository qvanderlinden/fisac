// Pure helpers shared by the two read-only reports (TVA, comptes annuels).
import type { VatFlow } from './api/types'

// A figure that shows as €0,00 carries no tone: below half a cent it rounds
// to zero (and "-0.00" must not read as negative).
function cents(value: string): number {
  const n = Number(value)
  return Math.abs(n) < 0.005 ? 0 : n
}

/** Signed figures (revenue positive, expense negative): the tone follows the sign. */
export function signTone(value: string): string {
  const n = cents(value)
  if (n > 0) return 'text-positive-fg'
  if (n < 0) return 'text-negative-fg'
  return ''
}

/** Net VAT owed (> 0) reads as money out; a credit (< 0) as money in. */
export function netDueTone(value: string): string {
  const n = cents(value)
  if (n > 0) return 'text-negative-fg'
  if (n < 0) return 'text-positive-fg'
  return ''
}

/** Whether a row has a figure in either year. */
export function hasActivity(current: string, prior: string): boolean {
  return cents(current) !== 0 || cents(prior) !== 0
}

/**
 * Flows that carry no VAT (e.g. uncategorized expenses, which recover 0%) add
 * nothing to either total, so they are noise. Reverse-charge flows are always
 * listed: even one that nets to zero still has to be reported.
 */
export function visibleVatFlows(flows: VatFlow[]): VatFlow[] {
  return flows.filter((f) => f.reverse_charge || cents(f.output_vat) !== 0 || cents(f.deductible_vat) !== 0)
}
