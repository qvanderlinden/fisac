import { toast, Badge } from '@qvanderlinden/ui'
import type { PurchaseRead, SaleRead } from '../api/types'
import { eur } from '../format'
import { EffectCards } from './EffectCards'
import { LineEditor, type LineField } from './LineEditor'
import { PieceHeader } from './PieceHeader'
import { signed } from './piecesList'
import { statusLabel } from './pieceStatus'
import type { PieceEditor } from './usePiece'
import type { PieceRefs, PieceSide } from './usePieceRefs'

/** The body of a new line: the last line's category and scheme, else the first category and the highest rate. */
export function newLineBody(piece: SaleRead | PurchaseRead, refs: PieceRefs): object | null {
  const last = piece.lines.at(-1)
  const category = last?.category_id ?? refs.categories.find((c) => !c.archived)?.id
  const scheme = last?.vat_scheme_id ?? [...refs.vatSchemes].sort((a, b) => Number(b.rate) - Number(a.rate))[0]?.id
  if (category === undefined || scheme === undefined) return null
  return { description: '', unit_price: '0', quantity: '1', category_id: category, vat_scheme_id: scheme }
}

/**
 * The form of a sale or a purchase (`Ventes` / `Achats` artboards and their mobile
 * versions): the header, the lines with the totals, and the three effect cards.
 */
export function PieceForm<T extends SaleRead | PurchaseRead>({
  side,
  editor,
  piece,
  refs,
  mobile,
  onOpenAsset,
}: {
  side: PieceSide
  editor: PieceEditor<T>
  piece: T
  refs: PieceRefs
  mobile: boolean
  onOpenAsset?(assetId: number): void
}) {
  const addLine = () => {
    const body = newLineBody(piece, refs)
    if (body) void editor.addLine(body)
    else
      toast(
        side === 'sale'
          ? 'Créez d’abord une catégorie de vente et un régime de TVA pour les ventes.'
          : 'Créez d’abord une catégorie d’achat et un régime de TVA pour les achats.',
        { tone: 'negative' },
      )
  }
  const patchLine = (lineId: number, field: LineField, value: string | number) => editor.patchLine(lineId, { [field]: value })
  const status = statusLabel(piece.status)

  const totals = (
    <div className={mobile ? 'flex flex-col gap-2 rounded-lg bg-surface-sunken px-4 py-3.5' : 'flex flex-wrap items-baseline gap-x-7 gap-y-2'}>
      {(
        [
          ['HTVA', piece.net],
          ['TVA', piece.vat],
          ['TVAC', piece.total],
        ] as const
      ).map(([label, amount]) => (
        <span
          key={label}
          className={
            mobile
              ? 'flex justify-between text-sm text-fg-muted'
              : label === 'TVAC'
                ? 'text-sm font-semibold text-fg-strong'
                : 'text-sm text-fg-muted'
          }
        >
          {label}
          <span className={label === 'TVAC' ? 'numeric ml-2 text-md whitespace-nowrap text-fg-strong' : 'numeric ml-2 whitespace-nowrap text-fg-strong'}>
            {eur(signed(piece, amount))}
          </span>
        </span>
      ))}
    </div>
  )

  const lines = (
    <LineEditor
      lines={piece.lines}
      side={side}
      categories={refs.categories}
      vatSchemes={refs.vatSchemes}
      isocSchemes={refs.isocSchemes}
      mobile={mobile}
      onAdd={addLine}
      onPatch={patchLine}
      onRemove={(lineId) => void editor.removeLine(lineId)}
      onOpenAsset={onOpenAsset}
      totals={totals}
    />
  )
  const header = <PieceHeader piece={piece} side={side} refs={refs} mobile={mobile} onPatch={editor.patch} />
  const effects = <EffectCards piece={piece} side={side} refs={refs} />

  if (mobile) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line-hairline bg-surface-card px-4 py-3">
          <span className="flex flex-col gap-0.5">
            <span className="type-eyebrow text-fg-muted">total TVAC</span>
            <span className="numeric text-xl text-fg-strong">{eur(signed(piece, piece.total))}</span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            {piece.kind === 'credit_note' ? <Badge tone="info">note de crédit</Badge> : null}
          </span>
        </div>
        {header}
        {lines}
        <section className="flex flex-col gap-3">
          <span className="type-eyebrow text-fg-muted">effets</span>
          {effects}
        </section>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      {lines}
      {effects}
    </div>
  )
}
