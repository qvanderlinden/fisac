import type { PartnerRead } from '../../api/types'
import { MAX_AMOUNT, isBadAmount, parseDecimal } from '../../format'

/** A partner's name, or what stands for it while it is blank. */
export function displayName(p: Pick<PartnerRead, 'name'> | undefined): string {
  return p?.name.trim() ? p.name : 'Associé sans nom'
}

/** The parts issued and the contributions paid in, over all partners. */
export function totalsOf(rows: PartnerRead[]): { shares: number; contribution: number } {
  return {
    shares: rows.reduce((sum, p) => sum + p.shares, 0),
    contribution: rows.reduce((sum, p) => sum + Number(p.contribution), 0),
  }
}

/** Typed parts as a count: blank is none; null for a fraction, a negative or unreadable text. */
export function parseShares(text: string): number | null {
  const t = text.replace(/\s/g, '')
  if (t === '') return 0
  return /^\d{1,9}$/.test(t) ? Number(t) : null
}

/** Typed contribution as an API decimal: blank is zero; null when it cannot be sent. */
export function parseContribution(text: string): string | null {
  if (text.trim() === '') return '0'
  return isBadAmount(text, { max: MAX_AMOUNT }) ? null : parseDecimal(text)
}
