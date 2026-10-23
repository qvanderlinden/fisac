import { useState } from 'react'
import { Copy, Download, FileText, SlidersHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Card, Checkbox, EmptyState, IconButton, Input, Select } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { DepreciationModelRead } from '../../api/types'
import { countLabel } from '../../format'
import { BulkBar, type BulkAction } from '../../lists/BulkBar'
import { Pager } from '../../lists/Pager'
import { deleteItem, inUseLabel } from '../../lists/inUse'
import { RowMenu } from '../../lists/RowMenu'
import { SortHeader } from '../../lists/SortHeader'
import { listView, type SortDir } from '../../lists/listView'
import { useSelection } from '../../lists/useSelection'
import {
  FIRST_DIR,
  FIRST_YEAR_LABELS,
  METHOD_LABELS,
  MODEL_COMPARE,
  USE_FILTERS,
  assetsLabel,
  displayName,
  durationLabel,
  filterByUse,
  matchesModel,
  type ModelSortKey,
  type UseFilter,
} from './depreciationModelsList'

/**
 * The desktop list (`ModelesAmortissement` artboard): title and "Nouveau modèle", search and use
 * filter, sortable columns (by name first), selection with the bulk
 * bar, row actions and pages of 25.
 */
export function DepreciationModelsTable({
  rows,
  onAdd,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  rows: DepreciationModelRead[]
  onAdd(): void
  onOpen(id: number): void
  onDuplicate(row: DepreciationModelRead): void
  /** Asks to delete these unused models; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<UseFilter>('all')
  const [sort, setSort] = useState<{ key: ModelSortKey; dir: SortDir }>({ key: 'label', dir: 'asc' })
  const [page, setPage] = useState(1)
  const selection = useSelection<number>()

  const view = listView(filterByUse(rows, filter), {
    query,
    matches: matchesModel,
    sort,
    compare: MODEL_COMPARE,
    page,
  })
  const pageIds = view.rows.map((s) => s.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.selected.has(id))
  const someSelected = pageIds.some((id) => selection.selected.has(id))
  // Ticked ids of deleted rows are left in the set: they match no row, so nothing counts them.
  const picked = rows.filter((s) => selection.selected.has(s.id))
  const free = picked.filter((s) => s.uses === 0)
  const kept = picked.length - free.length
  const filtered = query.trim() !== '' || filter !== 'all'

  const head = (key: ModelSortKey, label: string, className?: string) => (
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

  const bulk: BulkAction[] = [
    { label: 'Exporter', icon: Download, disabled: true, title: 'bientôt', run: () => {} },
    ...(free.length
      ? [{ label: 'Supprimer', icon: Trash2, variant: 'danger' as const, run: () => onDelete(free.map((s) => s.id)) }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Modèles d’amortissement</h1>
          <span className="text-sm text-fg-muted">
            Comment une immobilisation s’amortit : durée et prorata
          </span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouveau modèle
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          icon={Search}
          aria-label="Chercher un modèle"
          placeholder="Chercher un modèle"
          className="w-55"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
        <Select
          size="sm"
          aria-label="Utilisation"
          className="w-50"
          options={USE_FILTERS}
          value={filter}
          onValueChange={(value) => {
            setFilter(value as UseFilter)
            setPage(1)
          }}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={X}
            onClick={() => {
              setQuery('')
              setFilter('all')
              setPage(1)
            }}
          >
            Effacer les filtres
          </Button>
        ) : null}
      </div>

      <Card padding={false}>
        {picked.length > 0 ? (
          <BulkBar
            label={countLabel(picked.length, 'modèle sélectionné', 'modèles sélectionnés')}
            note={
              kept === 0
                ? undefined
                : kept === 1
                  ? '1 utilisé par des immobilisations : il reste'
                  : `${kept} utilisés par des immobilisations : ils restent`
            }
            actions={bulk}
            onClear={selection.clear}
          />
        ) : null}
        <Table className="min-w-215">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Sélectionner les modèles de la page"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(pageIds)}
                />
              </TableHead>
              {head('label', 'Modèle')}
              {head('years', 'Durée', 'w-25')}
              {head('method', 'Méthode', 'w-30')}
              {head('first', 'Première année', 'w-45')}
              {head('uses', 'Utilisé', 'w-40 text-right')}
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((s) => {
              const name = displayName(s)
              const selected = selection.selected.has(s.id)
              return (
                <TableRow key={s.id} data-state={selected ? 'selected' : undefined} className="hover:bg-surface-hover">
                  <TableCell>
                    <Checkbox
                      aria-label={`Sélectionner ${name}`}
                      checked={selected}
                      onCheckedChange={() => selection.toggle(s.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                    >
                      {name}
                    </button>
                  </TableCell>
                  <TableCell className="numeric text-fg-strong">{durationLabel(s.years)}</TableCell>
                  <TableCell>{METHOD_LABELS[s.method]}</TableCell>
                  <TableCell>{FIRST_YEAR_LABELS[s.first_year]}</TableCell>
                  <TableCell className="numeric text-right text-fg-muted">{assetsLabel(s.uses)}</TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${name}`} onClick={() => onOpen(s.id)} />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={s.uses > 0 ? inUseLabel(s.uses) : `Supprimer ${name}`}
                        disabled={s.uses > 0}
                        onClick={() => onDelete([s.id])}
                      />
                      <RowMenu
                        items={[
                          { label: 'Voir les immobilisations', icon: FileText, disabled: true, run: () => {} },
                          { label: 'Dupliquer', icon: Copy, run: () => onDuplicate(s) },
                          'separator',
                          deleteItem('Supprimer le modèle', s.uses, () => onDelete([s.id])),
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {view.total === 0 ? (
          <EmptyState icon={SlidersHorizontal} title={filtered ? 'Aucun modèle ne correspond' : 'Aucun modèle pour l’instant'} />
        ) : null}
        <Pager
          label={view.label}
          page={view.page}
          pages={view.pages}
          onPrev={() => setPage(view.page - 1)}
          onNext={() => setPage(view.page + 1)}
        />
      </Card>
    </div>
  )
}
