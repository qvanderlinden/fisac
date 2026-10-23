import type { SaleRead } from '../../api/types'
import { countLabel, eur } from '../../format'
import { NO_FILTER, quartersOf, signed, unpaidTotal, type PieceFilter } from '../../pieces/piecesList'

// What the table and the cards share: the filter options and the labels of a row.

export const STATUS_FILTERS = [
  { value: 'all', label: 'Payées ou non' },
  { value: 'paid', label: 'payées' },
  { value: 'planned', label: 'planifiées' },
  { value: 'late', label: 'en retard' },
]

export const KIND_FILTERS = [
  { value: 'all', label: 'Tous les types' },
  { value: 'invoice', label: 'factures' },
  { value: 'credit_note', label: 'notes de crédit' },
]

/** "Tous les clients", then the tiers the sales carry, by name. */
export function tiersFilters(rows: SaleRead[]): { value: string; label: string }[] {
  const names = new Map<number, string>()
  for (const s of rows) if (s.third_party_id !== null) names.set(s.third_party_id, s.third_party_name ?? '')
  return [
    { value: 'all', label: 'Tous les clients' },
    ...[...names]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
      .map(([id, name]) => ({ value: String(id), label: name })),
  ]
}

/** "Toute l'année", then the quarters of the fiscal year (by booking date). */
export function periodFilters(fy: { start_date: string; end_date: string }): { value: string; label: string }[] {
  return [{ value: 'all', label: 'Toute l’année' }, ...quartersOf(fy)]
}

/** A select's value into the filter, and back. */
export function setFilter(f: PieceFilter, key: 'tiers' | 'status' | 'period' | 'kind', value: string): PieceFilter {
  if (key === 'tiers') return { ...f, tiers: value === 'all' ? 'all' : Number(value) }
  return { ...f, [key]: value } as PieceFilter
}

export function filterValue(f: PieceFilter, key: 'tiers' | 'status' | 'period' | 'kind'): string {
  return String(f[key])
}

export { NO_FILTER }

export function saleLabel(s: SaleRead): string {
  return s.description || 'Vente sans description'
}

/** "3 ventes" or "3 ventes sur 12". */
export function countOf(shown: number, all: number): string {
  return `${countLabel(shown, 'vente', 'ventes')}${shown === all ? '' : ` sur ${all}`}`
}

/** "€1 234,00 à recevoir", or "tout est payé". */
export function toReceive(rows: SaleRead[]): string {
  const due = unpaidTotal(rows)
  return rows.some((s) => !s.paid) ? `${eur(due)} à recevoir` : 'tout est payé'
}

/** A row's amount with its sign: a credit note shows negative. */
export function rowAmount(s: SaleRead, amount: string): string {
  return eur(signed(s, amount))
}
