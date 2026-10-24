import type { IsocSchemeRead } from '../api/types'

/** The scheme a purchase line with no ISOC scheme reads as: the one that deducts everything. */
export function fullDeduction(schemes: IsocSchemeRead[]): IsocSchemeRead | undefined {
  return schemes.find((s) => s.label === '100 %') ?? schemes.find((s) => Number(s.deductible_rate) === 100)
}

/**
 * The part of a charge the ISOC scheme does not deduct: `charge * (100 - deductible rate) %`,
 * in cents, half up (away from zero for a credit note's negative charge). Both are API
 * decimal strings: `nonDeductible('112.00', '69') === '34.72'`.
 */
export function nonDeductible(charge: string, deductibleRate: string): string {
  const cents = Math.round(Number(charge) * 100)
  const hundredths = Math.round(Number(deductibleRate) * 100)
  const share = Math.round((Math.abs(cents) * (10000 - hundredths)) / 10000)
  const signed = cents < 0 ? -share : share
  const abs = Math.abs(signed)
  return `${signed < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
