import type { AccountRead, CategoryRead } from '../api/types'
import { PAYMENT_METHOD_LABELS } from '../accountingDisplay'
import { PAYMENT_METHODS } from './FlowForm'

// Radix Select values can't be empty strings; this stands for "none".
export const NONE = 'none'

/** The category Select's options: "Aucune" first, then the account's categories. */
export function categoryOptions(categories: CategoryRead[]) {
  return [{ value: NONE, label: 'Aucune' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]
}

/**
 * The payment-method Select's options: "Sans paiement" first, then each
 * method. Visa is offered only when the account has a Visa payment day,
 * since the projection derives a Visa flow's date from it.
 */
export function paymentMethodOptions(account: Pick<AccountRead, 'visa_payment_day'>) {
  return [
    { value: NONE, label: 'Sans paiement', disabled: false },
    ...PAYMENT_METHODS.map((m) => ({
      value: m as string,
      label: PAYMENT_METHOD_LABELS[m],
      disabled: m === 'visa' && account.visa_payment_day == null,
    })),
  ]
}
