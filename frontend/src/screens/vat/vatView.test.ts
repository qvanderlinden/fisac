import { describe, expect, it } from 'vitest'
import type { VatPeriodRead } from '../../api/types'
import { periodLabel, periodMonths, STATUS_WORDS } from './vatView'

const period = (over: Partial<VatPeriodRead>): VatPeriodRead => ({
  id: 1,
  start: '2026-01-01',
  end: '2026-03-31',
  due: '2026-04-20',
  filed_on: null,
  status: 'filed',
  sales_net: '0.00',
  sales_vat: '0.00',
  purchases_net: '0.00',
  purchases_vat_recovered: '0.00',
  balance: '0.00',
  pieces: [],
  ...over,
})

describe('periodLabel', () => {
  it('names a quarter by its number', () => {
    expect(periodLabel(period({}), 'quarterly')).toBe('T1 · déposée')
    expect(periodLabel(period({ start: '2026-10-01', end: '2026-12-31', status: 'to_file' }), 'quarterly')).toBe('T4 · à déposer')
  })

  it('names a month by its name', () => {
    expect(periodLabel(period({ start: '2026-10-01', end: '2026-10-31', status: 'current' }), 'monthly')).toBe('octobre · en cours')
  })

  it('has a French word per status', () => {
    expect(STATUS_WORDS).toEqual({ current: 'en cours', to_file: 'à déposer', filed: 'déposée' })
  })
})

describe('periodMonths', () => {
  it('spells the months a period covers', () => {
    expect(periodMonths(period({}))).toBe('janvier – mars')
    expect(periodMonths(period({ start: '2026-10-01', end: '2026-10-31' }))).toBe('octobre')
  })
})
