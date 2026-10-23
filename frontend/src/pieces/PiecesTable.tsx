import { useState } from 'react'
import { Check, Copy, Download, FileMinus, Pencil, Plus, Receipt, Trash2, Undo2 } from 'lucide-react'
import { Badge, Button, Card, Checkbox, EmptyState, IconButton } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { FiscalYearRead, PieceRead } from '../api/types'
import { countLabel, eur, formatDate } from '../format'
import { BulkBar, type BulkAction } from '../lists/BulkBar'
import { Pager } from '../lists/Pager'
import { RowMenu } from '../lists/RowMenu'
import { SortHeader } from '../lists/SortHeader'
import { listView, type SortDir } from '../lists/listView'
import { useSelection } from '../lists/useSelection'
import { countOf, dueNote, pieceLabel, rowAmount } from './listLabels'
import { PiecesFilters } from './PiecesFilters'
import {
  FIRST_DIR,
  NO_FILTER,
  PIECE_COMPARE,
  filterPieces,
  isFiltered,
  totals,
  type PieceSortKey,
} from './piecesList'
import { reference, statusLabel } from './pieceStatus'
import { SIDE_COPY } from './sideCopy'
import type { PieceSide } from './usePieceRefs'

export interface PiecesListProps<T extends PieceRead> {
  side: PieceSide
  rows: T[]
  fiscalYear: FiscalYearRead
  /** The company files a monthly VAT return: the period filter lists months. */
  monthly: boolean
  onAdd(): void
  onOpen(id: number): void
}

/**
 * The desktop list of sales or purchases (`Ventes` / `Achats` artboards): title and
 * "Nouvelle vente" / "Nouvel achat", search and filters, sortable columns, the totals of
 * the rows shown, selection with the bulk bar, the row menu and pages of 25.
 */
export function PiecesTable<T extends PieceRead>({
  side,
  rows,
  fiscalYear,
  monthly,
  onAdd,
  onOpen,
  onDuplicate,
  onCreditNote,
  onSetPaid,
  onDelete,
}: PiecesListProps<T> & {
  onDuplicate(piece: T): void
  onCreditNote(piece: T): void
  onSetPaid(ids: number[], paid: boolean): void
  /** Asks to delete these pieces; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const copy = SIDE_COPY[side]
  const [filter, setFilterState] = useState(NO_FILTER)
  const [sort, setSort] = useState<{ key: PieceSortKey; dir: SortDir }>({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)
  const selection = useSelection<number>()

  const shown = filterPieces(rows, filter, monthly)
  const view = listView(shown, { query: '', matches: () => true, sort, compare: PIECE_COMPARE, page })
  const sums = totals(shown)
  const pageIds = view.rows.map((s) => s.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.selected.has(id))
  const someSelected = pageIds.some((id) => selection.selected.has(id))
  const picked = rows.filter((s) => selection.selected.has(s.id))
  const filtered = isFiltered(filter)

  const change = (next: typeof filter) => {
    setFilterState(next)
    setPage(1)
  }
  const head = (key: PieceSortKey, label: string, className?: string) => (
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
    { label: copy.markPaidMany, icon: Check, run: () => onSetPaid(picked.map((s) => s.id), true) },
    { label: 'Exporter', icon: Download, disabled: true, title: 'bientôt', run: () => {} },
    { label: 'Supprimer', icon: Trash2, variant: 'danger', run: () => onDelete(picked.map((s) => s.id)) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">{copy.title}</h1>
          <span className="text-sm text-fg-muted">{copy.subtitle}</span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          {copy.newNoun}
        </Button>
      </div>

      <PiecesFilters
        rows={rows}
        copy={copy}
        fiscalYear={fiscalYear}
        monthly={monthly}
        filter={filter}
        onChange={change}
        mobile={false}
      />

      <Card padding={false}>
        {picked.length > 0 ? (
          <BulkBar
            label={countLabel(picked.length, copy.selectedOne, copy.selectedMany)}
            note={`${eur(totals(picked).total)} TVAC`}
            actions={bulk}
            onClear={selection.clear}
          />
        ) : null}
        <Table className="min-w-240">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={`Sélectionner les ${copy.many} de la page`}
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(pageIds)}
                />
              </TableHead>
              {head('number', 'N°', 'w-24')}
              {head('date', 'Date', 'w-28')}
              {head('tiers', copy.tiers, 'w-40')}
              {head('description', 'Description')}
              {head('status', 'Statut', 'w-28')}
              {head('net', 'HTVA', 'w-28 text-right')}
              {head('vat', 'TVA', 'w-26 text-right')}
              {head('total', 'TVAC', 'w-28 text-right')}
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((s) => {
              const ref = reference(copy.prefix, s.number)
              const status = statusLabel(s.status, side)
              const selected = selection.selected.has(s.id)
              return (
                <TableRow key={s.id} data-state={selected ? 'selected' : undefined} className="hover:bg-surface-hover">
                  <TableCell>
                    <Checkbox aria-label={`Sélectionner ${ref}`} checked={selected} onCheckedChange={() => selection.toggle(s.id)} />
                  </TableCell>
                  <TableCell className="numeric text-sm text-fg-muted">{ref}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="numeric text-sm text-fg-strong">{formatDate(s.document_date)}</span>
                      {s.booking_date !== s.document_date ? (
                        <span className="numeric text-2xs text-fg-muted">compta. {formatDate(s.booking_date)}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{s.third_party_name ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(s.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                      >
                        {pieceLabel(s, copy)}
                      </button>
                      {s.kind === 'credit_note' ? <Badge tone="info">note de crédit</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{rowAmount(s, s.net)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{rowAmount(s, s.vat)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap text-fg-strong">{rowAmount(s, s.total)}</TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${ref}`} onClick={() => onOpen(s.id)} />
                      <IconButton icon={Trash2} size="sm" label={`Supprimer ${ref}`} onClick={() => onDelete([s.id])} />
                      <RowMenu
                        items={[
                          s.paid
                            ? { label: copy.markUnpaid, icon: Undo2, run: () => onSetPaid([s.id], false) }
                            : { label: copy.markPaid, icon: Check, run: () => onSetPaid([s.id], true) },
                          { label: 'Dupliquer', icon: Copy, run: () => onDuplicate(s) },
                          {
                            label: 'Créer la note de crédit',
                            icon: FileMinus,
                            disabled: s.kind === 'credit_note',
                            run: () => onCreditNote(s),
                          },
                          'separator',
                          { label: copy.remove, icon: Trash2, danger: true, run: () => onDelete([s.id]) },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {view.total > 0 ? (
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableCell />
                <TableCell colSpan={5}>
                  <span className="text-sm font-semibold text-fg-strong">Total</span>
                  <span className="ml-3 text-xs text-fg-muted">
                    {countOf(view.total, rows.length, copy)} · {dueNote(shown, copy)}
                  </span>
                </TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.net)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.vat)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(sums.total)}</TableCell>
                <TableCell />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {view.total === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filtered ? copy.emptyFiltered : copy.empty}
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
    </div>
  )
}
