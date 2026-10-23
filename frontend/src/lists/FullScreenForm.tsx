import { useEffect, useRef, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@qvanderlinden/ui'
import { INK_ICON_BUTTON } from '../shell/MobileHeader'
import type { RemoveAction } from './EditDialog'

/**
 * Mobile edit form of a configuration list (`MobileTiers` artboard): an ink bar with the
 * close button, "enregistré automatiquement" and the title; the screen's form; the
 * optional delete button; a "Fermer" footer. Covers the whole viewport while mounted.
 */
export function FullScreenForm({
  title,
  onClose,
  remove,
  children,
}: {
  title: string
  onClose(): void
  remove?: RemoveAction
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
    ;(first ?? root.current)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-surface-page outline-none"
    >
      <header className="flex flex-none items-center gap-1 bg-surface-inverse pt-2 pr-3 pb-3 pl-2">
        <IconButton icon={X} size="lg" label="Fermer" onClick={onClose} className={INK_ICON_BUTTON} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-2xs text-ink-300">enregistré automatiquement</span>
          <span className="truncate font-display text-xl leading-tight text-cream-50">{title}</span>
        </div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-6">
        {children}
        {remove ? (
          <Button variant="ghost" iconLeft={Trash2} onClick={remove.run}>
            {remove.label}
          </Button>
        ) : null}
      </div>
      <footer className="flex-none border-t border-line-default bg-surface-card px-4 pt-3 pb-4">
        <Button variant="secondary" block onClick={onClose}>
          Fermer
        </Button>
      </footer>
    </div>
  )
}
