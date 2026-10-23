import { useCallback, useMemo, useState } from 'react'

/** `set` with `id` flipped, as a new set. */
export function toggleId<Id>(set: ReadonlySet<Id>, id: Id): Set<Id> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * The header checkbox: when every id of the page is already selected they are all
 * dropped, otherwise they are all added. Ids from other pages are kept either way.
 */
export function toggleAllIds<Id>(set: ReadonlySet<Id>, ids: readonly Id[]): Set<Id> {
  const next = new Set(set)
  const every = ids.length > 0 && ids.every((id) => set.has(id))
  for (const id of ids) {
    if (every) next.delete(id)
    else next.add(id)
  }
  return next
}

export interface Selection<Id> {
  selected: Set<Id>
  toggle(id: Id): void
  toggleAll(ids: Id[]): void
  clear(): void
}

/** The rows ticked in a list, for the bulk bar. */
export function useSelection<Id>(): Selection<Id> {
  const [selected, setSelected] = useState<Set<Id>>(() => new Set())
  const toggle = useCallback((id: Id) => setSelected((s) => toggleId(s, id)), [])
  const toggleAll = useCallback((ids: Id[]) => setSelected((s) => toggleAllIds(s, ids)), [])
  const clear = useCallback(() => setSelected((s) => (s.size ? new Set() : s)), [])
  return useMemo(() => ({ selected, toggle, toggleAll, clear }), [selected, toggle, toggleAll, clear])
}
