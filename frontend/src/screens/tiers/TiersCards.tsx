import { useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Select } from '@qvanderlinden/ui'
import type { ThirdPartyRead } from '../../api/types'
import { countLabel, formatNumber } from '../../format'
import { groupIban } from '../../iban'
import { listView, type SortDir } from '../../lists/listView'
import {
  IBAN_FILTERS,
  TIERS_COMPARE,
  displayName,
  filterByIban,
  ibanBadge,
  ibanStateOf,
  matchesTiers,
  usesLabel,
  type IbanFilter,
  type TiersSortKey,
} from './tiersList'

const SORTS: { value: string; label: string; key: TiersSortKey; dir: SortDir }[] = [
  { value: 'name-asc', label: 'Nom A–Z', key: 'name', dir: 'asc' },
  { value: 'name-desc', label: 'Nom Z–A', key: 'name', dir: 'desc' },
  { value: 'uses-desc', label: 'Plus utilisés', key: 'uses', dir: 'desc' },
  { value: 'iban-asc', label: 'Par IBAN', key: 'iban', dir: 'asc' },
]

/**
 * The mobile list (`MobileTiers` artboard): search, sort and IBAN filter, the count,
 * one card per tiers down to "fin de la liste", and the button that adds one.
 */
export function TiersCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: ThirdPartyRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IbanFilter>('all')
  const [sortValue, setSortValue] = useState(SORTS[0].value)
  const sort = SORTS.find((s) => s.value === sortValue) ?? SORTS[0]

  // The whole list on one page: the cards scroll to its end.
  const view = listView(filterByIban(rows, filter), {
    query,
    matches: matchesTiers,
    sort,
    compare: TIERS_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })
  const withoutValid = rows.filter((t) => ibanStateOf(t) !== 'valid').length

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <Input
          icon={Search}
          aria-label="Chercher un nom ou un IBAN"
          placeholder="Chercher un nom ou un IBAN"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Trier"
            options={SORTS}
            value={sortValue}
            onValueChange={setSortValue}
            className="w-full min-w-0"
          />
          <Select
            aria-label="IBAN"
            options={IBAN_FILTERS}
            value={filter}
            onValueChange={(value) => setFilter(value as IbanFilter)}
            className="w-full min-w-0"
          />
        </div>
        <div className="flex justify-between gap-2 text-sm text-fg-muted">
          <span>
            {countLabel(view.total, 'tiers', 'tiers')}
            {view.total === rows.length ? '' : ` sur ${formatNumber(rows.length)}`}
          </span>
          {rows.length > 0 ? (
            <span>{withoutValid ? `${withoutValid} sans IBAN valide` : 'tous les IBAN sont valides'}</span>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((t) => {
          const badge = ibanBadge(t)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="truncate text-sm font-medium text-fg-strong">{displayName(t)}</span>
                {t.iban ? (
                  <span className="truncate font-mono text-2xs tracking-wide text-fg-muted">{groupIban(t.iban)}</span>
                ) : null}
                {badge ? (
                  <span className="flex">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </span>
                ) : null}
              </span>
              <span className="numeric flex-none text-sm text-fg-muted">{usesLabel(t.uses)}</span>
            </button>
          )
        })}
        {view.total === 0 ? (
          <EmptyState
            icon={Users}
            title={query.trim() !== '' || filter !== 'all' ? 'Aucun tiers ne correspond' : 'Aucun tiers pour l’instant'}
          />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, 'tiers', 'tiers')}` : ''}
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouveau tiers"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
