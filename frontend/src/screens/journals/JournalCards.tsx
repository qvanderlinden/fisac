import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Badge, EmptyState } from '@qvanderlinden/ui'
import { countLabel, eur, formatDate } from '../../format'
import { JournalTiles, MovementFilterSelect, type JournalListProps } from './JournalTable'
import { filterMovements, type MovementFilter } from './journalsView'

/**
 * The mobile journal (`MobileJournal` artboard): the tiles, the réalisés / prévus select, then one
 * row per movement with its signed amount, down to "fin de la liste". No running balance here.
 */
export function JournalCards({ journal, year, onOpen }: JournalListProps) {
  const [filter, setFilter] = useState<MovementFilter>('all')
  const shown = filterMovements(journal.movements, filter)

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <JournalTiles journal={journal} year={year} />
        <MovementFilterSelect size="md" className="w-full min-w-0" value={filter} onChange={setFilter} />
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {shown.map((m, i) => {
          const positive = Number(m.amount) > 0
          return (
            <button
              key={`${m.kind}-${m.piece_id ?? m.reference}-${m.date}-${i}`}
              type="button"
              onClick={() => onOpen(m)}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="truncate text-sm font-medium text-fg-strong">{m.label}</span>
                <span className="truncate text-2xs text-fg-muted">
                  {formatDate(m.date)} · {m.reference}
                </span>
                {m.planned ? (
                  <span className="flex">
                    <Badge tone="warning">prévu</Badge>
                  </span>
                ) : null}
              </span>
              <span
                className={`numeric flex-none text-sm whitespace-nowrap ${
                  m.planned ? 'text-fg-muted' : positive ? 'text-positive-fg' : 'text-fg-strong'
                }`}
              >
                {positive ? '+' : ''}
                {eur(m.amount)}
              </span>
            </button>
          )
        })}
        {shown.length === 0 ? <EmptyState icon={BookOpen} title="Aucun mouvement" /> : null}
      </div>

      <div className="px-4 pt-4 pb-8 text-center font-mono text-xs text-fg-muted">
        {shown.length ? `fin de la liste · ${countLabel(shown.length, 'mouvement', 'mouvements')}` : ''}
      </div>
    </div>
  )
}
