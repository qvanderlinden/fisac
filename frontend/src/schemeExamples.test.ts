import { describe, expect, it } from 'vitest'
import { isocExample, vatExample } from './schemeExamples'

describe('vatExample', () => {
  it('gives a purchase its VAT, the part recovered and the charge', () => {
    expect(vatExample({ rate: '21', recoverable_rate: '50', for_sales: false, for_purchases: true })).toEqual([
      { side: 'purchase', vat: '21.00', second: '10.50', third: '110.50' },
    ])
  })

  it('gives a sale its VAT, the amount invoiced and the revenue', () => {
    expect(vatExample({ rate: '21', recoverable_rate: null, for_sales: true, for_purchases: false })).toEqual([
      { side: 'sale', vat: '21.00', second: '121.00', third: '100.00' },
    ])
  })

  it('gives a scheme of both sides two rows, the sale first', () => {
    expect(vatExample({ rate: '0', recoverable_rate: '0', for_sales: true, for_purchases: true })).toEqual([
      { side: 'sale', vat: '0.00', second: '100.00', third: '100.00' },
      { side: 'purchase', vat: '0.00', second: '0.00', third: '100.00' },
    ])
  })

  it('takes decimal rates from the API and rounds the recovered part to the cent', () => {
    expect(vatExample({ rate: '5.50', recoverable_rate: '33.33', for_sales: false, for_purchases: true })).toEqual([
      { side: 'purchase', vat: '5.50', second: '1.83', third: '103.67' },
    ])
  })

  it('recovers nothing when a purchase has no recoverable rate', () => {
    expect(vatExample({ rate: '12', recoverable_rate: null, for_sales: false, for_purchases: true })).toEqual([
      { side: 'purchase', vat: '12.00', second: '0.00', third: '112.00' },
    ])
  })

  it('has no row for a rate that is not a percentage', () => {
    expect(vatExample({ rate: '', recoverable_rate: null, for_sales: true, for_purchases: false })).toEqual([])
    expect(vatExample({ rate: '101', recoverable_rate: null, for_sales: true, for_purchases: false })).toEqual([])
  })
})

describe('isocExample', () => {
  it('splits a €100 expense into the part admitted and the part disallowed', () => {
    expect(isocExample('69')).toEqual({ admitted: '69.00', disallowed: '31.00' })
    expect(isocExample('100.00')).toEqual({ admitted: '100.00', disallowed: '0.00' })
    expect(isocExample('0')).toEqual({ admitted: '0.00', disallowed: '100.00' })
  })
})
