import { ChevronRight } from 'lucide-react'
import { eur } from '../../format'
import { COMPUTATION_NOTE, isClickable, type ComputationProps } from './IsocComputation'
import { computationRows } from './isocView'

/** "Calcul de l’impôt" on mobile (`MobileIsoc` artboard): one row per step, the clickable ones with a chevron. */
export function IsocCards({ isoc, onOpen }: ComputationProps) {
  return (
    <section aria-label="Calcul de l’impôt" className="-mx-4 flex flex-col">
      <h2 className="m-0 border-y border-line-hairline bg-surface-sunken px-4 py-2 type-eyebrow text-fg-muted">calcul de l’impôt</h2>
      {computationRows(isoc).map((row) => {
        const body = (
          <>
            <span className="flex min-w-0 flex-auto flex-col gap-0.5">
              <span className={`text-sm ${row.total ? 'font-semibold' : 'font-medium'} text-fg-strong`}>{row.label}</span>
              {row.meta ? <span className="font-mono text-2xs text-fg-muted">{row.meta}</span> : null}
            </span>
            <span className={`numeric flex-none text-sm whitespace-nowrap text-fg-strong ${row.total ? 'font-semibold' : ''}`}>
              {eur(row.amount)}
            </span>
          </>
        )
        return isClickable(row) ? (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpen(row)}
            aria-label={`Voir le détail de ${row.label}`}
            className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-surface-card px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            {body}
            <ChevronRight className="size-4 flex-none text-fg-muted" aria-hidden />
          </button>
        ) : (
          <div
            key={row.key}
            className={`flex min-h-12 items-center gap-3 border-b border-line-hairline px-4 py-2.5 ${row.total ? 'bg-surface-sunken' : 'bg-surface-card'}`}
          >
            {body}
          </div>
        )
      })}
      <p className="m-0 px-4 pt-3 text-xs text-fg-muted">{COMPUTATION_NOTE}</p>
    </section>
  )
}
