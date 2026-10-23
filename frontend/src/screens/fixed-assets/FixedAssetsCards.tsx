import { useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { Badge, Button, EmptyState } from '@qvanderlinden/ui'
import { countLabel, eur, formatDate } from '../../format'
import { listView } from '../../lists/listView'
import { reference } from '../../pieces/pieceStatus'
import { AssetFilters, AssetTiles } from './AssetsHeader'
import { assetSubline, type AssetsListProps } from './FixedAssetsTable'
import { ASSET_COMPARE, NO_FILTER, filterAssets, isFiltered, statusOf, totals } from './fixedAssetsList'

/**
 * The mobile register (`MobileImmobilisations` artboard): the tiles, search and two
 * filters, the summary of the rows shown, one card per asset down to "fin de la liste",
 * and the button that adds one.
 */
export function FixedAssetsCards({ rows, models, fiscalYear, onAdd, onOpen }: AssetsListProps) {
  const year = fiscalYear.end_date.slice(0, 4)
  const [filter, setFilter] = useState(NO_FILTER)
  const shown = filterAssets(rows, filter)
  const view = listView(shown, {
    query: '',
    matches: () => true,
    sort: { key: 'number', dir: 'asc' },
    compare: ASSET_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })
  const sums = totals(shown)

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <AssetTiles rows={rows} year={year} />
        <AssetFilters models={models} filter={filter} onChange={setFilter} mobile />
        <div className="flex flex-col gap-1 rounded-lg border border-line-hairline bg-surface-card px-4 py-3">
          <div className="flex justify-between gap-2 text-xs text-fg-muted">
            <span>
              {countLabel(view.total, 'immobilisation', 'immobilisations')}
              {view.total < rows.length ? ` sur ${rows.length}` : ''}
            </span>
            <span>amortissement {year}</span>
          </div>
          <span className="numeric text-2xl text-fg-strong">{eur(sums.depreciation)}</span>
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((r) => {
          const status = statusOf(r.status)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="truncate text-sm font-medium text-fg-strong">
                  {r.description || 'Immobilisation sans description'}
                </span>
                <span className="truncate text-2xs text-fg-muted">
                  {reference('I', r.number)} · {assetSubline(r, models)}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {r.schedule_balanced ? null : <Badge tone="warning">tableau à revoir</Badge>}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5 whitespace-nowrap">
                <span className="numeric text-sm text-fg-strong">{eur(r.value)}</span>
                <span className="numeric text-2xs text-fg-muted">{year} {eur(r.depreciation)}</span>
                <span className="numeric text-2xs text-fg-muted">fin {eur(r.remaining)}</span>
              </span>
            </button>
          )
        })}
        {view.total === 0 ? (
          <EmptyState
            icon={Package}
            title={isFiltered(filter) ? 'Aucune immobilisation ne correspond à ces filtres' : 'Aucune immobilisation au registre'}
          />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, 'immobilisation', 'immobilisations')}` : ''}
        <p className="m-0 mt-2 text-fg-muted">
          L’amortissement {year} entre dans le résultat ; la valeur à la fin est à l’inventaire.
        </p>
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouvelle immobilisation"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
