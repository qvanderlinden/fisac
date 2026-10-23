import type {
  CategoryRead,
  CompanyRead,
  FinancialAccountRead,
  PaymentMethodRead,
  ThirdPartyRead,
  VatRegime,
  VatSchemeRead,
} from '../api/types'
import { useResource } from '../hooks/useResource'

export type PieceSide = 'sale' | 'purchase'

/** What a piece's form picks from: the tiers, its side's categories, VAT schemes and payment methods. */
export interface PieceRefs {
  thirdParties: ThirdPartyRead[]
  /** The side's categories, archived ones included (a line may still use one). */
  categories: CategoryRead[]
  /** The schemes the side may use. */
  vatSchemes: VatSchemeRead[]
  /** The methods the side may use: no card for a sale. */
  paymentMethods: PaymentMethodRead[]
  vatRegime: VatRegime
  /** The financial accounts: a card statement names the account that pays it. */
  accounts: FinancialAccountRead[]
}

/** Loads a side's `PieceRefs`; undefined until all have answered. */
export function usePieceRefs(side: PieceSide): { refs: PieceRefs | undefined; error: unknown } {
  const thirdParties = useResource<ThirdPartyRead[]>('/third-parties')
  const categories = useResource<CategoryRead[]>(`/categories?direction=${side === 'sale' ? 'sales' : 'purchases'}`)
  const vatSchemes = useResource<VatSchemeRead[]>('/vat-schemes')
  const paymentMethods = useResource<PaymentMethodRead[]>('/payment-methods')
  const company = useResource<CompanyRead>('/company')
  const accounts = useResource<FinancialAccountRead[]>('/financial-accounts')
  const error =
    thirdParties.error ?? categories.error ?? vatSchemes.error ?? paymentMethods.error ?? company.error ?? accounts.error
  if (
    !thirdParties.data ||
    !categories.data ||
    !vatSchemes.data ||
    !paymentMethods.data ||
    !company.data ||
    !accounts.data
  ) {
    return { refs: undefined, error }
  }
  return {
    refs: {
      thirdParties: thirdParties.data,
      categories: categories.data,
      vatSchemes: vatSchemes.data.filter((v) => (side === 'sale' ? v.for_sales : v.for_purchases)),
      paymentMethods: paymentMethods.data.filter((m) => side === 'purchase' || m.type !== 'card'),
      vatRegime: company.data.vat_regime,
      accounts: accounts.data,
    },
    error,
  }
}
