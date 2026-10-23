import { useState } from 'react'
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Segment } from '@qvanderlinden/ui'
import type { DepreciationModelRead } from '../../api/types'
import { countLabel } from '../../format'
import { listView } from '../../lists/listView'
import {
  FIRST_YEAR_LABELS,
  METHOD_LABELS,
  MODEL_COMPARE,
  USE_FILTERS,
  assetsLabel,
  displayName,
  durationLabel,
  filterByUse,
  matchesModel,
  type UseFilter,
} from './depreciationModelsList'

const SEGMENTS = USE_FILTERS.map((f) => (f.value === 'all' ? { ...f, label: 'Tous' } : f))

/**
 * The mobile list (`MobileModelesAmortissement` artboard): search, the use segments, the
 * count, one card per model down to "fin de la liste", and the button that adds one.
 */
export function DepreciationModelsCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: DepreciationModelRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const [filter, setFilter] = useState<UseFilter>('all')
  const [query, setQuery] = useState('')
  const filtered = query.trim() !== '' || filter !== 'all'

  // The whole list on one page: the cards scroll to its end.
  const view = listView(filterByUse(rows, filter), {
    query,
    matches: matchesModel,
    sort: { key: 'label', dir: 'asc' },
    compare: MODEL_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">Comment une immobilisation s’amortit : durée et prorata</span>
        <Input
          icon={Search}
          aria-label="Chercher un modèle"
          placeholder="Chercher un modèle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Segment
          aria-label="Utilisation"
          options={SEGMENTS}
          value={filter}
          onChange={(value) => setFilter(value as UseFilter)}
        />
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-sm text-fg-muted">{countLabel(view.total, 'modèle', 'modèles')}</span>
          {filtered ? (
            <Button
              variant="ghost"
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
        {view.rows.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{displayName(m)}</span>
              <span className="truncate font-mono text-2xs text-fg-muted">
                {METHOD_LABELS[m.method]} · {FIRST_YEAR_LABELS[m.first_year]}
              </span>
              <span className="flex items-center gap-1.5">
                <Badge tone={m.uses ? 'info' : 'neutral'}>
                  {m.uses ? `utilisé · ${assetsLabel(m.uses)}` : 'inutilisé'}
                </Badge>
              </span>
            </span>
            <span className="numeric flex-none text-sm font-medium text-fg-strong">{durationLabel(m.years)}</span>
          </button>
        ))}
        {view.total === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title={filtered ? 'Aucun modèle ne correspond' : 'Aucun modèle pour l’instant'}
          />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, 'modèle', 'modèles')}` : ''}
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouveau modèle"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
