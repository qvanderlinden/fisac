import { Trash2 } from 'lucide-react'
import { Button, Callout } from '@qvanderlinden/ui'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ListDialog } from './EditDialog'

/** One line of what is about to go: a name, and an IBAN, code or rate beside it. */
export interface DeleteRow {
  label: string
  detail?: string
}

/**
 * The deletion to confirm, in the dialog the edit form was in (`Tiers` artboard):
 * on desktop it takes that dialog over — title, description, the rows, "Annuler" and
 * the danger action; on mobile it is the warning block the screen places inside its
 * `FullScreenForm`, under the fields (`MobileTiers` artboard).
 */
export function DeleteConfirm({
  title,
  description,
  rows,
  action,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  rows: DeleteRow[]
  action: string
  onConfirm(): void
  onCancel(): void
}) {
  const mobile = useMediaQuery('(max-width: 640px)')

  if (mobile) {
    return (
      <div className="flex flex-col gap-3">
        <Callout tone="warning" title={title}>
          {description}
        </Callout>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="danger" iconLeft={Trash2} onClick={onConfirm}>
            {action}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ListDialog title={title} description={description} onClose={onCancel}>
      <div className="flex flex-col gap-5">
        {rows.length > 0 && (
          <ul className="m-0 flex list-none flex-col rounded-md border border-line-hairline bg-surface-sunken p-0">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-baseline gap-3 border-b border-line-hairline px-3 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-auto text-sm text-fg-strong">{r.label}</span>
                {r.detail ? <span className="font-mono text-xs text-fg-muted">{r.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="danger" iconLeft={Trash2} onClick={onConfirm}>
            {action}
          </Button>
        </div>
      </div>
    </ListDialog>
  )
}
