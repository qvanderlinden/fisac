import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Callout } from '@qvanderlinden/ui'
import type { ResultPieceRead, ResultRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { SalePanel } from '../sales/SalesForm'
import { ResultCards } from './ResultCards'
import { ResultDetail } from './ResultDetail'
import { ResultHeader, ResultTable } from './ResultTable'
import { pieceSide, type ResultRow } from './resultView'

/**
 * The Résultat screen: tiles and the income statement by category, with depreciation by asset.
 * A category row lists its pieces, a piece opens in its panel (the result reloads when it
 * closes), an asset row goes to that asset in Immobilisations.
 */
export function ResultScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const navigate = useNavigate()
  const { current } = useFiscalYear()
  const result = useResource<ResultRead>(current ? `/fiscal-years/${current.id}/result` : null)
  const [row, setRow] = useState<ResultRow | null>(null)
  const [piece, setPiece] = useState<ResultPieceRead | null>(null)

  if (result.error) {
    return (
      <Callout tone="negative" title="Le résultat n’a pas pu être chargé.">
        {messageOf(result.error)}
      </Callout>
    )
  }
  if (!result.data || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const year = current.end_date.slice(0, 4)
  const side = piece ? pieceSide(piece.reference) : null

  function open(next: ResultRow) {
    if (next.assetId !== undefined) navigate(`/immobilisations?asset=${next.assetId}`)
    else setRow(next)
  }

  function closePiece() {
    setPiece(null)
    void result.reload()
  }

  const list = { result: result.data, year, onOpen: open }
  return (
    <div className="flex flex-col gap-6">
      <ResultHeader year={year} />
      {mobile ? <ResultCards {...list} /> : <ResultTable {...list} />}

      {row && !piece ? (
        <ResultDetail row={row} year={year} mobile={mobile} onOpen={setPiece} onClose={() => setRow(null)} />
      ) : null}
      {piece && side === 'sale' ? <SalePanel id={piece.piece_id} onClose={closePiece} /> : null}
      {piece && side === 'purchase' ? <PurchasePanel id={piece.piece_id} onClose={closePiece} /> : null}
    </div>
  )
}
