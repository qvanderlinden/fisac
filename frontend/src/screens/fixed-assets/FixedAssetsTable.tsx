import { useState } from 'react'
import { Link2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { DepreciationModelRead, FiscalYearRead, RegisterRow } from '../../api/types'
import { countLabel, eur, formatDate } from '../../format'
import { Pager } from '../../lists/Pager'
import { RowMenu } from '../../lists/RowMenu'
import { SortHeader } from '../../lists/SortHeader'
import { listView, type SortDir } from '../../lists/listView'
import { reference } from '../../pieces/pieceStatus'
import { AssetFilters, AssetTiles } from './AssetsHeader'
import {
  ASSET_COMPARE,
  FIRST_DIR,
  NO_FILTER,
  filterAssets,
  isFiltered,
  statusOf,
  totals,
  type AssetSortKey,
} from './fixedAssetsList'

export interface AssetsListProps {
  rows: RegisterRow[]
  models: DepreciationModelRead[]
  fiscalYear: FiscalYearRead
  onAdd(): void
  onOpen(id: number): void
}

/** "acquis le 7 janv. 2023 · Informatique · 3 ans". */
export function assetSubline(r: RegisterRow, models: DepreciationModelRead[]): string {
  const model = models.find((m) => m.id === r.depreciation_model_id)
  return [`acquis le ${formatDate(r.acquired_on, 'full')}`, model?.label].filter(Boolean).join(' · ')
}

/**
 * The desktop register (`Immobilisations` artboard): title and "Nouvelle immobilisation",
 * the four tiles, search and filters, sortable columns, the totals of the rows shown, the
 * row menu and pages of 25.
 */
export function FixedAssetsTable({
  rows,
  models,
  fiscalYear,
  onAdd,
  onOpen,
  onOpenPurchase,
  onDelete,
}: AssetsListProps & {
  onOpenPurchase(purchaseId: number): void
  onDelete(id: number): void
}) {
  const year = fiscalYear.end_date.slice(0, 4)
  const [filter, setFilter] = useState(NO_FILTER)
  const [sort, setSort] = useState<{ key: AssetSortKey; dir: SortDir }>({ key: 'number', dir: 'asc' })
  const [page, setPage] = useState(1)

  const shown = filterAssets(rows, filter)
  const view = listView(shown, { query: '', matches: () => true, sort, compare: ASSET_COMPARE, page })
  const sums = totals(shown)

  const head = (key: AssetSortKey, label: string, className?: string) => (
    <SortHeader
      label={label}
      active={sort.key === key}
      dir={sort.dir}
      className={className}
      onToggle={() => {
        setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : FIRST_DIR[key] }))
        setPage(1)
      }}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Immobilisations corporelles</h1>
          <span className="text-sm text-fg-muted">
            Le registre des biens durables ; leur amortissement de l’année entre dans le résultat
          </span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouvelle immobilisation
        </Button>
      </div>

      <AssetTiles rows={rows} year={year} />
      <AssetFilters
        models={models}
        filter={filter}
        onChange={(f) => {
          setFilter(f)
          setPage(1)
        }}
        mobile={false}
      />

      <Card padding={false}>
        <Table className="min-w-240">
          <TableHeader>
            <TableRow>
              {head('number', 'Réf', 'w-24')}
              {head('description', 'Description')}
              {head('value', 'Valeur d’acquisition', 'w-36 text-right')}
              {head('before', 'Amorti au début', 'w-32 text-right')}
              {head('depreciation', `Amortissement ${year}`, 'w-36 text-right')}
              {head('remaining', 'Valeur à la fin', 'w-32 text-right')}
              {head('status', 'Statut', 'w-28')}
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((r) => {
              const ref = reference('I', r.number)
              const status = statusOf(r.status)
              return (
                <TableRow key={r.id} className="hover:bg-surface-hover">
                  <TableCell className="numeric text-sm text-fg-muted">{ref}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpen(r.id)}
                          className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                        >
                          {r.description || 'Immobilisation sans description'}
                        </button>
                        {r.schedule_balanced ? null : <Badge tone="warning">tableau à revoir</Badge>}
                      </span>
                      <span className="text-2xs text-fg-muted">{assetSubline(r, models)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{eur(r.value)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{eur(r.depreciated_before)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{eur(r.depreciation)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap text-fg-strong">{eur(r.remaining)}</TableCell>
                  <TableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${ref}`} onClick={() => onOpen(r.id)} />
                      <IconButton icon={Trash2} size="sm" label={`Supprimer ${ref}`} onClick={() => onDelete(r.id)} />
                      <RowMenu
                        items={[
                          {
                            label: `Voir l’achat lié · ${reference('A', r.purchase_number)}`,
                            icon: Link2,
                            run: () => onOpenPurchase(r.purchase_id),
                          },
                          'separator',
                          { label: 'Supprimer l’immobilisation', icon: Trash2, danger: true, run: () => onDelete(r.id) },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {view.total > 0 ? (
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableCell colSpan={2}>
                  <span className="text-sm font-semibold text-fg-strong">Total</span>
                  <span className="ml-3 text-xs text-fg-muted">
                    {countLabel(view.total, 'immobilisation', 'immobilisations')}
                    {view.total < rows.length ? ` sur ${rows.length}` : ''}
                  </span>
                </TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.value)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.before)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.depreciation)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.remaining)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {view.total === 0 ? (
          <EmptyState
            icon={Package}
            title={isFiltered(filter) ? 'Aucune immobilisation ne correspond à ces filtres' : 'Aucune immobilisation au registre'}
          />
        ) : null}
        <Pager
          label={view.label}
          page={view.page}
          pages={view.pages}
          onPrev={() => setPage(view.page - 1)}
          onNext={() => setPage(view.page + 1)}
        />
      </Card>
      <p className="m-0 text-xs text-fg-muted">
        L’amortissement {year} entre dans le résultat ; la valeur à la fin de l’exercice est à l’inventaire.
      </p>
    </div>
  )
}
