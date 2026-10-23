import { useState } from 'react'
import { Copy, Download, FileText, Percent, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, Input, Tabs } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { VatSchemeRead } from '../../api/types'
import { countLabel, formatRate } from '../../format'
import { BulkBar, type BulkAction } from '../../lists/BulkBar'
import { Pager } from '../../lists/Pager'
import { deleteItem, inUseLabel, usesLabel } from '../../lists/inUse'
import { RowMenu } from '../../lists/RowMenu'
import { SortHeader } from '../../lists/SortHeader'
import { listView, type SortDir } from '../../lists/listView'
import { useSelection } from '../../lists/useSelection'
import {
  FIRST_DIR,
  SENS_TABS,
  VAT_COMPARE,
  displayName,
  matchesScheme,
  recoverableCell,
  sensRows,
  sensText,
  sensTone,
  type SensTab,
  type VatSortKey,
} from './vatSchemesList'

/**
 * The desktop list (`RegimesTva` artboard): title and "Nouveau régime", sens tabs with
 * counts, search, sortable columns, selection with the bulk bar, row actions and pages of 25.
 */
export function VatSchemesTable({
  rows,
  onAdd,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  rows: VatSchemeRead[]
  onAdd(): void
  onOpen(id: number): void
  onDuplicate(row: VatSchemeRead): void
  /** Asks to delete these unused schemes; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const [tab, setTab] = useState<SensTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: VatSortKey; dir: SortDir }>({ key: 'label', dir: 'asc' })
  const [page, setPage] = useState(1)
  const selection = useSelection<number>()

  const view = listView(sensRows(rows, tab), { query, matches: matchesScheme, sort, compare: VAT_COMPARE, page })
  const pageIds = view.rows.map((s) => s.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.selected.has(id))
  const someSelected = pageIds.some((id) => selection.selected.has(id))
  // Ticked ids of deleted rows are left in the set: they match no row, so nothing counts them.
  const picked = rows.filter((s) => selection.selected.has(s.id))
  const free = picked.filter((s) => s.uses === 0)
  const kept = picked.length - free.length
  const filtered = query.trim() !== '' || tab !== 'all'

  const head = (key: VatSortKey, label: string, className?: string) => (
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
          <h1 className="type-title text-4xl text-fg-strong">Régimes de TVA</h1>
          <span className="text-sm text-fg-muted">Le taux d’une ligne et la part de TVA récupérée</span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouveau régime
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={SENS_TABS.map((t) => ({ value: t.value, label: t.label, count: sensRows(rows, t.value).length }))}
          value={tab}
          onChange={(value) => {
            setTab(value as SensTab)
            setPage(1)
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            size="sm"
            icon={Search}
            aria-label="Chercher un régime"
            placeholder="Chercher un régime"
            className="w-55"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
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
                setTab('all')
                setPage(1)
              }}
            >
              Effacer les filtres
            </Button>
          ) : null}
        </div>
      </div>

      <Card padding={false}>
        {picked.length > 0 ? (
          <BulkBar
            label={countLabel(picked.length, 'régime sélectionné', 'régimes sélectionnés')}
            note={
              kept === 0
                ? undefined
                : kept === 1
                  ? '1 porté par des pièces : il reste'
                  : `${kept} portés par des pièces : ils restent`
            }
            actions={bulk}
            onClear={selection.clear}
          />
        ) : null}
        <Table className="min-w-190">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Sélectionner les régimes de la page"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(pageIds)}
                />
              </TableHead>
              {head('label', 'Régime')}
              {head('sens', 'Sens', 'w-40')}
              {head('rate', 'Taux', 'w-24 text-right')}
              <TableHead className="w-32 text-right">Récupérable</TableHead>
              {head('uses', 'Utilisé', 'w-30 text-right')}
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
                  <TableCell>
                    <Badge tone={sensTone(s)}>{sensText(s)}</Badge>
                  </TableCell>
                  <TableCell className="numeric text-right">{formatRate(s.rate)}</TableCell>
                  <TableCell className="numeric text-right">{recoverableCell(s)}</TableCell>
                  <TableCell className="numeric text-right text-fg-muted">{usesLabel(s.uses)}</TableCell>
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
                          { label: 'Voir les pièces', icon: FileText, disabled: true, run: () => {} },
                          { label: 'Dupliquer', icon: Copy, run: () => onDuplicate(s) },
                          'separator',
                          deleteItem('Supprimer le régime', s.uses, () => onDelete([s.id])),
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
          <EmptyState icon={Percent} title={filtered ? 'Aucun régime ne correspond' : 'Aucun régime pour l’instant'} />
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
