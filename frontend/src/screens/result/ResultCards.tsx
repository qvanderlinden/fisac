import { ChevronRight } from 'lucide-react'
import { eur } from '../../format'
import { RESULT_NOTE, ResultTiles, type ResultListProps } from './ResultTable'
import { resultClosing, resultSections, shareOfRevenue } from './resultView'

/** The mobile result (`MobileResultat` artboard): the tiles, then one touch row per line, section by section. */
export function ResultCards({ result, onOpen, onNavigate }: ResultListProps) {
  return (
    <div className="-mx-4 flex flex-col">
      <div className="px-4 pb-4">
        <ResultTiles result={result} />
      </div>
      {resultSections(result).map((section) => (
        <section key={section.group} aria-label={section.title}>
          <h2 className="m-0 border-y border-line-hairline bg-surface-sunken px-4 py-2 font-mono text-2xs tracking-wide text-fg-muted uppercase">
            {section.title.toLowerCase()}
          </h2>
          {section.rows.map((row) => {
            const share = shareOfRevenue(row.amount, result.revenue.total)
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onOpen(row)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-surface-card px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
              >
                <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-fg-strong">{row.label}</span>
                  <span className="truncate text-2xs text-fg-muted">{share ? `${row.count} · ${share}` : row.count}</span>
                </span>
                <span className="numeric flex-none text-sm whitespace-nowrap text-fg-strong">{eur(row.amount)}</span>
                <ChevronRight className="size-4 flex-none text-fg-muted" aria-hidden />
              </button>
            )
          })}
          <div className="flex items-center justify-between gap-3 border-b border-line-hairline px-4 py-2.5">
            <span className="text-sm font-semibold text-fg-strong">{section.totalLabel}</span>
            <span className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(section.total)}</span>
          </div>
        </section>
      ))}
      <section aria-label="Résultat">
        <h2 className="m-0 border-y border-line-hairline bg-surface-sunken px-4 py-2 font-mono text-2xs tracking-wide text-fg-muted uppercase">
          résultat
        </h2>
        {resultClosing(result).map((row) =>
          row.to ? (
            <button
              key={row.key}
              type="button"
              onClick={() => onNavigate(row.to!)}
              className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-surface-card px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-fg-strong">{row.label}</span>
                <span className="truncate text-2xs text-fg-muted">détail sur l’écran ISOC</span>
              </span>
              <span className="numeric flex-none text-sm whitespace-nowrap text-fg-strong">{eur(row.amount)}</span>
              <ChevronRight className="size-4 flex-none text-fg-muted" aria-hidden />
            </button>
          ) : (
            <div key={row.key} className="flex items-center justify-between gap-3 border-b border-line-hairline px-4 py-3">
              <span className="text-sm font-semibold text-fg-strong">{row.label}</span>
              <span className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(row.amount)}</span>
            </div>
          ),
        )}
      </section>
      <p className="m-0 px-4 pt-3 pb-8 text-xs text-fg-muted">{RESULT_NOTE}</p>
    </div>
  )
}
