import type { VatPeriodRead, VatPeriodStatus, VatRegime, VatPieceRead } from '../../api/types'
import { formatDate } from '../../format'

/** The French word for a period's status. */
export const STATUS_WORDS: Record<VatPeriodStatus, string> = {
  current: 'en cours',
  to_file: 'à déposer',
  filed: 'déposée',
}

const monthName = (date: string) => formatDate(date, 'long').split(' ')[0]

/** A quarter by its number (`T1`), a month by its name (`octobre`). */
export function periodName(period: VatPeriodRead, regime: VatRegime): string {
  return regime === 'monthly' ? monthName(period.start) : `T${Math.ceil(Number(period.start.slice(5, 7)) / 3)}`
}

/** The tab label: `T1 · déposée`, `octobre · en cours`. */
export function periodLabel(period: VatPeriodRead, regime: VatRegime): string {
  return `${periodName(period, regime)} · ${STATUS_WORDS[period.status]}`
}

/** The months a period covers: `janvier – mars`, `octobre`. */
export function periodMonths(period: VatPeriodRead): string {
  const first = monthName(period.start)
  const last = monthName(period.end)
  return first === last ? first : `${first} – ${last}`
}

/** The tab to show: the one picked, else the first period still to file or running, else the last. */
export function defaultPeriod(periods: VatPeriodRead[]): VatPeriodRead | undefined {
  return periods.find((p) => p.status === 'to_file') ?? periods.find((p) => p.status === 'current') ?? periods.at(-1)
}

export type PieceFilter = 'all' | 'sale' | 'purchase'

export const PIECE_FILTERS: { value: PieceFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'sale', label: 'Ventes' },
  { value: 'purchase', label: 'Achats' },
]

export function filterPieces(pieces: VatPieceRead[], filter: PieceFilter): VatPieceRead[] {
  return filter === 'all' ? pieces : pieces.filter((p) => p.kind === filter)
}
