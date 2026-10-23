import type { PieceKind, PieceRead, PieceStatus } from '../api/types'

// What the Ventes and Achats lists share: the filters, the totals of the rows
// shown and the sort. Piece reads are unsigned (as typed): `kind` carries the
// sign, applied here once.

export interface PieceFilter {
  tiers: number | 'all'
  status: PieceStatus | 'all'
  /** A calendar quarter of the booking date, `2026-3`, or 'all'. */
  period: string
  kind: PieceKind | 'all'
  /** The search box: description, tiers or number. */
  query: string
}

export const NO_FILTER: PieceFilter = { tiers: 'all', status: 'all', period: 'all', kind: 'all', query: '' }

export function isFiltered(f: PieceFilter): boolean {
  return f.tiers !== 'all' || f.status !== 'all' || f.period !== 'all' || f.kind !== 'all' || f.query.trim() !== ''
}

/** `2026-04-14` → `2026-2`. */
export function quarterOf(date: string): string {
  return `${date.slice(0, 4)}-${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`
}

/** The calendar quarters a fiscal year touches, as filter options: `T3 2026`. */
export function quartersOf(fy: { start_date: string; end_date: string }): { value: string; label: string }[] {
  const index = (date: string) => Number(date.slice(0, 4)) * 4 + Math.floor((Number(date.slice(5, 7)) - 1) / 3)
  const options = []
  for (let i = index(fy.start_date); i <= index(fy.end_date); i++) {
    const year = Math.floor(i / 4)
    const q = (i % 4) + 1
    options.push({ value: `${year}-${q}`, label: `T${q} ${year}` })
  }
  return options
}

function matches(p: PieceRead, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  // "S-0004", "a-12" or "0004" find the piece by its number.
  const number = /^(?:[a-z]-)?0*(\d+)$/.exec(q)
  if (number && Number(number[1]) === p.number) return true
  return p.description.toLowerCase().includes(q) || (p.third_party_name ?? '').toLowerCase().includes(q)
}

export function filterPieces<T extends PieceRead>(rows: T[], f: PieceFilter): T[] {
  return rows.filter(
    (p) =>
      (f.tiers === 'all' || p.third_party_id === f.tiers) &&
      (f.status === 'all' || p.status === f.status) &&
      (f.period === 'all' || quarterOf(p.booking_date) === f.period) &&
      (f.kind === 'all' || p.kind === f.kind) &&
      matches(p, f.query),
  )
}

export function signOf(kind: PieceKind): 1 | -1 {
  return kind === 'credit_note' ? -1 : 1
}

/** One of the piece's amounts with its sign: a credit note counts negative. */
export function signed(p: Pick<PieceRead, 'kind'>, amount: string): number {
  return signOf(p.kind) * Number(amount)
}

function cents(amount: string): number {
  return Math.round(Number(amount) * 100)
}

/** The sums of the rows shown, each credit note counting negative once; summed in cents. */
export function totals(rows: PieceRead[]): { net: number; vat: number; total: number } {
  let net = 0
  let vat = 0
  let total = 0
  for (const p of rows) {
    const s = signOf(p.kind)
    net += s * cents(p.net)
    vat += s * cents(p.vat)
    total += s * cents(p.total)
  }
  return { net: net / 100, vat: vat / 100, total: total / 100 }
}

/** What the unpaid rows still bring in (or cost), signed. */
export function unpaidTotal(rows: PieceRead[]): number {
  return rows.filter((p) => !p.paid).reduce((sum, p) => sum + signOf(p.kind) * cents(p.total), 0) / 100
}

export type PieceSortKey = 'date' | 'number' | 'tiers' | 'description' | 'status' | 'net' | 'vat' | 'total'

const STATUS_ORDER: Record<PieceStatus, number> = { paid: 0, planned: 1, late: 2 }

/** Ascending orders; the date, first, breaks ties (then the number). */
export const PIECE_COMPARE: Record<PieceSortKey, (a: PieceRead, b: PieceRead) => number> = {
  date: (a, b) => a.document_date.localeCompare(b.document_date) || a.number - b.number,
  number: (a, b) => a.number - b.number,
  tiers: (a, b) => (a.third_party_name ?? '').localeCompare(b.third_party_name ?? '', 'fr'),
  description: (a, b) => a.description.localeCompare(b.description, 'fr'),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  net: (a, b) => signed(a, a.net) - signed(b, b.net),
  vat: (a, b) => signed(a, a.vat) - signed(b, b.vat),
  total: (a, b) => signed(a, a.total) - signed(b, b.total),
}

/** The direction a first click on a column picks: newest and largest first. */
export const FIRST_DIR: Record<PieceSortKey, 'asc' | 'desc'> = {
  date: 'desc',
  number: 'desc',
  tiers: 'asc',
  description: 'asc',
  status: 'asc',
  net: 'desc',
  vat: 'desc',
  total: 'desc',
}

/** Today as a local `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}
