import { useState, type ReactNode } from 'react'
import { Button, Callout, Dialog } from '@qvanderlinden/ui'
import { describeError } from '../errors'

interface ConfirmDialogProps {
  title: string
  /** What will happen, in one or two sentences. */
  description: ReactNode
  /** The destructive action, e.g. "Supprimer le flux". */
  confirmLabel: string
  /** Runs the action. Rejecting keeps the dialog open with the error shown. */
  onConfirm: () => Promise<void>
  onClose: () => void
}

// Stands in for the browser's confirm prompt: the confirm button runs the
// action, shows its error inline if it fails, and closes the dialog once it
// succeeds. Mount it only while it should be open.
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(describeError(err))
      setBusy(false)
      return
    }
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="button" variant="danger" onClick={handleConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="type-body-sm text-fg-body">{description}</p>
        {error && (
          <Callout tone="negative" title="Action impossible">
            {/* The detail is the server's own wording; the sentence around it says what to do. */}
            Réessayez, ou annulez. (détail : {error.replace(/[.\s]+$/, '')})
          </Callout>
        )}
      </div>
    </Dialog>
  )
}
