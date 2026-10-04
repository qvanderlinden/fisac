import { describe, expect, it } from 'vitest'
import { classTag, codeHint, isValidCode } from './ledgerCode'

describe('isValidCode', () => {
  it('accepts digits starting with a class from 1 to 7', () => {
    for (const code of ['1', '61', '610000', '7', '70000000000000000000']) expect(isValidCode(code)).toBe(true)
  })

  it('rejects an empty code, classes 0, 8 and 9, and non-digits', () => {
    for (const code of ['', '0', '8', '9', '810', 'A1', '61a', '61 0', '6-1']) expect(isValidCode(code)).toBe(false)
  })

  it('rejects a code longer than the 20 characters the server accepts', () => {
    expect(isValidCode('6'.repeat(21))).toBe(false)
  })
})

describe('classTag', () => {
  it('previews the class of a valid code', () => {
    expect(classTag('610000')).toBe('6 charges')
    expect(classTag('7')).toBe('7 produits')
    expect(classTag('4')).toBe('4 créances et dettes')
  })

  it('is null for an invalid code', () => {
    expect(classTag('')).toBeNull()
    expect(classTag('8')).toBeNull()
  })
})

describe('codeHint', () => {
  it('says nothing for an empty or valid code', () => {
    expect(codeHint('')).toBeNull()
    expect(codeHint('610000')).toBeNull()
  })

  it('explains a code that starts wrong or holds non-digits', () => {
    expect(codeHint('8')).toBe('Un code ne contient que des chiffres et commence par une classe, de 1 à 7.')
    expect(codeHint('6x')).toBe('Un code ne contient que des chiffres et commence par une classe, de 1 à 7.')
  })

  it('explains a code that is too long', () => {
    expect(codeHint('6'.repeat(21))).toBe('Un code ne dépasse pas 20 chiffres.')
  })
})
