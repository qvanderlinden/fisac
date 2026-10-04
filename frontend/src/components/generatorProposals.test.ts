import { describe, expect, it } from 'vitest'
import type { FlowLineCreate, ScheduleOccurrence } from '../api/types'
import { buildProposals } from './generatorProposals'

const occurrences: ScheduleOccurrence[] = [
  { name: 'Loyer janvier', invoice_date: '2027-01-01', payment_date: '2027-01-05' },
  { name: 'Loyer février', invoice_date: '2027-02-01', payment_date: null },
]
const lines: FlowLineCreate[] = [{ description: null, amount_net: '500', vat_rate: '0', ledger_account_id: null }]

describe('buildProposals', () => {
  it('applies the template to every occurrence, keeping the model dates', () => {
    const out = buildProposals(occurrences, 'expense', { categoryId: '3', paymentMethod: 'bank_transfer', lines })
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      name: 'Loyer janvier',
      kind: 'expense',
      category_id: 3,
      invoice_date: '2027-01-01',
      payment_date: '2027-01-05',
      payment_method: 'bank_transfer',
      paid: false,
      lines,
    })
  })

  it('falls back to the invoice date when the model left the payment date null', () => {
    const out = buildProposals(occurrences, 'expense', { categoryId: 'none', paymentMethod: 'direct_debit', lines })
    expect(out[1].payment_date).toBe('2027-02-01')
    expect(out[1].category_id).toBeNull()
  })

  it('nulls the payment date for Visa and for no payment', () => {
    const visa = buildProposals(occurrences, 'expense', { categoryId: 'none', paymentMethod: 'visa', lines })
    expect(visa.map((p) => [p.payment_method, p.payment_date])).toEqual([
      ['visa', null],
      ['visa', null],
    ])
    const none = buildProposals(occurrences, 'revenue', { categoryId: 'none', paymentMethod: 'none', lines })
    expect(none.map((p) => [p.kind, p.payment_method, p.payment_date])).toEqual([
      ['revenue', null, null],
      ['revenue', null, null],
    ])
  })

  it('gives every proposal its own copy of the lines', () => {
    const out = buildProposals(occurrences, 'expense', { categoryId: 'none', paymentMethod: 'none', lines })
    expect(out[0].lines).not.toBe(out[1].lines)
    expect(out[0].lines[0]).not.toBe(lines[0])
  })
})
