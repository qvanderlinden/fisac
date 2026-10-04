import { describe, expect, it } from 'vitest'
import type { CategoryRead } from '../api/types'
import { NONE, categoryOptions, paymentMethodOptions } from './flowOptions'

const categories = [
  { id: 2, name: 'Essai fournitures' },
  { id: 3, name: 'Essai repas' },
] as CategoryRead[]

describe('categoryOptions', () => {
  it('starts with "Aucune" under the none sentinel, then one option per category', () => {
    expect(categoryOptions(categories)).toEqual([
      { value: NONE, label: 'Aucune' },
      { value: '2', label: 'Essai fournitures' },
      { value: '3', label: 'Essai repas' },
    ])
  })

  it('offers only "Aucune" for an account with no category', () => {
    expect(categoryOptions([])).toEqual([{ value: NONE, label: 'Aucune' }])
  })
})

describe('paymentMethodOptions', () => {
  it('starts with "Sans paiement" under the none sentinel, with the French labels', () => {
    const options = paymentMethodOptions({ visa_payment_day: 5 })
    expect(options.map((o) => [o.value, o.label])).toEqual([
      [NONE, 'Sans paiement'],
      ['direct_debit', 'Domiciliation'],
      ['bank_transfer', 'Virement'],
      ['visa', 'Visa'],
    ])
  })

  it('disables Visa only when the account has no Visa payment day', () => {
    const visa = (day: number | null) =>
      paymentMethodOptions({ visa_payment_day: day }).find((o) => o.value === 'visa')?.disabled
    expect(visa(null)).toBe(true)
    expect(visa(5)).toBe(false)
  })
})
