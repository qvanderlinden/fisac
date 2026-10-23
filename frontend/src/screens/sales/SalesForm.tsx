import { Callout } from '@qvanderlinden/ui'
import type { SaleRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { PieceForm } from '../../pieces/PieceForm'
import { PiecePanel, type PieceCopy } from '../../pieces/PiecePanel'
import { usePieceRefs, type PieceRefs } from '../../pieces/usePieceRefs'

export const SALE_COPY: PieceCopy = {
  noun: 'Vente',
  newNoun: 'Nouvelle vente',
  prefix: 'S',
  describe: (p) => [p.third_party_name, p.description].filter(Boolean).join(' · ') || 'Vente sans description',
  remove: 'Supprimer la vente',
  removeNote: 'La vente, ses lignes et son paiement au journal financier sont supprimés. C’est définitif.',
}

export interface SalePanelProps {
  id: number
  onClose(): void
  /** Each answer of the server: the sale as it now stands. */
  onChange?(sale: SaleRead): void
  onDeleted?(id: number): void
  /** Just created by "Nouvelle vente": the title says so. */
  isNew?: boolean
  /** The sale as the list has it, to show at once instead of loading it. */
  initial?: SaleRead
  /** The tiers, categories, schemes and methods, when the caller has them; loaded otherwise. */
  refs?: PieceRefs
}

function Panel({ refs, ...p }: SalePanelProps & { refs: PieceRefs }) {
  const mobile = useMediaQuery('(max-width: 640px)')
  return (
    <PiecePanel<SaleRead> side="sale" mobile={mobile} copy={SALE_COPY} {...p}>
      {(editor, sale) => <PieceForm side="sale" editor={editor} piece={sale} refs={refs} mobile={mobile} />}
    </PiecePanel>
  )
}

function LoadingPanel(p: SalePanelProps) {
  const { refs, error } = usePieceRefs('sale')
  if (error) {
    return (
      <Callout tone="negative" title="La vente n’a pas pu être ouverte.">
        {messageOf(error)}
      </Callout>
    )
  }
  return refs ? <Panel {...p} refs={refs} /> : null
}

/**
 * A sale open in its form (desktop dialog, mobile full screen), without the list: the
 * Journaux, TVA and Résultat screens open a piece in place with `<SalePanel id onClose />`.
 */
export function SalePanel(p: SalePanelProps) {
  return p.refs ? <Panel {...p} refs={p.refs} /> : <LoadingPanel {...p} />
}
