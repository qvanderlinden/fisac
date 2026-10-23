import { Trash2 } from 'lucide-react'
import { Button, Callout } from '@qvanderlinden/ui'

/** One line of what is about to go: a name, and an IBAN, code or rate beside it. */
export interface DeleteRow {
  label: string
  detail?: string
}

export interface DeleteConfirmProps {
  title: string
  description: string
  rows: DeleteRow[]
  action: string
  onConfirm(): void
  onCancel(): void
}

/** The sunken list of the rows about to be deleted. */
export function DeleteRows({ rows }: { rows: DeleteRow[] }) {
  if (rows.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col rounded-md border border-line-hairline bg-surface-sunken p-0">
      {rows.map((r, i) => (
        <li key={i} className="flex items-baseline gap-3 border-b border-line-hairline px-3 py-2.5 last:border-b-0">
          <span className="min-w-0 flex-auto text-sm text-fg-strong">{r.label}</span>
          {r.detail ? <span className="font-mono text-xs text-fg-muted">{r.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/** "Annuler" and the danger action; `split` lays them out in two equal columns (mobile). */
export function DeleteActions({
  action,
  onConfirm,
  onCancel,
  split = false,
}: Pick<DeleteConfirmProps, 'action' | 'onConfirm' | 'onCancel'> & { split?: boolean }) {
  return (
    <div className={split ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap justify-end gap-2'}>
      <Button variant="ghost" onClick={onCancel}>
        Annuler
      </Button>
      <Button variant="danger" iconLeft={Trash2} onClick={onConfirm}>
        {action}
      </Button>
    </div>
  )
}

/**
 * The deletion to confirm, as the mobile form shows it under its fields (`MobileTiers`
 * artboard): a warning with the title and description, the rows, then the actions.
 * Screens do not mount it themselves: they pass these props as `confirm` to `EditDialog`
 * or `FullScreenForm`, which swap their content for it inside the same dialog.
 */
export function DeleteConfirm({ title, description, rows, action, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning" title={title}>
        {description}
      </Callout>
      <DeleteRows rows={rows} />
      <DeleteActions action={action} onConfirm={onConfirm} onCancel={onCancel} split />
    </div>
  )
}
