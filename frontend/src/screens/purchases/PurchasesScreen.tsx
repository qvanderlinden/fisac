import type { PurchaseRead } from '../../api/types'
import { PiecesScreen } from '../../pieces/PiecesScreen'
import { PurchasePanel } from './PurchasesForm'

/**
 * The Achats screen: the current fiscal year's purchases (`PiecesScreen`, shared with
 * Ventes), each opening in its `PurchasePanel`.
 */
export function PurchasesScreen() {
  return <PiecesScreen<PurchaseRead> side="purchase" Panel={PurchasePanel} />
}
