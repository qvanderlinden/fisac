import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CategoryRead } from '../api/types'
import { NONE, categoryOptions, paymentMethodOptions } from './flowOptions'

const categories = [
  { id: 2, name: 'Essai fournitures', tax_deduction_rate: '100.00' },
  { id: 3, name: 'Essai repas', tax_deduction_rate: '69.00' },
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

const text = (label: unknown) => renderToStaticMarkup(<>{label}</>).replace(/<[^>]+>/g, '')

describe('detailed options (the labels of the flow form and the bulk dialogs)', () => {
  it('names "Aucune catégorie" and shows each category\'s deductible rate', () => {
    const options = categoryOptions(categories, { detailed: true })
    expect(options.map((o) => [o.value, text(o.label)])).toEqual([
      [NONE, 'Aucune catégorie'],
      ['2', 'Essai fournitures (100% déductible)'],
      ['3', 'Essai repas (69% déductible)'],
    ])
  })

  it('puts the rate in the numeric face', () => {
    const label = categoryOptions(categories, { detailed: true })[1].label
    expect(renderToStaticMarkup(<>{label}</>)).toContain('<span class="numeric">100%</span>')
  })

  it('explains "Sans paiement" and flags a Visa without a payment day', () => {
    const options = paymentMethodOptions({ visa_payment_day: null }, { detailed: true })
    expect(options.map((o) => [o.value, o.label, o.disabled])).toEqual([
      [NONE, 'Sans paiement (compte courant associés)', false],
      ['direct_debit', 'Domiciliation', false],
      ['bank_transfer', 'Virement', false],
      ['visa', 'Visa (jour Visa du compte à définir)', true],
    ])
    expect(paymentMethodOptions({ visa_payment_day: 5 }, { detailed: true }).at(-1)?.label).toBe('Visa')
  })
})
