import type { LucideIcon } from 'lucide-react'
import { Button } from '@qvanderlinden/ui'

export interface BulkAction {
  label: string
  icon: LucideIcon
  variant?: 'secondary' | 'danger'
  disabled?: boolean
  /** Shown on hover, e.g. "bientôt" on an action not built yet. */
  title?: string
  run(): void
}

/**
 * The band over a list while rows are ticked (`Tiers` artboard): "2 tiers sélectionnés",
 * an optional note on the rows the actions skip, the actions and "Désélectionner".
 */
export function BulkBar({
  label,
  note,
  actions,
  onClear,
}: {
  label: string
  note?: string
  actions: BulkAction[]
  onClear(): void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-default bg-surface-selected px-4 py-2.5">
      <span className="text-sm font-semibold text-fg-strong">{label}</span>
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            variant={a.variant ?? 'secondary'}
            size="sm"
            iconLeft={a.icon}
            disabled={a.disabled}
            title={a.title}
            onClick={a.run}
          >
            {a.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={onClear}>
          Désélectionner
        </Button>
      </div>
    </div>
  )
}
