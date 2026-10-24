import { describe, expect, it } from 'vitest'
import type { IsocPrepaymentView, IsocRead } from '../../api/types'
import { eur } from '../../format'
import { balanceFootnote, balanceLabel, baseFootnote, bonificationText, computationRows, conditionLabels, lineTarget, paidBody, prepaymentState } from './isocView'

const rubric = (total: string, lines: IsocRead['disallowed']['restaurant']['lines'] = []) => ({ total, lines })

const isoc = (over: Partial<IsocRead> = {}): IsocRead => ({
  before_tax: '94864.43',
  disallowed: {
    total: '28.47',
    restaurant: rubric('28.47', [
      { reference: 'A-0005', date: '2026-06-18', label: 'Repas client', amount: '91.84', deductible_rate: '69.00', disallowed: '28.47', piece_id: 12, asset_id: null },
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
  it('opens the purchase or the asset the line carries', () => {
    expect(lineTarget({ piece_id: 12, asset_id: null })).toEqual({ kind: 'purchase', id: 12 })
    expect(lineTarget({ piece_id: null, asset_id: 3 })).toEqual({ kind: 'asset', id: 3 })
    expect(lineTarget({ piece_id: null, asset_id: null })).toBeNull()
  })
})

describe('paidBody', () => {
  it('keeps a date already saved, typed just before the tick', () => {
    expect(paidBody(true, { payment_date: '2026-04-02', due_date: '2026-04-10' })).toEqual({ paid: true })
  })
  it('pays on the due date when no date is known', () => {
    expect(paidBody(true, { payment_date: null, due_date: '2026-04-10' })).toEqual({ paid: true, payment_date: '2026-04-10' })
  })
  it('only unticks, keeping the date', () => {
    expect(paidBody(false, { payment_date: '2026-04-02', due_date: '2026-04-10' })).toEqual({ paid: false })
  })
})

describe('bonificationText', () => {
  const view = (over: Partial<IsocPrepaymentView>): IsocPrepaymentView => ({
    id: 3, number: 3, due_date: '2026-10-12', amount: '5000.00', payment_method_id: 1, paid: true,
    payment_date: '2026-10-20', quarter: 4, bonification_rate: '4.5', bonification: '225.00', ...over,
  })
  it('says which quarter a late payment counts for', () => {
    expect(bonificationText(view({}))).toBe(`4,5% · ${eur('225')} (compte pour VA4)`)
  })
  it('shows the rate alone when it counts for its own quarter', () => {
    expect(bonificationText(view({ quarter: 3, bonification_rate: '6', bonification: '300.00' }))).toBe(`6% · ${eur('300')}`)
  })
  it('shows a dash when unpaid', () => {
    expect(bonificationText(view({ paid: false, quarter: null, bonification_rate: null, bonification: '0.00' }))).toBe('—')
  })
})

describe('baseFootnote', () => {
  it('names the disallowed part of the base', () => {
    expect(baseFootnote(isoc())).toBe(`dont ${eur('28.47')} de dépenses non admises`)
  })
  it('says a loss brought the base to zero', () => {
    const loss = isoc({ before_tax: '-1467.20', taxable_base: '0.00' })
    expect(baseFootnote(loss)).toBe(`ramenée à zéro · perte de ${eur('1438.73')}`)
  })
})

describe('balanceFootnote', () => {
  it('never mentions the inventory', () => {
    expect(balanceFootnote('11975.63')).toBe('impôt estimé moins les versements payés')
    expect(balanceFootnote('-25.00')).toBe('versements au-delà de l’impôt estimé')
  })
})
