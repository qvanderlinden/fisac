import { describe, expect, it } from 'vitest'
import { fiscalYearHint, sharePercent } from './fiscalYearHint'

describe('fiscalYearHint', () => {
  it('says where the year starts and ends', () => {
    expect(fiscalYearHint(1)).toBe('L’exercice court du 1er janvier au 31 décembre')
    expect(fiscalYearHint(7)).toBe('L’exercice court du 1er juillet au 30 juin')
    expect(fiscalYearHint(3)).toBe('L’exercice court du 1er mars au 28 février')
  })
})

describe('sharePercent', () => {
  it('rounds to one decimal with a comma', () => {
    expect(sharePercent(1, 3)).toBe('33,3 %')
    expect(sharePercent(3, 3)).toBe('100 %')
  })
  it('is a dash with no parts issued', () => {
    expect(sharePercent(0, 0)).toBe('—')
  })
})
