import { useState } from 'react'
import { Archive, ArchiveRestore, Copy, FileText, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, Input, Tabs } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { CategoryRead } from '../../api/types'
import { countLabel } from '../../format'
import { BulkBar, type BulkAction } from '../../lists/BulkBar'
import { Pager } from '../../lists/Pager'
import { RowMenu, type RowMenuAction } from '../../lists/RowMenu'
import { SortHeader } from '../../lists/SortHeader'
import { listView, type SortDir } from '../../lists/listView'
import { useSelection } from '../../lists/useSelection'
import { usesLabel } from '../tiers/tiersList'
import {
  FIRST_DIR,
  KIND_TABS,
  LEGEND_KINDS,
  categoryCompare,
  deletable,
  displayName,
  isocCell,
  matchesCategory,
  selectionNote,
  tabCount,
  vatCell,
  visible,
  type CategorySortKey,
  type KindTab,
  type SchemeLabels,
} from './categoriesList'
import { KINDS, ROLE_SCREENS, kindTone } from './kinds'

/** What a row's delete button and menu item say when the category cannot be deleted. */
function keptLabel(c: CategoryRead): string {
  return c.role ? `Utilisée par l’écran ${ROLE_SCREENS[c.role]}` : 'Utilisée : elle ne peut qu’être archivée'
}

/**
 * The desktop list (`Categories` artboard): title and "Nouvelle catégorie", kind tabs with
 * counts, search and "Montrer les archivées", sortable columns, selection with the bulk bar,
 * row actions, pages of 25 and the legend of the kinds.
 */
