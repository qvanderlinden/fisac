import { describe, expect, it } from 'vitest'
import { schedule } from './depreciation'

const amounts = (rows: { amount: string }[]) => rows.map((r) => r.amount)

describe('schedule', () => {
  it('prorates the first linear year by days and leaves the remainder to the extra last year', () => {
    const rows = schedule('1000', '2026-07-01', 3, 'linear', 'prorata')
    expect(amounts(rows)).toEqual(['168.04', '333.33', '333.33', '165.30'])
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029])
    expect(rows[rows.length - 1].rest).toBe('0.00')
  })

  it('takes whole years, the last one the remainder', () => {
    expect(amounts(schedule('1000', '2026-07-01', 3, 'linear', 'full'))).toEqual(['333.33', '333.33', '333.34'])
  })

  it('declines at twice the linear rate, then goes linear', () => {
    const rows = schedule('1000', '2026-07-01', 5, 'declining', 'prorata')
    expect(rows[0].amount).toBe('201.64')
    expect(rows[1].amount).toBe('319.34')
    expect(rows[0].rest).toBe('798.36')
    const total = rows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0)
    expect(total).toBe(100000)
    expect(rows[rows.length - 1].rest).toBe('0.00')
  })

  it('gives nothing for a life that is not a whole number of years', () => {
    expect(schedule('1000', '2026-07-01', 0, 'linear', 'full')).toEqual([])
  })
})
