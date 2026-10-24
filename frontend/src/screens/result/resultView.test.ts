import { describe, expect, it } from 'vitest'
import type { ResultRead } from '../../api/types'
import { pieceSide, resultClosing, resultSections, shareOfRevenue, spendingTotal } from './resultView'

const piece = { piece_id: 1, reference: 'S-0001', date: '2026-03-01', third_party: 'Client', amount: '100.00' }
const RESULT: ResultRead = {
  revenue: { total: '100.00', by_category: [{ category_id: 1, label: 'Prestations', total: '100.00', pieces: [piece] }] },
  charges: { total: '20.00', by_category: [{ category_id: 2, label: 'Loyer', total: '20.00', pieces: [piece, piece] }] },
  depreciation: { total: '10.00', by_asset: [{ asset_id: 7, reference: 'I-007', description: 'Ordinateur', amount: '10.00' }] },
  result: '70.00',
  estimated_tax: '14.95',
  majoration: '0.95',
  after_tax: '55.05',
}

describe('resultSections', () => {
  it('builds the three sections with their rows', () => {
    const [revenue, charges, depreciation] = resultSections(RESULT)
    expect(revenue.rows.map((r) => [r.label, r.count])).toEqual([['Prestations', '1 vente']])
    expect(charges.rows[0].count).toBe('2 achats')
    expect(depreciation.rows[0]).toMatchObject({ label: 'Ordinateur', count: 'I-007', assetId: 7 })
  })
})

describe('resultClosing', () => {
  it('ends on the result before tax, the estimated tax opening the ISOC screen, the result after tax', () => {
    expect(resultClosing(RESULT)).toEqual([
      { key: 'before', label: 'Résultat avant impôt', amount: '70.00', total: true },
      { key: 'tax', label: 'Impôt des sociétés estimé', amount: '14.95', total: false, to: '/isoc' },
      { key: 'after', label: 'Résultat de l’exercice', amount: '55.05', total: true },
    ])
  })
})

describe('spendingTotal', () => {
  it('adds the charges and the depreciation in cents', () => {
    expect(spendingTotal({ ...RESULT, charges: { ...RESULT.charges, total: '0.10' }, depreciation: { ...RESULT.depreciation, total: '0.20' } })).toBe('0.30')
  })
})

describe('shareOfRevenue', () => {
  it('words a share with a decimal comma', () => {
    expect(shareOfRevenue('85.10', '100.00')).toBe('85,1 %')
  })

  it('gives nothing without revenue', () => {
    expect(shareOfRevenue('10.00', '0.00')).toBeNull()
  })
})

describe('pieceSide', () => {
  it('reads the side from the reference', () => {
    expect(pieceSide('S-0001')).toBe('sale')
    expect(pieceSide('A-0012')).toBe('purchase')
    expect(pieceSide('I-001')).toBeNull()
  })
})
