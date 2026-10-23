import type { IsocRubric, IsocSchemeRead } from '../../api/types'
import { formatRate } from '../../format'

// What the table and the cards share: the rubric filter, the search, the sort and the
// labels of a row.

export const RUBRICS: Record<IsocRubric, { label: string; tone: 'neutral' | 'warning' | 'info' }> = {
  restaurant: { label: 'restaurant', tone: 'warning' },
  car: { label: 'voiture', tone: 'info' },
  other: { label: 'autres', tone: 'neutral' },
}

const RUBRIC_ORDER: IsocRubric[] = ['restaurant', 'car', 'other']

/** The rubric choices of the form. */
export const RUBRIC_OPTIONS = RUBRIC_ORDER.map((value) => ({ value, label: RUBRICS[value].label }))

export type RubricFilter = 'all' | IsocRubric

/** The rubric filter's choices. */
export const RUBRIC_FILTERS: { value: RubricFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les rubriques' },
  ...RUBRIC_OPTIONS,
]

export function filterByRubric(rows: IsocSchemeRead[], filter: RubricFilter): IsocSchemeRead[] {
  return filter === 'all' ? rows : rows.filter((s) => s.rubric === filter)
}

/** The search box: the name contains the text (`q` comes lower-cased). */
export function matchesScheme(s: IsocSchemeRead, q: string): boolean {
  return s.label.toLowerCase().includes(q)
}

export type IsocSortKey = 'label' | 'rate' | 'rubric' | 'uses'

/** Ascending orders; the name, first, also breaks ties. */
export const ISOC_COMPARE: Record<IsocSortKey, (a: IsocSchemeRead, b: IsocSchemeRead) => number> = {
  label: (a, b) => a.label.localeCompare(b.label, 'fr'),
  rate: (a, b) => Number(a.deductible_rate) - Number(b.deductible_rate),
  rubric: (a, b) => RUBRIC_ORDER.indexOf(a.rubric) - RUBRIC_ORDER.indexOf(b.rubric),
  uses: (a, b) => a.uses - b.uses,
}

/** The direction a first click on a column picks. */
export const FIRST_DIR: Record<IsocSortKey, 'asc' | 'desc'> = { label: 'asc', rate: 'desc', rubric: 'asc', uses: 'desc' }

export function displayName(s: { label: string } | undefined): string {
  return s?.label || 'Régime sans nom'
}

/** "69% déductible", for the delete confirmation. */
export function summary(s: IsocSchemeRead): string {
  return `${formatRate(s.deductible_rate)} déductible`
}
