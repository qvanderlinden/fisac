import type { VatSchemeRead } from '../../api/types'
import { formatRate } from '../../format'

// What the table and the cards share: the "sens" tabs, the search, the sort and the
// labels of a row.

export type SensTab = 'all' | 'sales' | 'purchases'

export const SENS_TABS: { value: SensTab; label: string }[] = [
  { value: 'all', label: 'toutes' },
  { value: 'sales', label: 'ventes' },
  { value: 'purchases', label: 'achats' },
]

export function inSens(s: VatSchemeRead, tab: SensTab): boolean {
  return tab === 'all' || (tab === 'sales' ? s.for_sales : s.for_purchases)
}

export function sensRows(rows: VatSchemeRead[], tab: SensTab): VatSchemeRead[] {
  return rows.filter((s) => inSens(s, tab))
}

/** "ventes", "achats" or "ventes · achats". */
export function sensText(s: { for_sales: boolean; for_purchases: boolean }): string {
  return [s.for_sales ? 'ventes' : '', s.for_purchases ? 'achats' : ''].filter(Boolean).join(' · ')
}

/** Ventes green, achats amber, both blue. */
export function sensTone(s: { for_sales: boolean; for_purchases: boolean }): 'positive' | 'warning' | 'info' {
  return s.for_sales && s.for_purchases ? 'info' : s.for_sales ? 'positive' : 'warning'
}

/** The search box: the name contains the text (`q` comes lower-cased). */
export function matchesScheme(s: VatSchemeRead, q: string): boolean {
  return s.label.toLowerCase().includes(q)
}

export type VatSortKey = 'label' | 'sens' | 'rate' | 'uses'

/** Ascending orders; the name, first, also breaks ties. */
export const VAT_COMPARE: Record<VatSortKey, (a: VatSchemeRead, b: VatSchemeRead) => number> = {
  label: (a, b) => a.label.localeCompare(b.label, 'fr'),
  sens: (a, b) => sensText(a).localeCompare(sensText(b), 'fr'),
  rate: (a, b) => Number(a.rate) - Number(b.rate),
  uses: (a, b) => a.uses - b.uses,
}

/** The direction a first click on a column picks. */
export const FIRST_DIR: Record<VatSortKey, 'asc' | 'desc'> = { label: 'asc', sens: 'desc', rate: 'desc', uses: 'desc' }

export function displayName(s: { label: string } | undefined): string {
  return s?.label || 'Régime sans nom'
}

/** The recoverable share of a purchase scheme, a dash for a sales-only one. */
export function recoverableCell(s: VatSchemeRead): string {
  return s.for_purchases && s.recoverable_rate !== null ? formatRate(s.recoverable_rate) : '—'
}

/** "ventes · achats · 21%", for the delete confirmation. */
export function summary(s: VatSchemeRead): string {
  return `${sensText(s)} · ${formatRate(s.rate)}`
}