export function CategoriesTable({
  rows,
  labels,
  onAdd,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  rows: CategoryRead[]
  labels: SchemeLabels
  onAdd(): void
  onOpen(id: number): void
  onDuplicate(row: CategoryRead): void
  /** Archives or restores these categories; the screen skips the ones a screen books into. */
  onArchive(ids: number[], archived: boolean): void
  /** Asks to delete these unused categories; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const [tab, setTab] = useState<KindTab>('all')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<{ key: CategorySortKey; dir: SortDir }>({ key: 'label', dir: 'asc' })
  const [page, setPage] = useState(1)
  const selection = useSelection<number>()

  const view = listView(visible(rows, tab, showArchived), {
    query,
    matches: matchesCategory,
    sort,
    compare: categoryCompare(labels),
    page,
  })
  const pageIds = view.rows.map((c) => c.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.selected.has(id))
  const someSelected = pageIds.some((id) => selection.selected.has(id))
  // Ticked ids of deleted rows are left in the set: they match no row, so nothing counts them.
  const picked = rows.filter((c) => selection.selected.has(c.id))
  const free = picked.filter(deletable)
  const toArchive = picked.filter((c) => c.role === null && !c.archived)
  const toRestore = picked.filter((c) => c.role === null && c.archived)

  const head = (key: CategorySortKey, label: string, className?: string) => (
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
    ...(toArchive.length || !toRestore.length
      ? [
          {
            label: 'Archiver',
            icon: Archive,
            disabled: toArchive.length === 0,
            run: () => onArchive(toArchive.map((c) => c.id), true),
          },
        ]
      : []),
    ...(toRestore.length
      ? [{ label: 'Désarchiver', icon: ArchiveRestore, run: () => onArchive(toRestore.map((c) => c.id), false) }]
      : []),
    ...(free.length
      ? [{ label: 'Supprimer', icon: Trash2, variant: 'danger' as const, run: () => onDelete(free.map((c) => c.id)) }]
      : []),
  ]

  const menu = (c: CategoryRead): (RowMenuAction | 'separator')[] => [
    {
      label: c.archived ? 'Désarchiver' : 'Archiver',
      icon: c.archived ? ArchiveRestore : Archive,
      disabled: c.role !== null,
      run: () => onArchive([c.id], !c.archived),
    },
    { label: 'Dupliquer', icon: Copy, run: () => onDuplicate(c) },
    { label: 'Voir les pièces', icon: FileText, disabled: true, run: () => {} },
    'separator',
    deletable(c)
      ? { label: 'Supprimer la catégorie', icon: Trash2, danger: true, run: () => onDelete([c.id]) }
      : { label: keptLabel(c), icon: Trash2, disabled: true, run: () => {} },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Catégories</h1>
          <span className="text-sm text-fg-muted">
            Elles remplacent le plan comptable : chaque pièce et chaque mouvement en porte une, qui dit où il va dans le
            résultat
          </span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouvelle catégorie
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={KIND_TABS.map((t) => ({ value: t.value, label: t.label, count: tabCount(rows, t.value) }))}
          value={tab}
          onChange={(value) => {
            setTab(value as KindTab)
            setPage(1)
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            size="sm"
            icon={Search}
            aria-label="Chercher une catégorie"
            placeholder="Chercher une catégorie"
            className="w-55"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
          <Checkbox
            label="Montrer les archivées"
            checked={showArchived}
            onCheckedChange={(checked) => {
              setShowArchived(checked === true)
              setPage(1)
            }}
          />
        </div>
      </div>

      <Card padding={false}>
        {picked.length > 0 ? (
          <BulkBar
            label={countLabel(picked.length, 'catégorie sélectionnée', 'catégories sélectionnées')}
            note={selectionNote(picked)}
            actions={bulk}
            onClear={selection.clear}
          />
        ) : null}
        <Table className="min-w-230">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Sélectionner les catégories de la page"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(pageIds)}
                />
              </TableHead>
              {head('label', 'Catégorie')}
              {head('kind', 'Type', 'w-38')}
              {head('vat', 'TVA par défaut', 'w-48')}
              {head('isoc', 'ISOC par défaut', 'w-43')}
              {head('uses', 'Utilisée', 'w-28 text-right')}
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((c) => {
              const name = displayName(c)
              const selected = selection.selected.has(c.id)
              const vat = vatCell(c, labels)
              const isoc = isocCell(c, labels)
              return (
                <TableRow
                  key={c.id}
                  data-state={selected ? 'selected' : undefined}
                  className={c.archived ? 'opacity-60 hover:bg-surface-hover' : 'hover:bg-surface-hover'}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Sélectionner ${name}`}
                      checked={selected}
                      onCheckedChange={() => selection.toggle(c.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(c.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                      >
                        {name}
                      </button>
                      {c.role ? <Badge tone="neutral">{ROLE_SCREENS[c.role]}</Badge> : null}
                      {c.archived ? <Badge tone="neutral">archivée</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={kindTone(c.kind)}>{KINDS[c.kind].label}</Badge>
                  </TableCell>
                  <TableCell className={vat === '—' || vat === 'hors TVA' ? 'text-sm text-fg-muted' : 'text-sm'}>
                    {vat}
                  </TableCell>
                  <TableCell className={isoc === '—' ? 'text-sm text-fg-muted' : 'text-sm'}>{isoc}</TableCell>
                  <TableCell className="numeric text-right text-fg-muted">{usesLabel(c.uses)}</TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${name}`} onClick={() => onOpen(c.id)} />
                      {deletable(c) ? (
                        <IconButton
                          icon={Trash2}
                          size="sm"
                          label={`Supprimer ${name}`}
                          onClick={() => onDelete([c.id])}
                        />
                      ) : (
                        <IconButton
                          icon={c.archived ? ArchiveRestore : Archive}
                          size="sm"
                          label={c.role ? keptLabel(c) : c.archived ? `Désarchiver ${name}` : `Utilisée : archiver ${name}`}
                          disabled={c.role !== null}
                          onClick={() => onArchive([c.id], !c.archived)}
                        />
                      )}
                      <RowMenu items={menu(c)} />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {view.total === 0 ? <EmptyState icon={Tags} title="Aucune catégorie ne correspond" /> : null}
        <Pager
          label={view.label}
          page={view.page}
          pages={view.pages}
          onPrev={() => setPage(view.page - 1)}
          onNext={() => setPage(view.page + 1)}
        />
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {LEGEND_KINDS.map((k) => (
          <div key={k} className="flex flex-col gap-1.5 rounded-lg border border-line-hairline bg-surface-card px-5 py-4">
            <div>
              <Badge tone={kindTone(k)}>{KINDS[k].label}</Badge>
            </div>
            <span className="text-sm text-fg-muted">{KINDS[k].hint}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
