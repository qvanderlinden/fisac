import type { CategoryDirection, CategoryRead } from '../../api/types'

// What the table and the cards share: the direction tabs, the search, the sort and the
// labels of a row.

export const DIRECTION_TABS: { value: CategoryDirection; label: string }[] = [
  { value: 'sales', label: 'ventes' },
  { value: 'purchases', label: 'achats' },
]

/** The rows a list shows: the tab's direction, archived ones only on request. */
export function visible(rows: CategoryRead[], tab: CategoryDirection, showArchived: boolean): CategoryRead[] {
  return rows.filter((c) => c.direction === tab && (showArchived || !c.archived))
}

/** Tab counts leave the archived categories out. */
export function tabCount(rows: CategoryRead[], tab: CategoryDirection): number {
  return rows.filter((c) => !c.archived && c.direction === tab).length
}

/** The search box: the name contains the text (`q` comes lower-cased). */
export function matchesCategory(c: CategoryRead, q: string): boolean {
  return c.label.toLowerCase().includes(q)
}

export type CategorySortKey = 'label' | 'uses'

/** Ascending orders; the name, first, also breaks ties. */
export const CATEGORY_COMPARE: Record<CategorySortKey, (a: CategoryRead, b: CategoryRead) => number> = {
  label: (a, b) => a.label.localeCompare(b.label, 'fr'),
  uses: (a, b) => a.uses - b.uses,
}

/** The direction a first click on a column picks: the most used first. */
export const FIRST_DIR: Record<CategorySortKey, 'asc' | 'desc'> = {
  label: 'asc',
  uses: 'desc',
}

export function displayName(c: { label: string } | undefined): string {
  return c?.label || 'Catégorie sans nom'
}

/** A category is deleted only when no line carries it. */
export function deletable(c: CategoryRead): boolean {
  return c.uses === 0
}

/** The line over a selection: what the bulk actions skip. */
export function selectionNote(picked: CategoryRead[]): string | undefined {
  const used = picked.filter((c) => c.uses > 0).length
  return used
    ? `${used} utilisée${used === 1 ? '' : 's'} : ${used === 1 ? 'elle ne peut' : 'elles ne peuvent'} qu’être archivée${used === 1 ? '' : 's'}`
    : undefined
}
