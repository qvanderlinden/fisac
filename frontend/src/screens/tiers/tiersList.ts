import type { ThirdPartyRead } from '../../api/types'
import { checkIban, type IbanState } from '../../iban'

// What the table and the cards share: the IBAN filter, the search, the sort
// and the labels of a row.

export type IbanFilter = 'all' | IbanState

export const IBAN_FILTERS: { value: IbanFilter; label: string }[] = [
  { value: 'all', label: 'Tous les tiers' },
  { value: 'valid', label: 'IBAN valide' },
  { value: 'missing', label: 'sans IBAN' },
  { value: 'invalid', label: 'IBAN invalide' },
]

export function ibanStateOf(t: ThirdPartyRead): IbanState {
  return checkIban(t.iban ?? '').state
}

export function filterByIban(rows: ThirdPartyRead[], filter: IbanFilter): ThirdPartyRead[] {
  return filter === 'all' ? rows : rows.filter((t) => ibanStateOf(t) === filter)
}

/** The search box: the name or the IBAN contains the text, spaces ignored (`q` comes lower-cased). */
export function matchesTiers(t: ThirdPartyRead, q: string): boolean {
  const text = q.replace(/\s+/g, '')
  return t.name.toLowerCase().replace(/\s+/g, '').includes(text) || (t.iban ?? '').toLowerCase().includes(text)
}

export type TiersSortKey = 'name' | 'iban' | 'uses'

/** Ascending orders; the name, first, also breaks ties. A tiers without IBAN sorts after the others. */
export const TIERS_COMPARE: Record<TiersSortKey, (a: ThirdPartyRead, b: ThirdPartyRead) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'fr'),
  iban: (a, b) => {
    if (a.iban === b.iban) return 0
    if (a.iban === null) return 1
    if (b.iban === null) return -1
    return a.iban < b.iban ? -1 : 1
  },
  uses: (a, b) => a.uses - b.uses,
}

/** The direction a first click on a column picks: the most used first. */
export const FIRST_DIR: Record<TiersSortKey, 'asc' | 'desc'> = { name: 'asc', iban: 'asc', uses: 'desc' }

export function displayName(t: { name: string } | undefined): string {
  return t?.name || 'Tiers sans nom'
}

/** The badge beside a row's IBAN; none for a valid one. */
export function ibanBadge(t: ThirdPartyRead): { tone: 'neutral' | 'warning'; label: string } | null {
  switch (ibanStateOf(t)) {
    case 'valid':
      return null
    case 'missing':
      return { tone: 'neutral', label: 'sans IBAN' }
    case 'invalid':
      return { tone: 'warning', label: 'IBAN invalide' }
  }
}
