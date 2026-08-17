// Hand-maintained parallel types mirroring fisac/schemas.py field-for-field.
// Every money field is a `string`, not `number`: Pydantic v2 + FastAPI's
// response_model serializes Decimal to a JSON string, not a number.

export type FlowKind = 'revenue' | 'expense'

// English enum members; French display labels live in accountingDisplay.ts. A
// null payment_method means no payment is actually made (the old "compte
// courant associés") - such a flow carries no payment_date and never reaches
// cashflow.
export type PaymentMethod = 'direct_debit' | 'bank_transfer' | 'visa'

export interface AccountRead {
  id: number
  name: string
  current_balance: string
  is_company: boolean
  vat_applicable: boolean
  // Day of the month (1-31) the account's Visa charges are paid; feeds the
  // flow form's payment_date auto-fill.
  visa_payment_day: number | null
  sort_key: string
}

export interface AccountCreate {
  name: string
  current_balance?: string
  is_company?: boolean
  vat_applicable?: boolean
  visa_payment_day?: number | null
}

export interface AccountUpdate {
  name?: string
  current_balance?: string
  is_company?: boolean
  vat_applicable?: boolean
  visa_payment_day?: number | null
}

export interface CategoryRead {
  id: number
  account_id: number
  name: string
  // Both 0-100. tax: share deductible for income/corporate tax (remainder is
  // the "dépense non admise"); vat: share of VAT that is recoverable.
  tax_deduction_rate: string
  vat_deduction_rate: string
  sort_key: string
}

export interface CategoryCreate {
  name: string
  tax_deduction_rate?: string
  vat_deduction_rate?: string
}

export interface CategoryUpdate {
  name?: string
  tax_deduction_rate?: string
  vat_deduction_rate?: string
}

export interface FlowLineCreate {
  description?: string | null
  // Net base (excl. VAT), unsigned.
  amount_net: string
  vat_rate?: string
}

export interface FlowLineRead {
  id: number
  description: string | null
  amount_net: string
  vat_rate: string
  sort_key: string
}

export interface FlowCreate {
  name: string
  kind: FlowKind
  category_id: number | null
  invoice_date: string
  // A null payment_method must carry a null payment_date (no payment made).
  payment_date: string | null
  payment_method: PaymentMethod | null
  paid?: boolean
  // Reverse charge (autoliquidation), expenses only: no VAT paid to the
  // supplier (gross = net), notional VAT self-assessed on the VAT return.
  reverse_charge?: boolean
  lines: FlowLineCreate[]
}

export type FlowUpdate = FlowCreate

export interface FlowRead {
  id: number
  account_id: number
  name: string
  kind: FlowKind
  category_id: number | null
  invoice_date: string
  payment_date: string | null
  payment_method: PaymentMethod | null
  paid: boolean
  // Shared by all flows created in the same /bulk call; null otherwise.
  batch_id: string | null
  reverse_charge: boolean
  sort_key: string
  lines: FlowLineRead[]
  // Computed from the lines (nothing is stored on the flow header). For a
  // reverse-charge flow amount_gross === amount_net (no VAT paid); amount_vat
  // still carries the notional VAT used by the VAT report.
  amount_net: string
  amount_vat: string
  amount_gross: string
}

export interface FlowPaidSet {
  paid: boolean
}

// Applies each present field to every flow in flow_ids. Omit a field to leave
// it untouched; set category_id/payment_method to null to explicitly clear it.
// amount_net (with optional vat_rate) replaces each flow's whole line set with
// one line.
export interface FlowBulkUpdate {
  flow_ids: number[]
  category_id?: number | null
  payment_method?: PaymentMethod | null
  paid?: boolean
  reverse_charge?: boolean
  amount_net?: string
  vat_rate?: string
}

// --- LLM-assisted generation ---
// One instance of a recurring rule as proposed by the LLM: a period-aware name
// ("Cotisations sociales Q1") plus the two dates. Category, amounts, VAT and
// payment method are template data applied client-side to every occurrence.
export interface ScheduleOccurrence {
  name: string
  invoice_date: string
  payment_date: string | null
}

export interface FlowGenerateRequest {
  description: string
}

export interface FlowGenerateResponse {
  occurrences: ScheduleOccurrence[]
  model: string
  // OpenRouter provider slug that served the request, when reported - lets bad
  // formatting be traced to (and excluded via OPENROUTER_PROVIDERS) a provider.
  provider: string | null
}

export interface FlowBulkCreate {
  flows: FlowCreate[]
}

// The moved row lands strictly between these two neighbors (by their sort
// keys); null at either end means the start/end of the list.
export interface MoveRequest {
  after_id?: number | null
  before_id?: number | null
}

export interface ProjectionFlow {
  id: number
  name: string
  kind: FlowKind
  // Unsigned gross magnitude (Σ lines incl. VAT); kind supplies the sign.
  amount: string
  invoice_date: string
  payment_date: string
  paid: boolean
}

export interface ProjectionPoint {
  date: string
  flows: ProjectionFlow[]
  balance: string
}

export interface AccountProjection {
  as_of: string
  starting_balance: string
  points: ProjectionPoint[]
}

// --- VAT estimation (per quarter) ---
// One flow's contribution to a quarter's VAT: full output VAT for a revenue,
// recoverable input VAT (after the category's vat_deduction_rate) for an
// expense. Unsigned; kind supplies the direction. Money as string.
export interface VatFlow {
  id: number
  name: string
  kind: FlowKind
  invoice_date: string
  // This flow's contribution to the quarter totals. A normal revenue hits
  // output_vat only; a normal expense deductible_vat only; a reverse-charge
  // expense (autoliquidation) self-assesses the notional VAT and hits both.
  output_vat: string
  deductible_vat: string
  reverse_charge: boolean
  // Derivation context: gross_vat = full VAT before deduction; deduction_rate =
  // rate applied (100 revenue / category rate expense / 0 uncategorized);
  // vat_rate = the line VAT % if uniform, else null (mixed).
  gross_vat: string
  deduction_rate: string
  vat_rate: string | null
}

export interface VatQuarter {
  quarter: number // 1-4
  label: string // e.g. "Q1 2026"
  output_vat: string // VAT collected on revenues
  deductible_vat: string // recoverable VAT on expenses
  net_due: string // output - deductible (negative = VAT credit)
  flows: VatFlow[]
}

export interface AccountVat {
  year: number
  vat_applicable: boolean
  total_net_due: string
  quarters: VatQuarter[]
}
