import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Icon, cn } from '@qvanderlinden/ui'
import type { FiscalYearState } from '../api/types'
import { fyLabel, useFiscalYear } from './FiscalYearContext'

const STATE_LABELS: Record<FiscalYearState, string> = {
  open: 'ouvert',
  closed: 'clôturé',
  inventory_only: 'inventaire seul',
}

/** The "FY2026" picker under the logo (`FiscalYear` artboard): picks the year every screen shows. */
export function FiscalYearSwitcher() {
  const { years, current, setCurrent } = useFiscalYear()
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

  if (current === undefined) return <span className="font-mono text-2xs text-ink-300">aucun exercice</span>

  return (
    <div ref={root} className="relative inline-flex font-mono">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Exercice"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          '-ml-1.5 inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-sm border px-1.5 text-2xs text-ink-200',
          open ? 'border-line-inverse bg-cream-100/6' : 'border-transparent bg-transparent',
        )}
      >
        <span>{fyLabel(current)}</span>
        <Icon icon={ChevronDown} size={12} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Exercices"
          className="absolute top-7.5 -left-1.5 z-30 flex w-50 flex-col gap-0.5 rounded-md border border-line-inverse bg-ink-700 p-1 shadow-overlay"
        >
          {years.map((y) => {
            const selected = y.id === current.id
            return (
              <button
                key={y.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setCurrent(y.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-8.5 cursor-pointer items-center justify-between gap-2 rounded-sm border-0 px-2.5 text-left text-xs text-cream-100',
                  selected ? 'bg-cream-100/10 font-semibold' : 'bg-transparent hover:bg-cream-100/6',
                )}
              >
                <span>{fyLabel(y)}</span>
                <span className={cn('text-2xs font-normal', y.state === 'open' ? 'text-olive-200' : 'text-ink-300')}>
                  {STATE_LABELS[y.state]}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
