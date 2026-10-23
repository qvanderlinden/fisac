import { useState, type ReactNode } from 'react'
import { Callout } from '@qvanderlinden/ui'
import { messageOf } from '../errors'
import type { DeleteConfirmProps } from '../lists/DeleteConfirm'
import { EditDialog } from '../lists/EditDialog'
import { FullScreenForm } from '../lists/FullScreenForm'
import { eur } from '../format'
import { signed } from './piecesList'
import { reference } from './pieceStatus'
import type { SideCopy } from './sideCopy'
import { usePiece, type AnyPiece, type PieceEditor } from './usePiece'
import type { PieceSide } from './usePieceRefs'

/**
 * A sale or a purchase open in its form: the desktop dialog or the mobile full-screen
 * form, its delete with confirmation, and the close that deletes a piece just created
 * (`isNew`) and left with no line and no tiers. Usable without its list (R2): open it by
 * id, it loads the piece. A host that shows figures computed from the piece reloads them
 * in `onSettled`, which waits for the last save (or the delete) to be answered; `onClose`
 * fires at once, to hide the form.
 */
export function PiecePanel<T extends AnyPiece>({
  side,
  id,
  isNew = false,
  initial,
  mobile,
  copy,
  onClose,
  onChange,
  onDeleted,
  onSettled,
  children,
}: {
  side: PieceSide
  id: number
  isNew?: boolean
  initial?: T
  mobile: boolean
  copy: SideCopy
  onClose(): void
  onChange?(piece: T): void
  onDeleted?(id: number): void
  onSettled?(): void
  children(editor: PieceEditor<T>, piece: T): ReactNode
}) {
  const editor = usePiece<T>(side, id, { initial, isNew, onChange, onDeleted, onClose, onSettled })
  const [confirming, setConfirming] = useState(false)
  const piece = editor.piece

  if (editor.error) {
    return (
      <EditDialog title={copy.noun} onClose={onClose}>
        <Callout tone="negative" title="La pièce n’a pas pu être chargée.">
          {messageOf(editor.error)}
        </Callout>
      </EditDialog>
    )
  }
  if (!piece) return null

  const ref = reference(copy.prefix, piece.number)
  const title = `${isNew ? copy.newNoun : copy.noun} ${ref}`
  const confirm: DeleteConfirmProps | undefined = confirming
    ? {
        title: `Supprimer ${ref} ?`,
        description: copy.removeNote,
        rows: mobile ? [] : [{ label: copy.describe(piece), detail: eur(signed(piece, piece.total)) }],
        action: mobile ? 'Supprimer' : copy.remove,
        // The form goes at once; the list drops the row once the server has deleted it,
        // and `onSettled` follows the DELETE.
        onConfirm: () => {
          editor.remove()
          onClose()
        },
        onCancel: () => setConfirming(false),
      }
    : undefined
  const remove = { label: copy.remove, run: () => setConfirming(true) }

  if (mobile) {
    return (
      <FullScreenForm title={title} onClose={editor.close} remove={remove} confirm={confirm}>
        {children(editor, piece)}
      </FullScreenForm>
    )
  }
  if (confirm) return <EditDialog confirm={confirm} onClose={confirm.onCancel} />
  return (
    <EditDialog title={title} description={copy.describe(piece)} size="xl" onClose={editor.close} remove={remove}>
      {children(editor, piece)}
    </EditDialog>
  )
}
