import { Callout } from '@qvanderlinden/ui'
import type { ResultPieceRead } from '../../api/types'
import { eur, formatDate } from '../../format'
import { ListDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import type { ResultRow } from './resultView'

/**
 * The pieces behind one line of the result (dialog on desktop, full screen on mobile);
 * choosing one opens it in its own panel.
 */
export function ResultDetail({
  row,
  year,
  mobile,
  onOpen,
  onClose,
}: {
  row: ResultRow
  year: string
  mobile: boolean
  onOpen(piece: ResultPieceRead): void
  onClose(): void
}) {
  const pieces = row.pieces ?? []
  const body = (
    <div className="flex flex-col gap-4">
      <Callout tone="info" title={`Exercice ${year} · ${eur(row.amount)}`}>
        {row.count}, comptées à leur date de comptabilisation, payées ou non.
      </Callout>
      <ul className="m-0 flex list-none flex-col divide-y divide-line-hairline rounded-lg border border-line-hairline p-0">
        {pieces.map((p) => (
          <li key={p.piece_id + p.reference}>
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-2.5 text-left hover:bg-surface-hover focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg-strong">{p.third_party ?? p.reference}</span>
                <span className="font-mono text-2xs text-fg-muted">
                  {p.reference} · {formatDate(p.date, 'full')}
                </span>
              </span>
              <span className="numeric text-sm whitespace-nowrap text-fg-strong">{eur(p.amount)}</span>
            </button>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5">
          <span className="text-sm font-semibold text-fg-strong">{row.count}</span>
          <span className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(row.amount)}</span>
        </li>
      </ul>
    </div>
  )
  return mobile ? (
    <FullScreenForm title={row.label} onClose={onClose}>
      {body}
    </FullScreenForm>
  ) : (
    <ListDialog title={row.label} description={`Exercice ${year}`} size="lg" onClose={onClose}>
      {body}
    </ListDialog>
  )
}
