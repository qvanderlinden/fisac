import { useState } from 'react'
import { Landmark, Plus, Search, X } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Select } from '@qvanderlinden/ui'
import type { IsocSchemeRead } from '../../api/types'
import { countLabel, formatNumber, formatRate } from '../../format'
import { usesLabel } from '../../lists/inUse'
import { listView, type SortDir } from '../../lists/listView'
import {
  ISOC_COMPARE,
  RUBRICS,
  RUBRIC_FILTERS,
  displayName,
  filterByRubric,
  matchesScheme,
  type IsocSortKey,
  type RubricFilter,
} from './isocSchemesList'

const SORTS: { value: string; label: string; key: IsocSortKey; dir: SortDir }[] = [
  { value: 'rate-desc', label: 'Plus déductible', key: 'rate', dir: 'desc' },
  { value: 'rate-asc', label: 'Moins déductible', key: 'rate', dir: 'asc' },
  { value: 'label-asc', label: 'Nom A–Z', key: 'label', dir: 'asc' },
  { value: 'rubric-asc', label: 'Par rubrique', key: 'rubric', dir: 'asc' },
  { value: 'uses-desc', label: 'Plus utilisés', key: 'uses', dir: 'desc' },
]

/**
 * The mobile list (`MobileRegimesIsoc` artboard): search, sort and rubric filter, the
 * count, one card per scheme down to "fin de la liste", and the button that adds one.
 */
export function IsocSchemesCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: IsocSchemeRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RubricFilter>('all')
  const [sortValue, setSortValue] = useState(SORTS[0].value)
  const sort = SORTS.find((s) => s.value === sortValue) ?? SORTS[0]
  const filtered = query.trim() !== '' || filter !== 'all'

  // The whole list on one page: the cards scroll to its end.
  const view = listView(filterByRubric(rows, filter), {
    query,
    matches: matchesScheme,
    sort,
    compare: ISOC_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">La part d’une dépense admise en déduction de l’impôt des sociétés</span>
        <Input
          icon={Search}
          aria-label="Chercher un régime"
          placeholder="Chercher un régime"
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
            aria-label="Rubrique de l’annexe"
            options={RUBRIC_FILTERS}
            value={filter}
            onValueChange={(value) => setFilter(value as RubricFilter)}
            className="w-full min-w-0"
          />
        </div>
        <div className="flex min-h-9 items-center justify-between gap-2 text-sm text-fg-muted">
          <span>
            {countLabel(view.total, 'régime', 'régimes')}
            {view.total === rows.length ? '' : ` sur ${formatNumber(rows.length)}`}
          </span>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={X}
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              Effacer les filtres
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{displayName(s)}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={RUBRICS[s.rubric].tone}>{RUBRICS[s.rubric].label}</Badge>
                <span className="numeric text-xs text-fg-muted">{usesLabel(s.uses)}</span>
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-0.5">
              <span className="numeric text-sm font-medium text-fg-strong">{formatRate(s.deductible_rate)}</span>
              <span className="text-2xs text-fg-muted">déductible</span>
            </span>
          </button>
        ))}
        {view.total === 0 ? (
          <EmptyState icon={Landmark} title={filtered ? 'Aucun régime ne correspond' : 'Aucun régime pour l’instant'} />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, 'régime', 'régimes')}` : ''}
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouveau régime"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
