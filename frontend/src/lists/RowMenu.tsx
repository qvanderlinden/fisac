import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { Icon, IconButton, cn } from '@qvanderlinden/ui'
import type { RowMenuItem } from './inUse'

export { deleteItem, inUseLabel, type RowMenuAction, type RowMenuItem } from './inUse'

const GAP = 4

/**
 * The "Plus d’actions" button at the end of a row and its menu (`Tiers` artboard).
 * The menu is portalled to the body and fixed under the button, right edges aligned,
 * so a table's scroll container never clips it; it opens above when there is no room
 * below. It closes on a pick, an outside press, Escape, a scroll or a resize.
 */
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null)
  const button = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // Measured before paint: the menu first renders hidden, then lands in place.
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    const anchor = button.current?.getBoundingClientRect()
    const height = menu.current?.offsetHeight ?? 0
    if (!anchor) return
    const below = anchor.bottom + GAP
    const fits = below + height <= window.innerHeight || anchor.top - GAP - height < 0
    setPlace({ top: fits ? below : anchor.top - GAP - height, right: window.innerWidth - anchor.right })
  }, [open])

  // Keyboard users land on the first item once the menu is in place.
  useEffect(() => {
    if (place) menu.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true })
  }, [place])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!button.current?.contains(target) && !menu.current?.contains(target)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      button.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div ref={button} className="inline-flex">
      <IconButton
        icon={MoreVertical}
        size="sm"
        label="Plus d’actions"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open &&
        createPortal(
          <div
            ref={menu}
            style={place ?? { top: 0, right: 0, visibility: 'hidden' }}
            className="fixed z-30 flex w-67.5 flex-col gap-0.5 rounded-md border border-line-default bg-surface-card p-1 shadow-lg"
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
          </div>,
          document.body,
        )}
    </div>
  )
}
