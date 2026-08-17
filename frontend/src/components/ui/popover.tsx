import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PopoverProps {
  // Rendered inside the trigger button.
  trigger: ReactNode
  triggerClassName?: string
  triggerLabel?: string
  align?: 'left' | 'right'
  // Content, or a render fn receiving a `close` callback (e.g. to close after
  // an action). Closes automatically on outside-click and Escape.
  children: ReactNode | ((close: () => void) => ReactNode)
}

export function Popover({
  trigger,
  triggerClassName,
  triggerLabel,
  align = 'right',
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="popover" ref={ref}>
      <button
        type="button"
        className={cn('popover-trigger', triggerClassName)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={cn('popover-panel', align === 'left' ? 'popover-panel-left' : 'popover-panel-right')}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
