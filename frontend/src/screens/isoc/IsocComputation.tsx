import { PanelRightOpen } from 'lucide-react'
import { Card, StatCard } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { IsocRead } from '../../api/types'
import { eur, formatRate } from '../../format'
import { balanceLabel, computationRows, type ComputationRow } from './isocView'

export interface ComputationProps {
  isoc: IsocRead
  /** A clickable row: the result before tax, or a disallowed rubric. */
  onOpen(row: ComputationRow): void
}

export const COMPUTATION_NOTE =
  'Une estimation jusqu’à la fin de l’exercice : le résultat compte chaque pièce à sa date, payée ou non. L’impôt estimé est une dépense du résultat ; un versement anticipé payé le réduit au solde, sans entrer dans le résultat.'

export const isClickable = (row: ComputationRow) => row.result === true || row.rubric !== undefined

/** The tiles over the computation; on mobile stacked (six-figure amounts do not fit two abreast at 390 px): the balance, the tax, the base. */
export function IsocTiles({ isoc, mobile }: { isoc: IsocRead; mobile: boolean }) {
  const label = balanceLabel(isoc.balance)
  const rate = isoc.reduced ? `au taux réduit de ${formatRate(isoc.reduced_rate)}` : `au taux normal de ${formatRate(isoc.normal_rate)}`
  const taxHint = Number(isoc.majoration.amount) > 0 ? `${rate}, majoration comprise` : rate
  const balance = (
    <StatCard
      label={label.toLowerCase()}
      value={Number(isoc.balance)}
      format="eur"
      footnote={label === 'Solde à payer' ? 'dette à l’inventaire' : 'créance à l’inventaire'}
    />
  )
  const base = (
    <StatCard
      label="base imposable"
      value={Number(isoc.taxable_base)}
      format="eur"
      footnote={`dont ${eur(isoc.disallowed.total)} de dépenses non admises`}
    />
  )
  const tax = <StatCard label="impôt estimé" value={Number(isoc.estimated_tax)} format="eur" footnote={taxHint} />
  if (mobile) {
    return (
      <div className="flex flex-col gap-3">
        {balance}
        {tax}
        {base}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 *:min-w-0 lg:grid-cols-4">
      <StatCard label="résultat avant impôt" value={Number(isoc.before_tax)} format="eur" footnote="selon l’écran Résultat" />
      {base}
      {tax}
      {balance}
    </div>
  )
}

/** "Calcul de l’impôt" on desktop (`Isoc` artboard): rubric, how it is computed, amount. */
export function IsocComputation({ isoc, onOpen }: ComputationProps) {
  return (
    <Card title="Calcul de l’impôt" subtitle="Du résultat avant impôt au solde à payer" padding={false}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rubrique</TableHead>
            <TableHead>Calcul</TableHead>
            <TableHead className="w-36 text-right">Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {computationRows(isoc).map((row) => (
            <TableRow key={row.key} className={row.total ? 'bg-surface-sunken' : isClickable(row) ? 'hover:bg-surface-hover' : undefined}>
              <TableCell className={row.total ? 'text-sm font-semibold text-fg-strong' : 'text-sm text-fg-default'}>
                {isClickable(row) ? (
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    aria-label={`Voir le détail de ${row.label}`}
                    className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                  >
                    {row.label}
                    <PanelRightOpen className="size-3.5 text-fg-muted" aria-hidden />
                  </button>
                ) : (
                  row.label
                )}
              </TableCell>
              <TableCell className="font-mono text-2xs text-fg-muted">{row.meta}</TableCell>
              <TableCell
                className={`numeric text-right whitespace-nowrap ${row.total ? 'font-semibold text-fg-strong' : ''}`}
              >
                {eur(row.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="m-0 border-t border-line-hairline px-4 py-3 text-xs text-fg-muted">{COMPUTATION_NOTE}</p>
    </Card>
  )
}
