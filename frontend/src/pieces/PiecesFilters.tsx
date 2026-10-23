import { Search, X } from 'lucide-react'
import { Button, Input, Select } from '@qvanderlinden/ui'
import type { FiscalYearRead, PieceRead } from '../api/types'
import { KIND_FILTERS, filterValue, periodFilters, setFilter, statusFilters, tiersFilters, type FilterKey } from './listLabels'
import { NO_FILTER, isFiltered, type PieceFilter } from './piecesList'
import type { SideCopy } from './sideCopy'

/**
 * The search and the four filters of a list of sales or purchases (tiers, payment, VAT
 * period of the booking date — a month when the company files monthly, else a quarter —,
 * type): one row with "Effacer les filtres" on desktop, a two-column grid on mobile.
 */
export function PiecesFilters({
  rows,
  copy,
  fiscalYear,
  monthly,
  filter,
  onChange,
  mobile,
}: {
  rows: PieceRead[]
  copy: SideCopy
  fiscalYear: FiscalYearRead
  monthly: boolean
  filter: PieceFilter
  onChange(filter: PieceFilter): void
  mobile: boolean
}) {
  const pick = (key: FilterKey, label: string, options: { value: string; label: string }[], width: string) => (
    <Select
      size={mobile ? 'md' : 'sm'}
      aria-label={label}
      className={mobile ? 'w-full min-w-0' : width}
      options={options}
      value={filterValue(filter, key)}
      onValueChange={(v) => onChange(setFilter(filter, key, v))}
    />
  )
  const search = (
    <Input
      size={mobile ? 'md' : 'sm'}
      icon={Search}
      aria-label={copy.search}
      placeholder={copy.search}
      className={mobile ? undefined : 'w-80'}
      value={filter.query}
      onChange={(e) => onChange({ ...filter, query: e.target.value })}
    />
  )
  const tiers = pick('tiers', copy.tiers, tiersFilters(rows, copy), 'w-47.5')
  const status = pick('status', 'Paiement', statusFilters(copy), 'w-40')
  const period = pick('period', monthly ? 'Mois' : 'Trimestre', periodFilters(fiscalYear, monthly), 'w-40')
  const kind = pick('kind', 'Type', KIND_FILTERS, 'w-44')

  if (mobile) {
    return (
      <>
        {search}
        <div className="grid grid-cols-2 gap-2">
          {period}
          {status}
          {tiers}
          {kind}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {search}
      {tiers}
      {status}
      {period}
      {kind}
      {isFiltered(filter) ? (
        <Button variant="ghost" size="sm" iconLeft={X} onClick={() => onChange(NO_FILTER)}>
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  )
}
