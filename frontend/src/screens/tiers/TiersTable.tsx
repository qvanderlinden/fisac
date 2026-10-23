import { useState } from 'react'
import { ClipboardCopy, Copy, Download, FileText, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, Input, Select } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { ThirdPartyRead } from '../../api/types'
import { countLabel } from '../../format'
import { groupIban } from '../../iban'
import { BulkBar, type BulkAction } from '../../lists/BulkBar'
import { Pager } from '../../lists/Pager'
import { RowMenu, deleteItem, inUseLabel } from '../../lists/RowMenu'
import { SortHeader } from '../../lists/SortHeader'
import { listView, type SortDir } from '../../lists/listView'
import { useSelection } from '../../lists/useSelection'
import {
  FIRST_DIR,
  IBAN_FILTERS,
  TIERS_COMPARE,
  displayName,
  filterByIban,
  ibanBadge,
  matchesTiers,
  usesLabel,
  type IbanFilter,
  type TiersSortKey,
} from './tiersList'

/**
 * The desktop list (`Tiers` artboard): title and "Nouveau tiers", search and IBAN filter,
 * sortable columns, selection with the bulk bar, row actions and pages of 25.
 */
export function TiersTable({
  rows,
  onAdd,
  onOpen,
  onDuplicate,
  onCopyIban,
  onDelete,
}: {
  rows: ThirdPartyRead[]
  onAdd(): void
  onOpen(id: number): void
  onDuplicate(row: ThirdPartyRead): void
  onCopyIban(row: ThirdPartyRead): void
  /** Asks to delete these unused tiers; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IbanFilter>('all')
  const [sort, setSort] = useState<{ key: TiersSortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const selection = useSelection<number>()

  const view = listView(filterByIban(rows, filter), { query, matches: matchesTiers, sort, compare: TIERS_COMPARE, page })
  const pageIds = view.rows.map((t) => t.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.selected.has(id))
  const someSelected = pageIds.some((id) => selection.selected.has(id))
  // Ticked ids of deleted rows are left in the set: they match no row, so nothing counts them.
  const picked = rows.filter((t) => selection.selected.has(t.id))
  const free = picked.filter((t) => t.uses === 0)
  const kept = picked.length - free.length
  const filtered = query.trim() !== '' || filter !== 'all'

  const head = (key: TiersSortKey, label: string, className?: string) => (
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
      ? [{ label: 'Supprimer', icon: Trash2, variant: 'danger' as const, run: () => onDelete(free.map((t) => t.id)) }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Tiers</h1>
          <span className="text-sm text-fg-muted">
            Les clients, les fournisseurs et toute personne que la société paie ou qui la paie
          </span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouveau tiers
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          icon={Search}
          aria-label="Chercher un nom ou un IBAN"
          placeholder="Chercher un nom ou un IBAN"
          className="w-70"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
        <Select
          size="sm"
          aria-label="IBAN"
          className="w-47.5"
          options={IBAN_FILTERS}
          value={filter}
          onValueChange={(value) => {
            setFilter(value as IbanFilter)
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
            label={countLabel(picked.length, 'tiers sélectionné', 'tiers sélectionnés')}
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
                  aria-label="Sélectionner les tiers de la page"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(pageIds)}
                />
              </TableHead>
              {head('name', 'Nom')}
              {head('iban', 'IBAN', 'w-90')}
              {head('uses', 'Utilisé', 'w-30 text-right')}
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((t) => {
              const name = displayName(t)
              const badge = ibanBadge(t)
              const selected = selection.selected.has(t.id)
              return (
                <TableRow key={t.id} data-state={selected ? 'selected' : undefined} className="hover:bg-surface-hover">
                  <TableCell>
                    <Checkbox
                      aria-label={`Sélectionner ${name}`}
                      checked={selected}
                      onCheckedChange={() => selection.toggle(t.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpen(t.id)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                    >
                      {name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.iban ? (
                        <span className="font-mono text-sm tracking-wide text-fg-strong">{groupIban(t.iban)}</span>
                      ) : null}
                      {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="numeric text-right text-fg-muted">{usesLabel(t.uses)}</TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${name}`} onClick={() => onOpen(t.id)} />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={t.uses > 0 ? inUseLabel(t.uses) : `Supprimer ${name}`}
                        disabled={t.uses > 0}
                        onClick={() => onDelete([t.id])}
                      />
                      <RowMenu
                        items={[
                          {
                            label: 'Copier l’IBAN',
                            icon: ClipboardCopy,
                            disabled: !t.iban,
                            run: () => onCopyIban(t),
                          },
                          { label: 'Voir les pièces', icon: FileText, disabled: true, run: () => {} },
                          { label: 'Dupliquer', icon: Copy, run: () => onDuplicate(t) },
                          'separator',
                          deleteItem('Supprimer le tiers', t.uses, () => onDelete([t.id])),
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
          <EmptyState icon={Users} title={filtered ? 'Aucun tiers ne correspond' : 'Aucun tiers pour l’instant'} />
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
