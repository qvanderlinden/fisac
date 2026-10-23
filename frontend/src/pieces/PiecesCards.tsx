import { useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { Badge, Button, EmptyState } from '@qvanderlinden/ui'
import type { PieceRead } from '../api/types'
import { countLabel, eur, formatDate } from '../format'
import { listView } from '../lists/listView'
import { countOf, dueNote, pieceLabel, rowAmount } from './listLabels'
import { PiecesFilters } from './PiecesFilters'
import type { PiecesListProps } from './PiecesTable'
import { NO_FILTER, PIECE_COMPARE, filterPieces, isFiltered, totals } from './piecesList'
import { reference, statusLabel } from './pieceStatus'
import { SIDE_COPY } from './sideCopy'

/**
 * The mobile list of sales or purchases (`MobileVentes` / `MobileAchats` artboards):
 * search and filters, the summary of the rows shown, one card per piece (newest first)
 * down to "fin de la liste", and the button that adds one.
 */
export function PiecesCards<T extends PieceRead>({ side, rows, fiscalYear, monthly, onAdd, onOpen }: PiecesListProps<T>) {
  const copy = SIDE_COPY[side]
  const [filter, setFilterState] = useState(NO_FILTER)
  const shown = filterPieces(rows, filter, monthly)
  const view = listView(shown, {
    query: '',
    matches: () => true,
    sort: { key: 'date', dir: 'desc' },
    compare: PIECE_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })
  const sums = totals(shown)
  const filtered = isFiltered(filter)

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <PiecesFilters
          rows={rows}
          copy={copy}
          fiscalYear={fiscalYear}
          monthly={monthly}
          filter={filter}
          onChange={setFilterState}
          mobile
        />
        <div className="flex flex-col gap-1 rounded-lg border border-line-hairline bg-surface-card px-4 py-3">
          <div className="flex justify-between gap-2 text-xs text-fg-muted">
            <span>{countOf(view.total, rows.length, copy)} · TVAC</span>
            <span>{dueNote(shown, copy)}</span>
          </div>
          <span className="numeric text-2xl text-fg-strong">{eur(sums.total)}</span>
          <span className="numeric text-xs text-fg-muted">
            HTVA {eur(sums.net)} · TVA {eur(sums.vat)}
          </span>
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((s) => {
          const status = statusLabel(s.status, side)
          const meta = [
            reference(copy.prefix, s.number),
            s.third_party_name,
            formatDate(s.document_date),
            s.booking_date !== s.document_date ? `compta. ${formatDate(s.booking_date)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="truncate text-sm font-medium text-fg-strong">{pieceLabel(s, copy)}</span>
                <span className="truncate text-2xs text-fg-muted">{meta}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {s.kind === 'credit_note' ? <Badge tone="info">note de crédit</Badge> : null}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5 whitespace-nowrap">
                <span className="numeric text-sm text-fg-strong">{rowAmount(s, s.total)}</span>
                <span className="numeric text-2xs text-fg-muted">HTVA {rowAmount(s, s.net)}</span>
              </span>
            </button>
          )
        })}
        {view.total === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filtered ? copy.emptyFiltered : copy.empty}
          />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, copy.one, copy.many)}` : ''}
      </div>

      <Button
        iconLeft={Plus}
        aria-label={copy.newNoun}
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
