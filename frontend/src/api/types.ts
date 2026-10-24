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
export type CategoryDirection = 'sales' | 'purchases'
export type PieceKind = 'invoice' | 'credit_note'
export type PieceStatus = 'paid' | 'planned' | 'late'
export type FixedAssetStatus = 'in_service' | 'depreciated'
export type VatPeriodStatus = 'current' | 'to_file' | 'filed'

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
  /** The date the company was incorporated; null until it is typed. */
  incorporated_on: string | null
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
  direction: CategoryDirection
  archived: boolean
  uses: number
}

export interface LineRead {
  id: number
  description: string
  unit_price: string
  quantity: string
  category_id: number
  vat_scheme_id: number
  net: string
  vat: string
}

export interface PurchaseLineRead extends LineRead {
  recovered: string
  charge: string
  /** The register entry that takes the line over, when there is one. */
  fixed_asset_id: number | null
  fixed_asset_number: number | null
  /** The ISOC scheme of the line; null reads as the "100 %" scheme. */
  isoc_scheme_id: number | null
}

/** Piece reads are unsigned (as typed): `kind` carries the sign. */
export interface PieceRead {
  id: number
  fiscal_year_id: number
  number: number
  kind: PieceKind
  third_party_id: number | null
  third_party_name: string | null
  description: string
  document_date: string
  /** The effective booking date (the document date unless one was set). */
  booking_date: string
  payment_method_id: number
  payment_date: string
  /** null for a purchase paid by card: it has no paid status, `status` follows its payment date. */
  paid: boolean | null
  status: PieceStatus
  net: string
  vat: string
  total: string
}

export interface SaleRead extends PieceRead {
  lines: LineRead[]
}

export interface PurchaseRead extends PieceRead {
  recovered: string
  charge: string
  lines: PurchaseLineRead[]
}

export interface AvailableLine {
  id: number
  purchase_id: number
  purchase_number: number
  fiscal_year: number
  third_party_name: string | null
  description: string
  net: string
  charge: string
  booking_date: string
}

export interface ScheduleRow {
  year: number
  amount: string
  edited: boolean
}

interface FixedAssetBase {
  id: number
  number: number
  description: string
  purchase_line_id: number
  purchase_id: number
  purchase_number: number
  depreciation_model_id: number
  value: string
  acquired_on: string
}

export interface FixedAssetRead extends FixedAssetBase {
  schedule: ScheduleRow[]
}

export interface RegisterRow extends FixedAssetBase {
  depreciated_before: string
  depreciation: string
  remaining: string
  status: FixedAssetStatus
  schedule_balanced: boolean
}

export interface MovementRead {
  date: string
  kind: 'sale' | 'purchase' | 'card_statement'
  piece_id: number | null
  reference: string
  label: string
  amount: string
  balance: string
  planned: boolean
}

export interface JournalRead {
  account: FinancialAccountRead
  opening: string
  receipts: string
  payments: string
  closing: string
  movements: MovementRead[]
}

export interface VatPieceRead {
  kind: 'sale' | 'purchase'
  piece_id: number
  number: string
  date: string
  third_party: string | null
  net: string
  vat: string
  recovered: string
}

export interface VatPeriodRead {
  id: number
  start: string
  end: string
  due: string
  filed_on: string | null
  status: VatPeriodStatus
  sales_net: string
  sales_vat: string
  purchases_net: string
  purchases_vat_recovered: string
  balance: string
  pieces: VatPieceRead[]
}

export interface VatPeriodsRead {
  regime: VatRegime
  periods: VatPeriodRead[]
}

export interface ResultPieceRead {
  piece_id: number
  reference: string
  date: string
  third_party: string | null
  amount: string
}

export interface ResultCategoryRead {
  category_id: number
  label: string
  total: string
  pieces: ResultPieceRead[]
}

export interface ResultGroupRead {
  total: string
  by_category: ResultCategoryRead[]
}

export interface ResultAssetRead {
  asset_id: number
  reference: string
  description: string
  amount: string
}

export interface ResultDepreciationRead {
  total: string
  by_asset: ResultAssetRead[]
}

export interface ResultRead {
  revenue: ResultGroupRead
  charges: ResultGroupRead
  depreciation: ResultDepreciationRead
  result: string
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

/** `GET /api/fiscal-years/{id}/isoc-prepayments`: the year's four advance payments (created on first read). */
export interface IsocPrepaymentRead {
  id: number
  number: number
  due_date: string
  amount: string
  payment_method_id: number
  paid: boolean
  payment_date: string | null
}

export interface DisallowedLineRead {
  /** `A-0001` for a purchase, `I-001` for a fixed asset's depreciation. */
  reference: string
  date: string
  /** The purchase's third party, or the asset's description. */
  label: string
  /** The signed charge, or the asset's depreciation of the year. */
  amount: string
  deductible_rate: string
  disallowed: string
}

export interface DisallowedRubricRead {
  total: string
  lines: DisallowedLineRead[]
}

export interface IsocPrepaymentView {
  /** null until `GET …/isoc-prepayments` has created the row. */
  id: number | null
  number: number
  due_date: string
  amount: string
  payment_method_id: number | null
  paid: boolean
  payment_date: string | null
  /** The quarter it counts for; null when unpaid or paid after the fourth due date. */
  quarter: number | null
  bonification_rate: string | null
  bonification: string
}

export type ExemptReason = 'first_years' | 'not_small_company' | 'no_incorporation_date' | 'after_first_years'

/** `GET /api/fiscal-years/{id}/isoc`: the corporate tax of the year, an estimation. */
export interface IsocRead {
  before_tax: string
  disallowed: { total: string } & Record<IsocRubric, DisallowedRubricRead>
  taxable_base: string
  /** Read as "condition met". */
  conditions: { small_company: boolean; minimum_pay: boolean; shares_owned: boolean }
  reduced: boolean
  reduced_rate: string
  reduced_ceiling: string
  normal_rate: string
  tax_reduced: string
  tax_normal: string
  tax: string
  majoration: {
    rate: string
    gross: string
    bonification_total: string
    threshold: string
    amount: string
    exempt: boolean
    /** `first_years` when exempt; otherwise why not. */
    exempt_reason: ExemptReason
  }
  prepayments: IsocPrepaymentView[]
  paid_total: string
  balance: string
  estimated_tax: string
  after_tax: string
  assessment_year: number
  parameters_fallback: boolean
}
