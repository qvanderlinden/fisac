import { RotateCcw } from 'lucide-react'
import { Badge, Button, Callout, Input } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { FixedAssetRead } from '../../api/types'
import { amountInput, eur, isBadAmount, parseDecimal } from '../../format'
import { useSavedText } from '../../pieces/useSavedField'
import { scheduleSummary, type ScheduleLine } from './fixedAssetsList'

/**
 * The amount of one year: typed freely, sent when the field loses focus (not on every
 * keystroke), and only when it differs from what the server holds.
 */
function YearInput({
  line,
  onType,
}: {
  line: ScheduleLine
  onType(year: number, amount: string): Promise<boolean>
}) {
  const field = useSavedText(
    amountInput(line.amount),
    (text) => {
      const value = parseDecimal(text)
      if (value === null || isBadAmount(text)) return Promise.resolve(true)
      if (Number(value) === Number(line.amount)) return Promise.resolve(true)
      return onType(line.year, value)
    },
    { delay: null },
  )
  return <Input size="sm" numeric aria-label={`Amortissement ${line.year}`} invalid={isBadAmount(field.value)} {...field} />
}

/**
 * The schedule of a fixed asset, one row per fiscal year (`Tableau d'amortissement` of the
 * `Immobilisations` artboards): the amount of each year editable, "modifié" on the rows
 * typed, "Recalculer", the total against the value, and the warning when the table does
 * not add up to the value.
 */
export function ScheduleTable({
  asset,
  mobile,
  onType,
  onRecompute,
}: {
  asset: FixedAssetRead
  mobile: boolean
  onType(year: number, amount: string): Promise<boolean>
  onRecompute(): Promise<boolean>
}) {
  const s = scheduleSummary(asset.schedule, asset.value)
  const gap = Math.abs(s.gap)
  const warning = s.balanced ? null : (
    <Callout tone="warning" title="Le tableau ne tombe pas juste">
      Le total amorti, {eur(s.total)}, {s.gap < 0 ? 'dépasse' : 'n’atteint pas'} la valeur d’acquisition de{' '}
      {eur(asset.value)} : un écart de {eur(gap)}.
    </Callout>
  )
  const recompute =
    s.edited > 0 || !s.balanced ? (
      <Button variant="secondary" size="sm" iconLeft={RotateCcw} onClick={() => void onRecompute()}>
        Recalculer
      </Button>
    ) : null
  const heading = (
    <div className="flex items-center justify-between gap-3">
      <span className="type-eyebrow text-fg-muted">tableau d’amortissement</span>
      {recompute}
    </div>
  )

  if (s.rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        <p className="m-0 text-sm text-fg-muted">Le tableau est vide : « Recalculer » le refait avec le modèle choisi.</p>
        <Button variant="secondary" size="sm" iconLeft={RotateCcw} onClick={() => void onRecompute()}>
          Recalculer
        </Button>
      </section>
    )
  }

  if (mobile) {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        {s.rows.map((r) => (
          <div key={r.year} className="flex flex-col gap-2 rounded-lg border border-line-hairline bg-surface-card p-3">
            <div className="flex items-center gap-2">
              <span className="numeric text-sm font-medium text-fg-strong">{r.year}</span>
              {r.edited ? <Badge tone="info">modifié</Badge> : null}
            </div>
            <YearInput line={r} onType={onType} />
            <div className="numeric flex justify-between text-2xs text-fg-muted">
              <span>cumul {eur(r.cumul)}</span>
              <span>résiduelle {eur(r.rest)}</span>
            </div>
          </div>
        ))}
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-fg-strong">Total</span>
          <span className="numeric font-semibold text-fg-strong">{eur(s.total)}</span>
        </div>
        <div className="flex justify-between text-xs text-fg-muted">
          <span>la valeur d’acquisition</span>
          <span className="numeric">{eur(asset.value)}</span>
        </div>
        {warning}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      {heading}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Année</TableHead>
            <TableHead className="w-48">Amortissement</TableHead>
            <TableHead className="text-right">Cumul</TableHead>
            <TableHead className="text-right">Valeur résiduelle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.rows.map((r) => (
            <TableRow key={r.year}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span className="numeric text-sm text-fg-strong">{r.year}</span>
                  {r.edited ? <Badge tone="info">modifié</Badge> : null}
                </span>
              </TableCell>
              <TableCell>
                <YearInput line={r} onType={onType} />
              </TableCell>
              <TableCell className="numeric text-right text-fg-muted">{eur(r.cumul)}</TableCell>
              <TableCell className="numeric text-right">{eur(r.rest)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-fg-strong">Total</TableCell>
            <TableCell className="numeric font-semibold text-fg-strong">{eur(s.total)}</TableCell>
            <TableCell colSpan={2} className="text-right text-xs text-fg-muted">
              la valeur d’acquisition · <span className="numeric">{eur(asset.value)}</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      {warning}
    </section>
  )
}
