import type { AccountRead, CategoryRead, PaymentMethod } from '../api/types'
import { PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { formatRate } from '../format'

// Radix Select values can't be empty strings; this stands for "none".
export const NONE = 'none'

export const PAYMENT_METHODS: PaymentMethod[] = ['direct_debit', 'bank_transfer', 'visa']

interface OptionStyle {
  /**
   * The fuller wording of the flow form and the bulk dialogs: "Aucune
   * catégorie", the deductible rate, what "Sans paiement" means. The default
   * is the short wording of the table's inline selects.
   */
  detailed?: boolean
}

/** The category Select's options: "Aucune" first, then the account's categories. */
export function categoryOptions(categories: CategoryRead[], { detailed = false }: OptionStyle = {}) {
  if (!detailed) {
    return [{ value: NONE, label: 'Aucune' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]
  }
  return [
    { value: NONE, label: 'Aucune catégorie' },
    ...categories.map((c) => ({
      value: String(c.id),
      // One wrapper: the Select item is a flex row with a gap, which would
      // pull the figure away from its parentheses.
      label: (
        <span>
          {c.name} (<span className="numeric">{formatRate(c.tax_deduction_rate)}</span> déductible)
        </span>
      ),
    })),
  ]
}

/**
 * The payment-method Select's options: "Sans paiement" first, then each
 * method. Visa is offered only when the account has a Visa payment day,
 * since the projection derives a Visa flow's date from it.
 */
export function paymentMethodOptions(
  account: Pick<AccountRead, 'visa_payment_day'>,
  { detailed = false }: OptionStyle = {},
) {
  return [
    {
      value: NONE,
      label: detailed ? 'Sans paiement (compte courant associés)' : 'Sans paiement',
      disabled: false,
    },
    ...PAYMENT_METHODS.map((m) => {
      const noVisaDay = m === 'visa' && account.visa_payment_day == null
      return {
        value: m as string,
        label: detailed && noVisaDay ? `${PAYMENT_METHOD_LABELS[m]} (jour Visa du compte à définir)` : PAYMENT_METHOD_LABELS[m],
        disabled: noVisaDay,
      }
    }),
  ]
}
