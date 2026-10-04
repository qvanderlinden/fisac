import { describe, expect, it } from 'vitest'
import type { VatFlow } from './api/types'
import { hasActivity, netDueTone, signTone, visibleVatFlows } from './reportFigures'

describe('signTone', () => {
  it('colours by the sign of the figure', () => {
    expect(signTone('12.50')).toBe('text-positive-fg')
    expect(signTone('-12.50')).toBe('text-negative-fg')
  })

  it('leaves zero, negative zero and rounding-level noise untoned', () => {
    expect(signTone('0')).toBe('')
    expect(signTone('0.00')).toBe('')
    expect(signTone('-0.00')).toBe('')
    expect(signTone('0.004')).toBe('')
    expect(signTone('-0.004')).toBe('')
  })
})

describe('netDueTone', () => {
  it('reads VAT owed as money out and a credit as money in', () => {
    expect(netDueTone('100.00')).toBe('text-negative-fg')
    expect(netDueTone('-100.00')).toBe('text-positive-fg')
  })

  it('leaves a settled quarter untoned', () => {
    expect(netDueTone('0.00')).toBe('')
    expect(netDueTone('-0.00')).toBe('')
  })
})

describe('hasActivity', () => {
  it('is true when either year has a figure', () => {
    expect(hasActivity('5.00', '0.00')).toBe(true)
    expect(hasActivity('0.00', '-5.00')).toBe(true)
  })

  it('is false when both years are zero', () => {
    expect(hasActivity('0.00', '0.00')).toBe(false)
    expect(hasActivity('-0.00', '0')).toBe(false)
  })
})

function vatFlow(patch: Partial<VatFlow>): VatFlow {
  return {
    id: 1,
    name: 'Facture',
    kind: 'expense',
    invoice_date: '2026-07-01',
    output_vat: '0.00',
    deductible_vat: '0.00',
    reverse_charge: false,
    gross_vat: '0.00',
    deduction_rate: '0.00',
    vat_rate: null,
    ...patch,
  }
}

describe('visibleVatFlows', () => {
  it('drops flows that carry no VAT', () => {
    const flows = [vatFlow({ id: 1 }), vatFlow({ id: 2, deductible_vat: '21.00' }), vatFlow({ id: 3, output_vat: '4.20' })]
    expect(visibleVatFlows(flows).map((f) => f.id)).toEqual([2, 3])
  })

  it('keeps a reverse-charge flow even when it nets to zero', () => {
    expect(visibleVatFlows([vatFlow({ id: 4, reverse_charge: true })]).map((f) => f.id)).toEqual([4])
  })

  it('is empty for no flows', () => {
    expect(visibleVatFlows([])).toEqual([])
  })
})
