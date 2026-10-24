import { Callout } from '@qvanderlinden/ui'
import type { DisallowedLineRead, IsocRead, IsocRubric } from '../../api/types'
import { countLabel, eur, formatDate, formatRate } from '../../format'
import { ListDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { lineTarget, rubricLabels, type LineTarget } from './isocView'

/**
 * The lines behind one disallowed rubric (dialog on desktop, full screen on mobile): each
 * purchase line, or fixed asset's depreciation, with its non-deductible part; a purchase
 * opens in its panel, an asset in the register.
 */
export function DisallowedDetail({
  rubric,
  isoc,
  year,
  mobile,
  onOpen,
  onClose,
}: {
  rubric: IsocRubric
  isoc: IsocRead
  year: string
  mobile: boolean
  onOpen(target: LineTarget): void
  onClose(): void
}) {
  const { total, lines } = isoc.disallowed[rubric]
  const title = `Dépenses non admises — ${rubricLabels[rubric]}`
  const row = (line: DisallowedLineRead) => (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-fg-strong">{line.label || line.reference}</span>
        <span className="font-mono text-2xs text-fg-muted">
          {line.reference} · {formatDate(line.date, 'full')} · {formatRate(100 - Number(line.deductible_rate))} non admis de{' '}
          {eur(line.amount)}
        </span>
      </span>
      <span className="numeric text-sm whitespace-nowrap text-fg-strong">{eur(line.disallowed)}</span>
    </>
  )
  const body = (
    <div className="flex flex-col gap-4">
      <Callout tone="info" title={`Exercice ${year} · ${eur(total)}`}>
        La part non déductible de chaque ligne s’ajoute au résultat pour former la base imposable.
      </Callout>
      <ul className="m-0 flex list-none flex-col divide-y divide-line-hairline rounded-lg border border-line-hairline p-0">
        {lines.map((line) => {
          const target = lineTarget(line)
          return (
            <li key={`${line.reference}-${line.date}-${line.amount}`}>
              {target ? (
                <button
                  type="button"
                  onClick={() => onOpen(target)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-2.5 text-left hover:bg-surface-hover focus-visible:-outline-offset-2"
                >
                  {row(line)}
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">{row(line)}</div>
              )}
            </li>
          )
        })}
        <li className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5">
          <span className="text-sm font-semibold text-fg-strong">{countLabel(lines.length, 'ligne', 'lignes')}</span>
          <span className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(total)}</span>
        </li>
      </ul>
    </div>
  )
  return mobile ? (
    <FullScreenForm title={title} onClose={onClose}>
      {body}
    </FullScreenForm>
  ) : (
    <ListDialog title={title} description={`Exercice ${year}`} size="lg" onClose={onClose}>
      {body}
    </ListDialog>
  )
}
