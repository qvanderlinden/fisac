import { describe, expect, it } from 'vitest'
import { fullDeduction, nonDeductible } from './nonDeductible'

describe('nonDeductible', () => {
  it('is the charge share the scheme does not deduct, to the cent', () => {
    expect(nonDeductible('112.00', '69')).toBe('34.72')
    expect(nonDeductible('100.00', '100')).toBe('0.00')
    expect(nonDeductible('100.00', '0')).toBe('100.00')
  })
  it('rounds half up', () => {
    expect(nonDeductible('0.50', '50')).toBe('0.25')
    expect(nonDeductible('0.01', '50')).toBe('0.01')
    expect(nonDeductible('0.03', '50')).toBe('0.02')
  })
  it('keeps the sign of a credit note charge', () => {
    expect(nonDeductible('-112.00', '69')).toBe('-34.72')
  })
})

describe('fullDeduction', () => {
  const scheme = (id: number, label: string, rate: string) => ({ id, label, deductible_rate: rate, rubric: 'other' as const, uses: 0 })
  it('finds the "100 %" scheme, which a line without a scheme reads as', () => {
    expect(fullDeduction([scheme(1, 'Restaurant', '69'), scheme(2, '100 %', '100')])?.id).toBe(2)
    expect(fullDeduction([])).toBeUndefined()
  })
})
