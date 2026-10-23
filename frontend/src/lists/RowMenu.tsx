import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Trash2, type LucideIcon } from 'lucide-react'
import { Icon, IconButton, cn } from '@qvanderlinden/ui'

export interface RowMenuAction {
  label: string
  icon: LucideIcon
  danger?: boolean
  disabled?: boolean
  run(): void
}

export type RowMenuItem = RowMenuAction | 'separator'

/** What replaces delete on a row that pieces carry: "Porté par 3 pièces : impossible de le supprimer". */
export function inUseLabel(uses: number): string {
  return `Porté par ${uses} ${uses === 1 ? 'pièce' : 'pièces'} : impossible de le supprimer`
}

/** The menu's last item: the danger "Supprimer …", or the disabled in-use line when `uses > 0`. */
export function deleteItem(label: string, uses: number, run: () => void): RowMenuAction {
  return uses > 0
    ? { label: inUseLabel(uses), icon: Trash2, disabled: true, run }
    : { label, icon: Trash2, danger: true, run }
}

/**
 * The "Plus d’actions" button at the end of a row and its menu (`Tiers` artboard).
 * Picking an item closes the menu first; `up` opens it above the button, for the last rows.
 */
export function RowMenu({ items, up = false }: { items: RowMenuItem[]; up?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative inline-flex">
      <IconButton
        icon={MoreVertical}
        size="sm"
        label="Plus d’actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-20 flex w-67.5 flex-col gap-0.5 rounded-md border border-line-default bg-surface-card p-1 shadow-lg',
            up ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]',
          )}
        >
          {items.map((m, i) =>
            m === 'separator' ? (
              <div key={i} role="separator" className="my-1 h-px bg-line-hairline" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={m.disabled}
                onClick={() => {
                  setOpen(false)
                  m.run()
                }}
                className={cn(
                  'flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent px-3 text-left text-sm leading-tight font-medium',
                  'disabled:cursor-default disabled:bg-transparent disabled:text-fg-subtle',
                  m.danger
                    ? 'text-negative-fg hover:bg-negative-soft'
                    : 'text-fg-body hover:bg-surface-hover hover:text-fg-strong',
                )}
              >
                <Icon icon={m.icon} />
                {m.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
