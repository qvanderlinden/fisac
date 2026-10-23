// The IBAN check of backend/src/fisac/iban.py, run live in the forms: the same
// normalisation, country lengths and names, 34-character cap and mod 97, so a
// value the form calls valid is one the API accepts.

const LENGTHS: Record<string, number> = { BE: 16, NL: 18, LU: 20, DE: 22, FR: 27 }
const COUNTRIES: Record<string, string> = {
  BE: 'Belgique',
  NL: 'Pays-Bas',
  LU: 'Luxembourg',
  DE: 'Allemagne',
  FR: 'France',
}
/** The longest IBAN, and the width of the stored column. */
const MAX_LENGTH = 34
const FORMAT = /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/

export type IbanState = 'missing' | 'valid' | 'invalid'

export interface IbanCheck {
  state: IbanState
  /** The country's French name, for the countries of the list. */
  country?: string
}

/** Spaces removed, upper case; a blank value is null. */
export function normalizeIban(value: string): string | null {
  return value.replace(/\s+/g, '').toUpperCase() || null
}

/** `be68539007547034` → `BE68 5390 0754 7034`. */
export function groupIban(value: string): string {
  return (normalizeIban(value) ?? '').replace(/(.{4})(?!$)/g, '$1 ')
}

/** ISO 13616: the format, the country's length, then the rearranged number mod 97 is 1. */
export function checkIban(value: string): IbanCheck {
  const iban = normalizeIban(value)
  if (iban === null) return { state: 'missing' }
  const name = COUNTRIES[iban.slice(0, 2)]
  const result = (state: IbanState): IbanCheck => (name ? { state, country: name } : { state })
  if (iban.length > MAX_LENGTH || !FORMAT.test(iban)) return result('invalid')
  const length = LENGTHS[iban.slice(0, 2)]
  if (length !== undefined && iban.length !== length) return result('invalid')
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  // A letter is its base-36 value (A = 10 … Z = 35); the number is up to 68 digits, hence BigInt.
  const digits = [...rearranged].map((c) => parseInt(c, 36).toString()).join('')
  return result(BigInt(digits) % 97n === 1n ? 'valid' : 'invalid')
}
