import type { PieceRead } from '../api/types'
import { countLabel, eur } from '../format'
import { periodsOf, signed, unpaidTotal, type PieceFilter } from './piecesList'
import type { SideCopy } from './sideCopy'

// What the table and the cards of Ventes and Achats share: the filter options and the
// labels of a row, in the side's words.

export type FilterKey = 'tiers' | 'status' | 'period' | 'kind'

export function statusFilters(copy: SideCopy): { value: string; label: string }[] {
  return [
    { value: 'all', label: copy.statusAll },
    { value: 'paid', label: copy.paidMany },
    { value: 'planned', label: copy.plannedMany },
    { value: 'late', label: 'en retard' },
  ]
}

export const KIND_FILTERS = [
  { value: 'all', label: 'Tous les types' },
  { value: 'invoice', label: 'factures' },
  { value: 'credit_note', label: 'notes de crédit' },
]

/** "Tous les clients", then the tiers the pieces carry, by name. */
export function tiersFilters(rows: PieceRead[], copy: SideCopy): { value: string; label: string }[] {
  const names = new Map<number, string>()
  for (const p of rows) if (p.third_party_id !== null) names.set(p.third_party_id, p.third_party_name ?? '')
  return [
    { value: 'all', label: copy.allTiers },
    ...[...names]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
      .map(([id, name]) => ({ value: String(id), label: name })),
  ]
}

/** "Toute l'année", then the VAT periods of the fiscal year (by booking date): months or quarters. */
export function periodFilters(
  fy: { start_date: string; end_date: string },
  monthly: boolean,
): { value: string; label: string }[] {
  return [{ value: 'all', label: 'Toute l’année' }, ...periodsOf(fy, monthly)]
}

/** A select's value into the filter, and back. */
export function setFilter(f: PieceFilter, key: FilterKey, value: string): PieceFilter {
  if (key === 'tiers') return { ...f, tiers: value === 'all' ? 'all' : Number(value) }
  return { ...f, [key]: value } as PieceFilter
}

export function filterValue(f: PieceFilter, key: FilterKey): string {
  return String(f[key])
}

export function pieceLabel(p: PieceRead, copy: SideCopy): string {
  return p.description || copy.untitled
}

/** "3 ventes" or "3 achats sur 12". */
export function countOf(shown: number, all: number, copy: SideCopy): string {
  return `${countLabel(shown, copy.one, copy.many)}${shown === all ? '' : ` sur ${all}`}`
}

/** "€1 234,00 à recevoir" / "… à payer", or "tout est payé". */
export function dueNote(rows: PieceRead[], copy: SideCopy): string {
  return rows.some((p) => p.status !== 'paid') ? `${eur(unpaidTotal(rows))} ${copy.due}` : 'tout est payé'
}

/** A row's amount with its sign: a credit note shows negative. */
export function rowAmount(p: PieceRead, amount: string): string {
  return eur(signed(p, amount))
}
