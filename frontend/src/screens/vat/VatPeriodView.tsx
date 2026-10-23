import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { Badge, Card, EmptyState, Field, Input, Select, StatCard, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { api } from '../../api/client'
import type { VatPeriodRead, VatPieceRead } from '../../api/types'
import { messageOf } from '../../errors'
import { countLabel, eur, formatDate } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import { PIECE_FILTERS, STATUS_WORDS, filterPieces, periodMonths, type PieceFilter } from './vatView'

export interface VatViewProps {
  period: VatPeriodRead
  /** The period as the server saved it (after the filing date changed). */
  onSaved(period: VatPeriodRead): void
  onOpen(piece: VatPieceRead): void
}

const cents = (value: string) => Math.round(Number(value) * 100)

/** The balance as the summary words it: to pay, or to recover (unsigned). */
export function balanceOf(period: VatPeriodRead) {
  const toRecover = cents(period.balance) < 0
  return { label: toRecover ? 'Solde à récupérer' : 'Solde à payer', amount: period.balance.replace('-', '') }
}

const STATUS_TONE = { current: 'warning', to_file: 'warning', filed: 'info' } as const

export function StatusBadge({ period }: { period: VatPeriodRead }) {
  return <Badge tone={STATUS_TONE[period.status]}>{STATUS_WORDS[period.status]}</Badge>
}

/** The four tiles over a period: VAT due, VAT recovered, balance, due date. */
export function VatTiles({ period }: { period: VatPeriodRead }) {
  const sales = period.pieces.filter((p) => p.kind === 'sale').length
  const purchases = period.pieces.length - sales
  const balance = balanceOf(period)
  return (
    <div className="grid grid-cols-2 gap-3 *:min-w-0 lg:grid-cols-4">
      <StatCard label="tva due" value={Number(period.sales_vat)} format="eur" footnote={`${countLabel(sales, 'vente', 'ventes')} · ${eur(period.sales_net)} HTVA`} />
      <StatCard
        label="tva récupérée"
        value={Number(period.purchases_vat_recovered)}
        format="eur"
        footnote={`${countLabel(purchases, 'achat', 'achats')} · ${eur(period.purchases_net)} HTVA`}
      />
      <StatCard label={balance.label.slice(6)} value={Number(balance.amount)} format="eur" footnote={periodMonths(period)} />
      <StatCard
        label="échéance"
        className="min-w-0"
        value={<span className="max-sm:text-lg">{formatDate(period.due, 'full')}</span>}
        footnote="dépôt et paiement"
      />
    </div>
  )
}

/** The summary of a period: sales and purchases bases and VAT, then the balance. */
export function VatSummary({ period }: { period: VatPeriodRead }) {
  const balance = balanceOf(period)
  const rows: [string, string][] = [
    ['Chiffre d’affaires HTVA', period.sales_net],
    ['TVA due', period.sales_vat],
    ['Achats HTVA', period.purchases_net],
    ['TVA récupérée', period.purchases_vat_recovered],
  ]
  return (
    <Card title={`TVA · ${periodMonths(period)}`} subtitle="Ventes et achats de la période, selon leur date de comptabilisation" padding={false}>
      <Table>
        <TableBody>
          {rows.map(([label, amount]) => (
            <TableRow key={label}>
              <TableCell className="text-sm text-fg-default">{label}</TableCell>
              <TableCell className="numeric text-right whitespace-nowrap">{eur(amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="text-sm font-semibold text-fg-strong">{balance.label}</TableCell>
            <TableCell className="numeric text-right font-semibold whitespace-nowrap text-fg-strong">{eur(balance.amount)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  )
}

/** The filing date, typed in place: saved when the field is left; blank clears it. */
export function FilingDate({ period, onSaved }: Pick<VatViewProps, 'period' | 'onSaved'>) {
  const [text, setText] = useState(period.filed_on ?? '')
  const saver = useAutosave(async (value) => {
    if (value === (period.filed_on ?? '')) return
    try {
      onSaved(await api.patch<VatPeriodRead>(`/vat-periods/${period.id}`, { filed_on: value || null }))
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
      setText(period.filed_on ?? '')
    }
  }, null)
  return (
    <Field label="Déposée le" hint={`À déposer avant le ${formatDate(period.due, 'full')}`}>
      <Input
        type="date"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          saver.onChange(e.target.value)
        }}
        onBlur={saver.onBlur}
      />
    </Field>
  )
}

export function PieceFilterSelect({ value, onChange, size, className }: { value: PieceFilter; onChange(v: PieceFilter): void; size: 'sm' | 'md'; className?: string }) {
  return (
    <Select
      size={size}
      aria-label="Pièces affichées"
      className={className}
      options={PIECE_FILTERS}
      value={value}
      onValueChange={(v) => onChange(v as PieceFilter)}
    />
  )
}

/** The totals of the pieces shown: VAT due of the sales, VAT recovered of the purchases. */
export function pieceTotals(pieces: VatPieceRead[]) {
  const sum = (pick: (p: VatPieceRead) => string) => pieces.reduce((t, p) => t + cents(pick(p)), 0) / 100
  return {
    due: sum((p) => (p.kind === 'sale' ? p.vat : '0')),
    recovered: sum((p) => (p.kind === 'purchase' ? p.recovered : '0')),
  }
}

/** The desktop view of one period (`Tva` artboard): tiles, summary and filing date, the pieces. */
export function VatPeriodView({ period, onSaved, onOpen }: VatViewProps) {
  const [filter, setFilter] = useState<PieceFilter>('all')
  const shown = filterPieces(period.pieces, filter)
  const totals = pieceTotals(shown)

  return (
    <div className="flex flex-col gap-6">
      <VatTiles period={period} />
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <VatSummary period={period} />
        <Card title="Déclaration" subtitle={<StatusBadge period={period} />}>
          <FilingDate key={`${period.id}-${period.filed_on}`} period={period} onSaved={onSaved} />
        </Card>
      </div>
      <Card title={`Pièces · ${periodMonths(period)}`} subtitle="Cliquez une pièce pour l’ouvrir" padding={false}>
        <div className="px-4 pb-3">
          <PieceFilterSelect size="sm" className="w-40" value={filter} onChange={setFilter} />
        </div>
        <Table className="min-w-200">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Pièce</TableHead>
              <TableHead>Client / fournisseur</TableHead>
              <TableHead className="w-32 text-right">HTVA</TableHead>
              <TableHead className="w-32 text-right">TVA due</TableHead>
              <TableHead className="w-36 text-right">TVA récupérée</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={`${p.kind}-${p.piece_id}`} className="hover:bg-surface-hover">
                <TableCell className="numeric text-sm whitespace-nowrap text-fg-muted">{formatDate(p.date, 'full')}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpen(p)}
                    className="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                  >
                    {p.number}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-fg-default">{p.third_party ?? ''}</TableCell>
                <TableCell className="numeric text-right whitespace-nowrap">{eur(p.net)}</TableCell>
                <TableCell className="numeric text-right whitespace-nowrap">{p.kind === 'sale' ? eur(p.vat) : ''}</TableCell>
                <TableCell className="numeric text-right whitespace-nowrap">{p.kind === 'purchase' ? eur(p.recovered) : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {shown.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-sm font-semibold text-fg-strong">
                  Total · {countLabel(shown.length, 'pièce', 'pièces')}
                </TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap">{eur(totals.due)}</TableCell>
                <TableCell className="numeric text-right font-semibold whitespace-nowrap">{eur(totals.recovered)}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
        {shown.length === 0 ? <EmptyState icon={Receipt} title="Aucune pièce" /> : null}
      </Card>
    </div>
  )
}
