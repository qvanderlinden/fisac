// The API's read shapes, written by hand from backend/src/fisac/schemas/*.py.
// Money and rates are decimal strings ("550.00", "21.00"); dates are
// YYYY-MM-DD strings. Both go through src/format.ts for display.

export type LegalForm = 'srl' | 'sa' | 'sc' | 'natural_person'
export type VatRegime = 'quarterly' | 'monthly' | 'franchise' | 'none'
export type FiscalYearState = 'open' | 'closed' | 'inventory_only'
export type IsocRubric = 'restaurant' | 'car' | 'other'
export type DepreciationMethod = 'linear' | 'declining'
export type DepreciationFirstYear = 'prorata' | 'full'
export type FinancialAccountKind = 'bank' | 'card' | 'cash'
export type PaymentMethodType = 'transfer' | 'direct_debit' | 'card' | 'cash'
export type CategoryKind = 'revenue' | 'expense' | 'tax' | 'fixed_asset' | 'outside'
export type CategoryRole =
  | 'sales'
  | 'net_salary'
  | 'social_contributions'
  | 'withholding_tax'
  | 'corporate_tax'
  | 'card_statement'
  | 'fixed_asset'
export type CategorySettlement = 'vat_return' | 'opening_inventory' | 'director_current_account'

export interface CompanyRead {
  name: string
  legal_form: LegalForm
  bce_number: string | null
  vat_regime: VatRegime
  registered_office: string | null
  iban: string | null
  fiscal_year_start_month: number
  manager_name: string | null
  manager_since: string | null
  manager_paid: boolean
}

export interface PartnerRead {
  id: number
  name: string
  shares: number
  contribution: string
}

export interface FiscalYearRead {
  id: number
  start_date: string
  end_date: string
  state: FiscalYearState
  isoc_small_company: boolean
  isoc_minimum_pay: boolean
  isoc_shares_owned: boolean
}

/** `GET /api/fiscal-years/next`: the period a POST would open. */
export interface NextPeriod {
  start_date: string
  end_date: string
}

export interface EquityLineRead {
  id: number
  label: string
  amount: string
}

export interface ThirdPartyRead {
  id: number
  name: string
  iban: string | null
  uses: number
}

export interface VatSchemeRead {
  id: number
  label: string
  rate: string
  recoverable_rate: string | null
  for_sales: boolean
  for_purchases: boolean
  uses: number
}

export interface IsocSchemeRead {
  id: number
  label: string
  deductible_rate: string
  rubric: IsocRubric
  uses: number
}

export interface DepreciationModelRead {
  id: number
  label: string
  years: number
  method: DepreciationMethod
  first_year: DepreciationFirstYear
  uses: number
}

export interface FinancialAccountRead {
  id: number
  code: string
  name: string
  kind: FinancialAccountKind
}

export interface PaymentMethodRead {
  id: number
  name: string
  type: PaymentMethodType
  financial_account_id: number
  financial_account_name: string
  statement_closing_day: number | null
  statement_payment_day: number | null
  settlement_account_id: number | null
  uses: number
}

export interface CategoryRead {
  id: number
  label: string
  kind: CategoryKind
  role: CategoryRole | null
  settlement: CategorySettlement | null
  default_vat_scheme_id: number | null
  default_isoc_scheme_id: number | null
  archived: boolean
  uses: number
}

/** What `api/client.ts` throws for a non-2xx response. `message` is the
 *  server's detail (for a 422, its first field message); `fields` maps a
 *  422's field names to their messages. */
export type ApiError = {
  status: number
  code?: 'in_use' | 'system' | 'last_partner'
  uses?: number
  message: string
  fields: Record<string, string>
}
