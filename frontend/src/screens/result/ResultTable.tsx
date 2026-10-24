import { PanelRightOpen } from 'lucide-react'
import { Badge, Card, StatCard } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { ResultRead } from '../../api/types'
import { eur } from '../../format'
import { resultClosing, resultSections, shareOfRevenue, spendingTotal, type ResultRow } from './resultView'

export interface ResultListProps {
  result: ResultRead
  year: string
  onOpen(row: ResultRow): void
  /** Follows a closing row's link (the estimated tax opens the ISOC screen). */
  onNavigate(to: string): void
}

/** The four tiles over the result: revenue, charges and depreciation, result before and after tax. */
export function ResultTiles({ result }: { result: ResultRead }) {
  const share = (amount: string) => {
    const s = shareOfRevenue(amount, result.revenue.total)
    return s ? `${s} des recettes` : undefined
  }
  const spending = spendingTotal(result)
  const margin = shareOfRevenue(result.result, result.revenue.total)
  // One tile per row on a phone, the result after tax first (`MobileResultat` artboard).
  return (
    <div className="grid grid-cols-1 gap-3 *:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="recettes" value={Number(result.revenue.total)} format="eur" footnote="HTVA des ventes" />
      <StatCard label="dépenses et amortissements" value={Number(spending)} format="eur" footnote={share(spending)} />
      <StatCard
        label="résultat avant impôt"
        value={Number(result.result)}
        format="eur"
        footnote={margin ? `marge de ${margin}` : undefined}
      />
      <StatCard
        className="max-sm:order-first"
        label="résultat de l’exercice"
        value={Number(result.after_tax)}
        format="eur"
        footnote={`après ${eur(result.estimated_tax)} d’ISOC estimé`}
      />
    </div>
  )
}

export function ResultHeader({ year }: { year: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-4xl text-fg-strong">Résultat de l’exercice</h1>
        <Badge tone="info">projection</Badge>
      </span>
      <span className="text-sm text-fg-muted">
        Recettes moins dépenses, amortissements et impôt des sociétés estimé · exercice {year}
      </span>
    </div>
  )
}

export const RESULT_NOTE =
  'Chaque pièce compte à sa date de comptabilisation, payée ou non. Une immobilisation compte par son amortissement de l’exercice, pas par son achat. L’impôt des sociétés estimé, majoration comprise, est détaillé sur l’écran ISOC.'

/**
 * The desktop result (`Resultat` artboard): the tiles, then the income statement by section.
 * A category row opens its pieces, an asset row the asset.
 */
export function ResultTable({ result, onOpen, onNavigate }: ResultListProps) {
  return (
    <div className="flex flex-col gap-6">
      <ResultTiles result={result} />
      <Card title="Compte de résultat" subtitle="Selon les factures, payées ou non" padding={false}>
        <Table className="min-w-160">
          <TableHeader>
            <TableRow>
              <TableHead>Rubrique</TableHead>
              <TableHead className="w-40">Pièces</TableHead>
              <TableHead className="w-36 text-right">Montant</TableHead>
              <TableHead className="w-28 text-right">% recettes</TableHead>
            </TableRow>
          </TableHeader>
          {resultSections(result).map((section) => (
            <TableBody key={section.group}>
              <TableRow>
                <TableCell colSpan={4} className="bg-surface-sunken font-mono text-2xs tracking-wide text-fg-muted uppercase">
                  {section.title}
                </TableCell>
              </TableRow>
              {section.rows.map((row) => (
                <TableRow key={row.key} className="hover:bg-surface-hover">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpen(row)}
                      className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                    >
                      {row.label}
                      <PanelRightOpen className="size-3.5 text-fg-muted" aria-hidden />
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-fg-muted">{row.count}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{eur(row.amount)}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap text-fg-muted">
                    {shareOfRevenue(row.amount, result.revenue.total) ?? ''}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="text-sm font-semibold text-fg-strong">
                  {section.totalLabel}
                </TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(section.total)}</TableCell>
                <TableCell className="numeric text-right whitespace-nowrap text-fg-muted">
                  {shareOfRevenue(section.total, result.revenue.total) ?? ''}
                </TableCell>
              </TableRow>
            </TableBody>
          ))}
          <TableFooter>
            {resultClosing(result).map((row) => (
              <TableRow key={row.key}>
                <TableCell colSpan={2} className={row.total ? 'text-sm font-semibold text-fg-strong' : 'text-sm'}>
                  {row.to ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(row.to!)}
                      className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                    >
                      {row.label}
                      <PanelRightOpen className="size-3.5 text-fg-muted" aria-hidden />
                    </button>
                  ) : (
                    row.label
                  )}
                </TableCell>
                <TableCell
                  className={`numeric text-right whitespace-nowrap ${row.total ? 'font-semibold text-fg-strong' : ''}`}
                >
                  {eur(row.amount)}
                </TableCell>
                <TableCell className="numeric text-right whitespace-nowrap text-fg-muted">
                  {shareOfRevenue(row.amount, result.revenue.total) ?? ''}
                </TableCell>
              </TableRow>
            ))}
          </TableFooter>
        </Table>
      </Card>
      <p className="m-0 text-xs text-fg-muted">{RESULT_NOTE}</p>
    </div>
  )
}
