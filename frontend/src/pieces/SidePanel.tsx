import { Callout } from '@qvanderlinden/ui'
import type { PurchaseRead, SaleRead } from '../api/types'
import { messageOf } from '../errors'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PieceForm } from './PieceForm'
import { PiecePanel } from './PiecePanel'
import { SIDE_COPY } from './sideCopy'
import { usePieceRefs, type PieceRefs, type PieceSide } from './usePieceRefs'

export interface SidePanelProps<T extends SaleRead | PurchaseRead> {
  id: number
  onClose(): void
  /** Each answer of the server: the piece as it now stands. */
  onChange?(piece: T): void
  onDeleted?(id: number): void
  /**
   * Just created by "Nouvelle vente" / "Nouvel achat": the title says so, and closing it
   * with no line and no tiers deletes it. A piece opened otherwise is never deleted on close.
   */
  isNew?: boolean
  /** The piece as the list has it, to show at once instead of loading it. */
  initial?: T
  /** The tiers, categories, schemes and methods, when the caller has them; loaded otherwise. */
  refs?: PieceRefs
}

type Props<T extends SaleRead | PurchaseRead> = SidePanelProps<T> & {
  side: PieceSide
  /** Opens the fixed asset that takes a purchase line over. */
  onOpenAsset?(assetId: number): void
}

function Panel<T extends SaleRead | PurchaseRead>({ side, refs, onOpenAsset, ...p }: Props<T> & { refs: PieceRefs }) {
  const mobile = useMediaQuery('(max-width: 640px)')
  return (
    <PiecePanel<T> side={side} mobile={mobile} copy={SIDE_COPY[side]} {...p}>
      {(editor, piece) => (
        <PieceForm side={side} editor={editor} piece={piece} refs={refs} mobile={mobile} onOpenAsset={onOpenAsset} />
      )}
    </PiecePanel>
  )
}

function LoadingPanel<T extends SaleRead | PurchaseRead>(p: Props<T>) {
  const { refs, error } = usePieceRefs(p.side)
  if (error) {
    return (
      <Callout tone="negative" title={SIDE_COPY[p.side].openError}>
        {messageOf(error)}
      </Callout>
    )
  }
  return refs ? <Panel {...p} refs={refs} /> : null
}

/**
 * A sale or a purchase open in its form (desktop dialog, mobile full screen), without
 * its list (R2): `SalePanel` and `PurchasePanel` wrap it, so the Journaux, TVA and
 * Résultat screens open a piece in place with `<SalePanel id onClose />`.
 */
export function SidePanel<T extends SaleRead | PurchaseRead>(p: Props<T>) {
  return p.refs ? <Panel {...p} refs={p.refs} /> : <LoadingPanel {...p} />
}
