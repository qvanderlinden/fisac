import type { SaleRead } from '../../api/types'
import { SIDE_COPY } from '../../pieces/sideCopy'
import { SidePanel, type SidePanelProps } from '../../pieces/SidePanel'

export const SALE_COPY = SIDE_COPY.sale

export type SalePanelProps = SidePanelProps<SaleRead>

/**
 * A sale open in its form (desktop dialog, mobile full screen), without the list: the
 * Journaux, TVA and Résultat screens open a piece in place with `<SalePanel id onClose />`.
 */
export function SalePanel(p: SalePanelProps) {
  return <SidePanel<SaleRead> side="sale" {...p} />
}
