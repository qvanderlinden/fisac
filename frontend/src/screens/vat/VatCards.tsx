import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { Badge, EmptyState } from '@qvanderlinden/ui'
import { countLabel, eur, formatDate } from '../../format'
import { FilingDate, PieceFilterSelect, StatusBadge, VatSummary, VatTiles, pieceTotals, type VatViewProps } from './VatPeriodView'
import { filterPieces, type PieceFilter } from './vatView'

/** The mobile view of one period (`MobileTva` artboard): tiles, summary, filing date, then one row per piece. */
export function VatCards({ period, onSaved, onOpen }: VatViewProps) {
  const [filter, setFilter] = useState<PieceFilter>('all')
  const shown = filterPieces(period.pieces, filter)
  const totals = pieceTotals(shown)

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="flex">
          <StatusBadge period={period} />
        </span>
        <VatTiles period={period} />
        <VatSummary period={period} />
        <FilingDate key={`${period.id}-${period.filed_on}`} period={period} onSaved={onSaved} />
        <PieceFilterSelect size="md" className="w-full min-w-0" value={filter} onChange={setFilter} />
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {shown.map((p) => (
          <button
            key={`${p.kind}-${p.piece_id}`}
            type="button"
            onClick={() => onOpen(p)}
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{p.third_party ?? p.number}</span>
              <span className="truncate text-2xs text-fg-muted">
                {formatDate(p.date)} · {p.number}
              </span>
              <span className="flex">
                <Badge tone={p.kind === 'sale' ? 'positive' : 'neutral'}>{p.kind === 'sale' ? 'vente' : 'achat'}</Badge>
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-0.5">
              <span className="numeric text-sm whitespace-nowrap text-fg-strong">{eur(p.net)}</span>
              <span className="numeric text-2xs whitespace-nowrap text-fg-muted">
                {p.kind === 'sale' ? `TVA due ${eur(p.vat)}` : `TVA récupérée ${eur(p.recovered)}`}
              </span>
            </span>
          </button>
        ))}
        {shown.length === 0 ? <EmptyState icon={Receipt} title="Aucune pièce" /> : null}
      </div>

      <div className="flex flex-col gap-1 px-4 pt-4 pb-8 text-sm">
        <span className="font-semibold text-fg-strong">Total · {countLabel(shown.length, 'pièce', 'pièces')}</span>
        <span className="numeric text-fg-muted">TVA due {eur(totals.due)}</span>
        <span className="numeric text-fg-muted">TVA récupérée {eur(totals.recovered)}</span>
      </div>
    </div>
  )
}
