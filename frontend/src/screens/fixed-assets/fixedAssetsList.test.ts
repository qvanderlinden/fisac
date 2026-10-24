import { describe, expect, it } from 'vitest'
import type { RegisterRow, ScheduleRow } from '../../api/types'
import {
  ASSET_COMPARE,
  NO_FILTER,
  availableQuery,
  filterAssets,
  isFiltered,
  scheduleSummary,
  totals,
} from './fixedAssetsList'

const row = (id: number, over: Partial<RegisterRow> = {}): RegisterRow => ({
  id,
  number: id,
  description: `Bien ${id}`,
  purchase_line_id: id,
  purchase_id: id,
  purchase_number: id,
  depreciation_model_id: 1,
  value: '1000.00',
  acquired_on: '2025-03-01',
  depreciated_before: '200.10',
  depreciation: '300.20',
  remaining: '499.70',
  status: 'in_service',
  schedule_balanced: true,
  ...over,
})

describe('totals', () => {
  it('sums each column in cents', () => {
    const rows = [row(1, { depreciation: '0.10' }), row(2, { depreciation: '0.20' })]
    expect(totals(rows)).toEqual({ value: 2000, before: 400.2, depreciation: 0.3, remaining: 999.4 })
  })
  it('is zero for no rows', () => {
    expect(totals([])).toEqual({ value: 0, before: 0, depreciation: 0, remaining: 0 })
  })
})

describe('filterAssets', () => {
  const rows = [
    row(1, { description: 'iPhone', status: 'depreciated' }),
    row(2, { description: 'Bureau', depreciation_model_id: 2 }),
    row(3, { description: 'Écran' }),
  ]
  it('keeps everything with no filter', () => {
    expect(filterAssets(rows, NO_FILTER)).toHaveLength(3)
    expect(isFiltered(NO_FILTER)).toBe(false)
  })
  it('filters on the status', () => {
    const f = { ...NO_FILTER, status: 'depreciated' as const }
    expect(filterAssets(rows, f).map((r) => r.id)).toEqual([1])
    expect(isFiltered(f)).toBe(true)
  })
  it('filters on the model', () => {
    expect(filterAssets(rows, { ...NO_FILTER, model: 2 }).map((r) => r.id)).toEqual([2])
  })
  it('searches the description and the reference', () => {
    expect(filterAssets(rows, { ...NO_FILTER, query: 'écran' }).map((r) => r.id)).toEqual([3])
    expect(filterAssets(rows, { ...NO_FILTER, query: 'I-002' }).map((r) => r.id)).toEqual([2])
    expect(filterAssets(rows, { ...NO_FILTER, query: '001' }).map((r) => r.id)).toEqual([1])
  })
})

describe('ASSET_COMPARE', () => {
  it('orders by the remaining value', () => {
    const a = row(1, { remaining: '10.00' })
    const b = row(2, { remaining: '9.00' })
    expect(ASSET_COMPARE.remaining(a, b)).toBeGreaterThan(0)
  })
})

describe('availableQuery', () => {
  it('turns a typed French amount into the API form', () => {
    expect(availableQuery('1 500,00')).toBe('1500.00')
    expect(availableQuery('1 500,00')).toBe('1500.00')
    expect(availableQuery('1500,5')).toBe('1500.50')
    expect(availableQuery('1500.5')).toBe('1500.50')
    expect(availableQuery(' 99,9 € ')).toBe('99.90')
    expect(availableQuery('1\u202f500,00')).toBe('1500.00')
    expect(availableQuery('1\u00a0500,00')).toBe('1500.00')
    expect(availableQuery('1 500')).toBe('1500')
    expect(availableQuery('1 234,567')).toBe('1 234,567')
  })
  it('sends plain text and bare numbers as they are', () => {
    expect(availableQuery('écran')).toBe('écran')
    expect(availableQuery('A-0003')).toBe('A-0003')
    expect(availableQuery('12')).toBe('12')
    expect(availableQuery('')).toBe('')
  })
})

describe('scheduleSummary', () => {
  const sched = (...amounts: number[]): ScheduleRow[] =>
    amounts.map((a, i) => ({ year: 2025 + i, amount: String(a), edited: i === 1 }))
  it('accumulates and leaves the residual', () => {
    const s = scheduleSummary(sched(100, 200, 300.5), '600.50')
    expect(s.rows.map((r) => [r.cumul, r.rest])).toEqual([
      [100, 500.5],
      [300, 300.5],
      [600.5, 0],
    ])
    expect(s.balanced).toBe(true)
    expect(s.gap).toBe(0)
  })
  it('reports a gap when the total is short or over', () => {
    expect(scheduleSummary(sched(100, 200), '350.00')).toMatchObject({ total: 300, gap: 50, balanced: false })
    expect(scheduleSummary(sched(100, 300), '350.00')).toMatchObject({ total: 400, gap: -50, balanced: false })
  })
  it('counts the edited rows', () => {
    expect(scheduleSummary(sched(1, 2, 3), '6.00').edited).toBe(1)
  })
})
