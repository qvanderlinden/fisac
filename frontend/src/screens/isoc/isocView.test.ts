import { describe, expect, it } from 'vitest'
import type { IsocRead, ResultRead } from '../../api/types'
import { eur } from '../../format'
import { balanceLabel, computationRows, conditionLabels, lineTarget, prepaymentState } from './isocView'

const rubric = (total: string, lines: IsocRead['disallowed']['restaurant']['lines'] = []) => ({ total, lines })

const isoc = (over: Partial<IsocRead> = {}): IsocRead => ({
  before_tax: '94864.43',
  disallowed: {
    total: '28.47',
    restaurant: rubric('28.47', [
      { reference: 'A-0005', date: '2026-06-18', label: 'Repas client', amount: '91.84', deductible_rate: '69.00', disallowed: '28.47' },
    ]),
    car: rubric('0.00'),
    other: rubric('0.00'),
  },
  taxable_base: '94892.90',
  conditions: { small_company: true, minimum_pay: true, shares_owned: true },
  reduced: true,
  reduced_rate: '20.00',
  reduced_ceiling: '100000.00',
  normal_rate: '25.00',
  tax_reduced: '18978.58',
  tax_normal: '0.00',
  tax: '18978.58',
  majoration: {
    rate: '6.75',
    gross: '1281.05',
    bonification_total: '684.00',
    threshold: '94.89',
    amount: '597.05',
    exempt: false,
    exempt_reason: 'after_first_years',
  },
  prepayments: [],
  paid_total: '7600.00',
  balance: '11975.63',
  estimated_tax: '19575.63',
  after_tax: '75288.80',
  assessment_year: 2027,
  parameters_fallback: false,
  ...over,
})

describe('balanceLabel', () => {
  it('reads a negative balance as an excess of advance payments', () => {
    expect(balanceLabel('-100.00')).toBe('Excédent de versements')
    expect(balanceLabel('0.00')).toBe('Solde à payer')
    expect(balanceLabel('11378.58')).toBe('Solde à payer')
  })
})

describe('conditionLabels', () => {
  it('words the three conditions as met', () => {
    expect(conditionLabels).toEqual({
      small_company: 'Petite société',
      minimum_pay: 'Rémunération du dirigeant suffisante',
      shares_owned: 'Pas détenue à 50 % ou plus par une autre société',
    })
  })
})

describe('computationRows', () => {
  it('goes from the result before tax to the balance, one row per disallowed rubric with lines', () => {
    const rows = computationRows(isoc())
    expect(rows.map((r) => [r.label, r.amount, r.total ?? false])).toEqual([
      ['Résultat avant impôt', '94864.43', false],
      ['Dépenses non admises — Restaurant', '28.47', false],
      ['Base imposable', '94892.90', true],
      [`Impôt au taux réduit de 20% sur la tranche jusqu’à ${eur('100000')}`, '18978.58', false],
      ['Impôt au taux normal de 25% sur le surplus', '0.00', false],
      ['Impôt', '18978.58', true],
      ['Majoration pour versements insuffisants', '597.05', false],
      ['Impôt estimé', '19575.63', true],
      ['Versements anticipés', '-7600.00', false],
      ['Solde à payer', '11975.63', true],
    ])
    expect(rows[1].rubric).toBe('restaurant')
  })

  it('taxes the whole base at the normal rate when a condition is not met', () => {
    const rows = computationRows(isoc({ reduced: false, tax_reduced: '0.00', tax_normal: '23723.23', tax: '23723.23' }))
    expect(rows[3]).toMatchObject({ label: 'Impôt au taux réduit de 20%', meta: 'non applicable', amount: '0.00' })
    expect(rows[4]).toMatchObject({ label: 'Impôt au taux normal de 25% sur toute la base', amount: '23723.23' })
  })
})

describe('prepaymentState', () => {
  it('is paid, planned or empty', () => {
    expect(prepaymentState({ amount: '7600.00', paid: true })).toBe('payé')
    expect(prepaymentState({ amount: '7600.00', paid: false })).toBe('planifié')
    expect(prepaymentState({ amount: '0.00', paid: true })).toBe('aucun versement')
  })
})

describe('lineTarget', () => {
  const result = {
    revenue: { total: '0', by_category: [] },
    charges: {
      total: '91.84',
      by_category: [{ category_id: 1, label: 'Restaurant', total: '91.84', pieces: [{ piece_id: 12, reference: 'A-0005', date: '2026-06-18', third_party: null, amount: '91.84' }] }],
    },
    depreciation: { total: '500', by_asset: [{ asset_id: 3, reference: 'I-001', description: 'Voiture', amount: '500' }] },
    result: '0',
  } as unknown as ResultRead

  it('finds the purchase or the asset behind a disallowed line', () => {
    expect(lineTarget('A-0005', result)).toEqual({ kind: 'purchase', id: 12 })
    expect(lineTarget('I-001', result)).toEqual({ kind: 'asset', id: 3 })
    expect(lineTarget('A-0099', result)).toBeNull()
    expect(lineTarget('A-0005', undefined)).toBeNull()
  })
})
