import type { FixedAssetStatus, RegisterRow, ScheduleRow } from '../../api/types'
import { reference } from '../../pieces/pieceStatus'

// What the register's table and cards share: the filters, the totals of the rows shown,
// the sort, the search of a purchase line to take over and the schedule's running sums.

export interface AssetFilter {
  /** The search box: description or reference. */
  query: string
  model: number | 'all'
  status: FixedAssetStatus | 'all'
}

export const NO_FILTER: AssetFilter = { query: '', model: 'all', status: 'all' }

export function isFiltered(f: AssetFilter): boolean {
  return f.query.trim() !== '' || f.model !== 'all' || f.status !== 'all'
}

export const STATUS_FILTERS: { value: FixedAssetStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'in_service', label: 'en service' },
  { value: 'depreciated', label: 'amorti' },
]

export function statusOf(status: FixedAssetStatus): { label: string; tone: 'positive' | 'neutral' } {
  return status === 'depreciated' ? { label: 'amorti', tone: 'neutral' } : { label: 'en service', tone: 'positive' }
}

function matches(r: RegisterRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  // "I-004", "i-4" or "004" find the asset by its number.
  const number = /^(?:i-)?0*(\d+)$/.exec(q)
  if (number && Number(number[1]) === r.number) return true
  return r.description.toLowerCase().includes(q) || reference('I', r.number).toLowerCase().includes(q)
}

export function filterAssets(rows: RegisterRow[], f: AssetFilter): RegisterRow[] {
  return rows.filter(
    (r) =>
      (f.model === 'all' || r.depreciation_model_id === f.model) &&
      (f.status === 'all' || r.status === f.status) &&
      matches(r, f.query),
  )
}

function cents(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

/** The sums of the rows shown, in cents. */
export function totals(rows: RegisterRow[]): { value: number; before: number; depreciation: number; remaining: number } {
  let value = 0
  let before = 0
  let depreciation = 0
  let remaining = 0
  for (const r of rows) {
    value += cents(r.value)
    before += cents(r.depreciated_before)
    depreciation += cents(r.depreciation)
    remaining += cents(r.remaining)
  }
  return { value: value / 100, before: before / 100, depreciation: depreciation / 100, remaining: remaining / 100 }
}

export type AssetSortKey = 'number' | 'description' | 'value' | 'before' | 'depreciation' | 'remaining' | 'status'

/** Ascending orders; the number, first, breaks ties. */
export const ASSET_COMPARE: Record<AssetSortKey, (a: RegisterRow, b: RegisterRow) => number> = {
  number: (a, b) => a.number - b.number,
  description: (a, b) => a.description.localeCompare(b.description, 'fr'),
  value: (a, b) => cents(a.value) - cents(b.value),
  before: (a, b) => cents(a.depreciated_before) - cents(b.depreciated_before),
  depreciation: (a, b) => cents(a.depreciation) - cents(b.depreciation),
  remaining: (a, b) => cents(a.remaining) - cents(b.remaining),
  status: (a, b) => Number(a.status === 'depreciated') - Number(b.status === 'depreciated'),
}

/** The direction a first click on a column picks: the oldest reference first, the largest amount first. */
export const FIRST_DIR: Record<AssetSortKey, 'asc' | 'desc'> = {
  number: 'asc',
  description: 'asc',
  value: 'desc',
  before: 'desc',
  depreciation: 'desc',
  remaining: 'desc',
  status: 'asc',
}

// A French amount with a decimal part ("1 500,00", "1500,5", "99.9 €") or a grouped one ("1 500").
const AMOUNT = /^\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,2})?$|^\d+[.,]\d{1,2}$/

/**
 * What the search of available purchase lines sends as `q` (R4): an amount typed the French
 * way ("1 500,00", "1500,5") in the API's form ("1500.00", "1500.50"); anything else as typed.
 */
export function availableQuery(text: string): string {
  const typed = text.trim().replace(/\s*€$/, '')
  if (!AMOUNT.test(typed)) return text.trim()
  const [whole, decimals = ''] = typed.replace(/[   ]/g, '').split(/[.,]/)
  return decimals ? `${whole}.${decimals.padEnd(2, '0')}` : whole
}

export interface ScheduleLine extends ScheduleRow {
  /** The amounts up to and including this year, and what is left of the value. */
  cumul: number
  rest: number
}

export interface ScheduleSummary {
  rows: ScheduleLine[]
  total: number
  /** value − total: positive when the schedule falls short, negative when it exceeds the value. */
  gap: number
  balanced: boolean
  /** How many rows were typed. */
  edited: number
}

/** The schedule with its running sums, its total against the value and the rows typed. */
export function scheduleSummary(schedule: ScheduleRow[], value: string): ScheduleSummary {
  let sum = 0
  const rows = schedule.map((r) => {
    sum += cents(r.amount)
    return { ...r, cumul: sum / 100, rest: (cents(value) - sum) / 100 }
  })
  const gap = cents(value) - sum
  return {
    rows,
    total: sum / 100,
    gap: gap / 100,
    balanced: gap === 0,
    edited: schedule.filter((r) => r.edited).length,
  }
}
