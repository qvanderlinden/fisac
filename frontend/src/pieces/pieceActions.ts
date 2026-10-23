import { api } from '../api/client'
import type { LineRead, PaymentMethodRead, PieceKind } from '../api/types'
import { todayIso } from './piecesList'
import { piecePath, piecesPath, type AnyPiece } from './usePiece'
import type { PieceSide } from './usePieceRefs'

type Piece = AnyPiece & { lines: LineRead[] }

/**
 * "Nouvelle vente" / "Nouvel achat": the piece is created at once, so its number shows:
 * an invoice dated today, paid by the first method the side allows, expected today.
 * Null when the side has no payment method.
 */
export function createPiece<T extends AnyPiece>(side: PieceSide, methods: PaymentMethodRead[]): Promise<T> | null {
  const method = methods[0]
  if (!method) return null
  const today = todayIso()
  return api.post<T>(piecesPath(side), {
    kind: 'invoice',
    document_date: today,
    payment_method_id: method.id,
    payment_date: today,
  })
}

/**
 * A copy of a piece and its lines, dated and expected today, unpaid: "Dupliquer", or
 * "Créer la note de crédit" with `kind: 'credit_note'`. Resolves the copy as it stands
 * after its last line.
 */
export async function copyPiece<T extends Piece>(
  side: PieceSide,
  piece: T,
  over: { kind: PieceKind; description: string },
): Promise<T> {
  const today = todayIso()
  let copy = await api.post<T>(piecesPath(side), {
    kind: over.kind,
    document_date: today,
    payment_method_id: piece.payment_method_id,
    payment_date: today,
    third_party_id: piece.third_party_id,
    description: over.description.slice(0, 200),
    paid: false,
  })
  for (const l of piece.lines) {
    copy = await api.post<T>(`${piecePath(side, copy.id)}/lines`, {
      description: l.description,
      unit_price: l.unit_price,
      quantity: l.quantity,
      category_id: l.category_id,
      vat_scheme_id: l.vat_scheme_id,
    })
  }
  return copy
}

/** Marks a piece paid or unpaid; its payment date stays. */
export function setPaid<T extends AnyPiece>(side: PieceSide, id: number, paid: boolean): Promise<T> {
  return api.patch<T>(piecePath(side, id), { paid })
}

export function deletePiece(side: PieceSide, id: number): Promise<void> {
  return api.del(piecePath(side, id))
}
