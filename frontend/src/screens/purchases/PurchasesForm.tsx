import { useNavigate } from 'react-router'
import type { PurchaseRead } from '../../api/types'
import { SIDE_COPY } from '../../pieces/sideCopy'
import { SidePanel, type SidePanelProps } from '../../pieces/SidePanel'

export const PURCHASE_COPY = SIDE_COPY.purchase

export type PurchasePanelProps = SidePanelProps<PurchaseRead>

/** Where a fixed asset opens: the register with that asset's form open (Immobilisations honours `?asset=`). */
export function assetPath(assetId: number): string {
  return `/immobilisations?asset=${assetId}`
}

/**
 * A purchase open in its form (desktop dialog, mobile full screen), without the list: the
 * Journaux, TVA and Résultat screens open a piece in place with `<PurchasePanel id onClose onSettled />`.
 * A line taken over by a fixed asset shows "au registre · I-004", which opens that asset.
 */
export function PurchasePanel(p: PurchasePanelProps) {
  const navigate = useNavigate()
  return <SidePanel<PurchaseRead> side="purchase" onOpenAsset={(id) => navigate(assetPath(id))} {...p} />
}
