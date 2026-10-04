import { useState, type ReactNode } from 'react'
import { Button, Callout, Dialog } from '@qvanderlinden/ui'
import { RELOAD_LEAD, frameError } from '../errors'

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
      setError(frameError(err, { client: RELOAD_LEAD }))
      setBusy(false)
      return
    }
    onClose()
  }

  // While the action runs, a close request (X, Escape, scrim) is ignored:
  // closing would swallow a failure that arrives a moment later.
  function requestClose() {
    if (!busy) onClose()
  }

  return (
    <Dialog
      open
      onClose={requestClose}
      onEscapeKeyDown={(e) => busy && e.preventDefault()}
      onInteractOutside={(e) => busy && e.preventDefault()}
      title={title}
      description={description}
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
      {error && (
        <Callout tone="negative" title="Action impossible.">
          {error}
        </Callout>
      )}
    </Dialog>
  )
}
