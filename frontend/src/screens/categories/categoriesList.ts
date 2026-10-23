import type { CategoryKind, CategoryRead, IsocSchemeRead, VatSchemeRead } from '../../api/types'

// What the table and the cards share: the kind tabs, the search, the sort and the
// labels of a row.

export type KindTab = 'all' | 'revenue' | 'expense' | 'outside'

export const KIND_TABS: { value: KindTab; label: string }[] = [
  { value: 'all', label: 'toutes' },
  { value: 'revenue', label: 'recettes' },
  { value: 'expense', label: 'dépenses' },
  { value: 'outside', label: 'hors résultat' },
]

/** The tab "hors résultat" also holds the taxes and the fixed assets: neither is a revenue or an expense. */
export function inKindTab(c: CategoryRead, tab: KindTab): boolean {
  if (tab === 'all') return true
  if (tab === 'outside') return c.kind === 'outside' || c.kind === 'tax' || c.kind === 'fixed_asset'
  return c.kind === tab
}

/** The kinds that carry a VAT and an ISOC default. */
export function isTaxed(kind: CategoryKind): boolean {
  return kind === 'revenue' || kind === 'expense' || kind === 'fixed_asset'
}

/** The rows a list shows: archived ones only on request. */
export function visible(rows: CategoryRead[], tab: KindTab, showArchived: boolean): CategoryRead[] {
  return rows.filter((c) => inKindTab(c, tab) && (showArchived || !c.archived))
}

/** Tab counts leave the archived categories out. */
export function tabCount(rows: CategoryRead[], tab: KindTab): number {
  return rows.filter((c) => !c.archived && inKindTab(c, tab)).length
}

/** The search box: the name contains the text (`q` comes lower-cased). */
export function matchesCategory(c: CategoryRead, q: string): boolean {
  return c.label.toLowerCase().includes(q)
}

export type CategorySortKey = 'label' | 'kind' | 'vat' | 'isoc' | 'uses'

const KIND_ORDER: Record<CategoryKind, number> = { revenue: 1, expense: 2, tax: 3, fixed_asset: 4, outside: 5 }

/** The labels of the schemes by id, for the table cells and the sort. */
export interface SchemeLabels {
  vat: Map<number, string>
  isoc: Map<number, string>
}

export function schemeLabels(vat: VatSchemeRead[], isoc: IsocSchemeRead[]): SchemeLabels {
  return {
    vat: new Map(vat.map((s) => [s.id, s.label])),
    isoc: new Map(isoc.map((s) => [s.id, s.label])),
  }
}

/** The VAT default cell: "—" for a kind without defaults, "hors TVA" for none. */
export function vatCell(c: CategoryRead, labels: SchemeLabels): string {
  if (!isTaxed(c.kind)) return '—'
  return c.default_vat_scheme_id === null ? 'hors TVA' : (labels.vat.get(c.default_vat_scheme_id) ?? 'hors TVA')
}

export function isocCell(c: CategoryRead, labels: SchemeLabels): string {
  if (!isTaxed(c.kind) || c.default_isoc_scheme_id === null) return '—'
  return labels.isoc.get(c.default_isoc_scheme_id) ?? '—'
}

/** Ascending orders; the name, first, also breaks ties. A missing default sorts after the others. */
export function categoryCompare(labels: SchemeLabels): Record<CategorySortKey, (a: CategoryRead, b: CategoryRead) => number> {
  const none = (t: string) => t === '—' || t === 'hors TVA'
  const text = (a: string, b: string) => (none(a) || none(b) ? Number(none(a)) - Number(none(b)) : a.localeCompare(b, 'fr'))
  return {
    label: (a, b) => a.label.localeCompare(b.label, 'fr'),
    kind: (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    vat: (a, b) => text(vatCell(a, labels), vatCell(b, labels)),
    isoc: (a, b) => text(isocCell(a, labels), isocCell(b, labels)),
    uses: (a, b) => a.uses - b.uses,
  }
}

/** The direction a first click on a column picks: the most used first. */
export const FIRST_DIR: Record<CategorySortKey, 'asc' | 'desc'> = {
  label: 'asc',
  kind: 'asc',
  vat: 'asc',
  isoc: 'asc',
  uses: 'desc',
}

export function displayName(c: { label: string } | undefined): string {
  return c?.label || 'Catégorie sans nom'
}

/** A category is deleted only when nothing carries it and no screen books into it. */
export function deletable(c: CategoryRead): boolean {
  return c.uses === 0 && c.role === null
}

/** The legend cards under the list: every kind but the fixed asset, which the "hors résultat" one covers. */
export const LEGEND_KINDS: CategoryKind[] = ['revenue', 'expense', 'tax', 'outside']

/** The line over a selection: what the bulk actions skip. */
export function selectionNote(picked: CategoryRead[]): string | undefined {
  const system = picked.filter((c) => c.role !== null).length
  const used = picked.filter((c) => c.role === null && c.uses > 0).length
  const parts = [
    system ? `${system} utilisée${system === 1 ? '' : 's'} par un écran : ${system === 1 ? 'elle reste' : 'elles restent'}` : '',
    used ? `${used} utilisée${used === 1 ? '' : 's'} : ${used === 1 ? 'elle ne peut' : 'elles ne peuvent'} qu’être archivée${used === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}
