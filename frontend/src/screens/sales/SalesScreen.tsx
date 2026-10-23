import type { SaleRead } from '../../api/types'
import { PiecesScreen } from '../../pieces/PiecesScreen'
import { SalePanel } from './SalesForm'

/**
 * The Ventes screen: the current fiscal year's sales (`PiecesScreen`, shared with
 * Achats), each opening in its `SalePanel`.
 */
export function SalesScreen() {
  return <PiecesScreen<SaleRead> side="sale" Panel={SalePanel} />
}
