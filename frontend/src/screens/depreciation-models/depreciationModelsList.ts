import type { DepreciationFirstYear, DepreciationMethod, DepreciationModelRead } from '../../api/types'
import { countLabel } from '../../format'

// What the table and the cards share: the use filter, the search, the sort and the
// labels of a row.

export const METHOD_LABELS: Record<DepreciationMethod, string> = { linear: 'linéaire', declining: 'dégressif' }
export const FIRST_YEAR_LABELS: Record<DepreciationFirstYear, string> = {
  prorata: 'au prorata des jours',
  full: 'année entière',
}

export const METHOD_OPTIONS = (Object.keys(METHOD_LABELS) as DepreciationMethod[]).map((value) => ({
  value,
  label: METHOD_LABELS[value],
}))
export const FIRST_YEAR_OPTIONS = (Object.keys(FIRST_YEAR_LABELS) as DepreciationFirstYear[]).map((value) => ({
  value,
  label: FIRST_YEAR_LABELS[value],
}))

export type UseFilter = 'all' | 'used' | 'unused'

/** The use filter's choices, as a select (desktop) or segments (mobile). */
export const USE_FILTERS: { value: UseFilter; label: string }[] = [
  { value: 'all', label: 'Tous les modèles' },
  { value: 'used', label: 'Utilisés' },
  { value: 'unused', label: 'Inutilisés' },
]

export function filterByUse(rows: DepreciationModelRead[], filter: UseFilter): DepreciationModelRead[] {
  return filter === 'all' ? rows : rows.filter((m) => (filter === 'used') === m.uses > 0)
}

/** The search box: the name contains the text (`q` comes lower-cased). */
export function matchesModel(m: DepreciationModelRead, q: string): boolean {
  return m.label.toLowerCase().includes(q)
}

export type ModelSortKey = 'label' | 'years' | 'method' | 'first' | 'uses'

/** Ascending orders; the name, first, also breaks ties. */
export const MODEL_COMPARE: Record<ModelSortKey, (a: DepreciationModelRead, b: DepreciationModelRead) => number> = {
  label: (a, b) => a.label.localeCompare(b.label, 'fr'),
  years: (a, b) => a.years - b.years,
  method: (a, b) => METHOD_LABELS[a.method].localeCompare(METHOD_LABELS[b.method], 'fr'),
  first: (a, b) => FIRST_YEAR_LABELS[a.first_year].localeCompare(FIRST_YEAR_LABELS[b.first_year], 'fr'),
  uses: (a, b) => a.uses - b.uses,
}

/** The direction a first click on a column picks. */
export const FIRST_DIR: Record<ModelSortKey, 'asc' | 'desc'> = {
  label: 'asc',
  years: 'asc',
  method: 'asc',
  first: 'asc',
  uses: 'desc',
}

export function displayName(m: { label: string } | undefined): string {
  return m?.label || 'Modèle sans libellé'
}

/** "5 ans". */
export function durationLabel(years: number): string {
  return countLabel(years, 'an', 'ans')
}

/** "3 immobilisations", a dash for none. */
export function assetsLabel(uses: number): string {
  return uses ? countLabel(uses, 'immobilisation', 'immobilisations') : '—'
}

/** "5 ans · linéaire", for the delete confirmation. */
export function summary(m: DepreciationModelRead): string {
  return `${durationLabel(m.years)} · ${METHOD_LABELS[m.method]}`
}
