import { describe, expect, it } from 'vitest'
import { checkIban, groupIban, normalizeIban } from './iban'

describe('checkIban', () => {
  it('accepts a valid IBAN and names its country', () => {
    expect(checkIban('NL91ABNA0417164300')).toEqual({ state: 'valid', country: 'Pays-Bas' })
  })

  it('rejects a wrong check digit, still naming the country', () => {
    expect(checkIban('BE68539007547035')).toEqual({ state: 'invalid', country: 'Belgique' })
  })

  it('is missing when empty or blank', () => {
    expect(checkIban('')).toEqual({ state: 'missing' })
    expect(checkIban('   ')).toEqual({ state: 'missing' })
  })

  it('reads spaces and lower case as the server does', () => {
    expect(checkIban('be68 5390 0754 7034')).toEqual({ state: 'valid', country: 'Belgique' })
  })

  it('checks every country of the list, letters in the account included', () => {
    expect(checkIban('DE89370400440532013000')).toEqual({ state: 'valid', country: 'Allemagne' })
    expect(checkIban('FR1420041010050500013M02606')).toEqual({ state: 'valid', country: 'France' })
    expect(checkIban('LU280019400644750000')).toEqual({ state: 'valid', country: 'Luxembourg' })
  })

  it('rejects a known country at the wrong length', () => {
    expect(checkIban('BE6853900754703')).toEqual({ state: 'invalid', country: 'Belgique' })
  })

  it('names the country even when the format is wrong', () => {
    expect(checkIban('BEXX539007547034')).toEqual({ state: 'invalid', country: 'Belgique' })
  })

  it('accepts a valid IBAN of a country outside the list, without a name', () => {
    expect(checkIban('GB82WEST12345698765432')).toEqual({ state: 'valid' })
  })

  it('rejects more than 34 characters, even with a right check digit', () => {
    // 35 characters: mod 97 alone would not catch it.
    const long = 'XX00' + '1'.repeat(31)
    const digits = (long.slice(4) + 'XX00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
    const check = String(98 - Number(BigInt(digits) % 97n)).padStart(2, '0')
    expect(checkIban(`XX${check}${'1'.repeat(31)}`)).toEqual({ state: 'invalid' })
  })
})

describe('groupIban', () => {
  it('normalises and groups by four', () => {
    expect(groupIban('be68539007547034')).toBe('BE68 5390 0754 7034')
  })

  it('leaves a short last group and an empty value as they are', () => {
    expect(groupIban('NL91 abna 0417 1643 00')).toBe('NL91 ABNA 0417 1643 00')
    expect(groupIban('')).toBe('')
  })
})

describe('normalizeIban', () => {
  it('drops spaces and upper-cases, blank as null', () => {
    expect(normalizeIban(' be68 5390 0754 7034 ')).toBe('BE68539007547034')
    expect(normalizeIban('  ')).toBeNull()
  })
})
