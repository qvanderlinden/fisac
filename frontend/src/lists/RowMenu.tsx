import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { Icon, IconButton, cn } from '@qvanderlinden/ui'
import type { RowMenuItem } from './inUse'

export { deleteItem, inUseLabel, type RowMenuAction, type RowMenuItem } from './inUse'

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
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          className={cn(
            'absolute right-0 z-20 flex w-67.5 flex-col gap-0.5 rounded-md border border-line-default bg-surface-card p-1 shadow-lg',
            up ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]',
          )}
        >
          {items.map((m, i) =>
            m === 'separator' ? (
              <div key={i} className="my-1 h-px bg-line-hairline" />
            ) : (
              <button
                key={i}
                type="button"
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
