import { Search, X } from 'lucide-react'
import { Button, Input, Select } from '@qvanderlinden/ui'
import type { FiscalYearRead, SaleRead } from '../../api/types'
import { NO_FILTER, isFiltered, type PieceFilter } from '../../pieces/piecesList'
import { KIND_FILTERS, STATUS_FILTERS, filterValue, periodFilters, setFilter, tiersFilters } from './salesList'

type Key = 'tiers' | 'status' | 'period' | 'kind'

/**
 * The search and the four filters of the list (client, payment, quarter of the booking
 * date, type): one row with "Effacer les filtres" on desktop, a two-column grid on mobile.
 */
export function SalesFilters({
  rows,
  fiscalYear,
  filter,
  onChange,
  mobile,
}: {
  rows: SaleRead[]
  fiscalYear: FiscalYearRead
  filter: PieceFilter
  onChange(filter: PieceFilter): void
  mobile: boolean
}) {
  const pick = (key: Key, label: string, options: { value: string; label: string }[], width: string) => (
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
      aria-label="Chercher une description ou un client"
      placeholder="Chercher une description ou un client"
      className={mobile ? undefined : 'w-70'}
      value={filter.query}
      onChange={(e) => onChange({ ...filter, query: e.target.value })}
    />
  )
  const tiers = pick('tiers', 'Client', tiersFilters(rows), 'w-47.5')
  const status = pick('status', 'Paiement', STATUS_FILTERS, 'w-40')
  const period = pick('period', 'Trimestre', periodFilters(fiscalYear), 'w-36')
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
