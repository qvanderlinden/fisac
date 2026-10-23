export type SortDir = 'asc' | 'desc'

export interface ListViewOptions<T> {
  /** The search box's text; trimmed and lower-cased before `matches` sees it, blank keeps every row. */
  query: string
  matches: (row: T, q: string) => boolean
  sort: { key: string; dir: SortDir }
  /** Ascending comparators by column key. The first one also breaks ties, always ascending. */
  compare: Record<string, (a: T, b: T) => number>
  page: number
  per?: number
}

export interface ListView<T> {
  rows: T[]
  total: number
  page: number
  pages: number
  /** The pager's "lignes 1–25 sur 30", or "aucune ligne". */
  label: string
}

/** What a configuration list shows: filtered, sorted and cut to one page of 25, all client-side. */
export function listView<T>(rows: T[], o: ListViewOptions<T>): ListView<T> {
  const per = o.per ?? 25
  const q = o.query.trim().toLowerCase()
  const shown = q ? rows.filter((r) => o.matches(r, q)) : [...rows]

  const tie = Object.values(o.compare)[0]
  const by = o.compare[o.sort.key] ?? tie
  const dir = o.sort.dir === 'asc' ? 1 : -1
  if (by) shown.sort((a, b) => by(a, b) * dir || (tie ? tie(a, b) : 0))

  const total = shown.length
  const pages = Math.max(1, Math.ceil(total / per))
  const page = Math.min(Math.max(1, Math.trunc(o.page) || 1), pages)
  const start = (page - 1) * per
  const end = Math.min(start + per, total)
  return {
    rows: shown.slice(start, end),
    total,
    page,
    pages,
    label: total ? `lignes ${start + 1}–${end} sur ${total}` : 'aucune ligne',
  }
}
