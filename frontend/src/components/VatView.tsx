import { useEffect, useState } from 'react'
import {
  Button,
  Callout,
  Card,
  DataTable,
  Segment,
  Select,
  StatCard,
  Tag,
  type DataTableColumn,
} from '@qvanderlinden/ui'
import { fetchVat } from '../api/client'
import type { AccountRead, AccountVat, VatFlow } from '../api/types'
import { RELOAD_LEAD, frameError } from '../errors'
import { eur, formatDate, formatRate } from '../format'
import { netDueTone, visibleVatFlows } from '../reportFigures'
import { PageHeader } from './PageHeader'

interface VatViewProps {
  account: AccountRead
}

const now = new Date()
const CURRENT_YEAR = now.getFullYear()
const CURRENT_QUARTER = Math.floor(now.getMonth() / 3) + 1
// Next year, this year, and six years back.
const YEARS = Array.from({ length: 8 }, (_, i) => String(CURRENT_YEAR + 1 - i))
const QUARTER_OPTIONS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `T${q}` }))

function vatCell(value: string) {
  return Number(value) !== 0 ? eur(value) : <span className="text-fg-subtle">—</span>
}

export function VatView({ account }: VatViewProps) {
  const [vat, setVat] = useState<AccountVat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [quarter, setQuarter] = useState(String(CURRENT_QUARTER))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setVat(null)
    setError(null)
    fetchVat(account.id, Number(year))
      .then((fetched) => {
        if (!cancelled) setVat(fetched)
      })
      .catch((err) => {
        if (!cancelled) setError(frameError(err, { client: RELOAD_LEAD }))
      })
    return () => {
      cancelled = true
    }
  }, [account.id, year, reloadKey])

  const selected = vat?.quarters.find((q) => q.quarter === Number(quarter)) ?? null
  const visibleFlows = selected ? visibleVatFlows(selected.flows) : []

  const columns: DataTableColumn<VatFlow>[] = [
    {
      key: 'name',
      header: 'flux',
      render: (_, f) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg-strong">{f.name}</span>
            {f.reverse_charge && <Tag>autoliquidation</Tag>}
          </span>
          <span className="type-body-sm text-fg-muted">
            <span className="numeric">{eur(f.gross_vat)}</span> de TVA
            {f.vat_rate != null ? (
              <>
                {' '}
                à <span className="numeric">{formatRate(f.vat_rate)}</span>
              </>
            ) : (
              ', taux mixtes'
            )}
            {f.kind === 'expense' && (
              <>
                {' · '}
                <span className="numeric">{formatRate(f.deduction_rate)}</span> déductible
              </>
            )}
          </span>
        </div>
      ),
    },
    {
      key: 'invoice_date',
      header: 'date',
      render: (_, f) => <span className="numeric whitespace-nowrap text-fg-muted">{formatDate(f.invoice_date)}</span>,
    },
    { key: 'output_vat', header: 'collectée', numeric: true, render: (_, f) => vatCell(f.output_vat) },
    { key: 'deductible_vat', header: 'déductible', numeric: true, render: (_, f) => vatCell(f.deductible_vat) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="TVA"
        actions={
          <>
            <Select
              size="sm"
              aria-label="Année"
              className="w-28"
              value={year}
              onValueChange={setYear}
              options={YEARS}
            />
            <Segment aria-label="Trimestre" options={QUARTER_OPTIONS} value={quarter} onChange={setQuarter} />
          </>
        }
      />

      {error && (
        <Callout tone="negative" title="La TVA n’a pas pu être chargée.">
          {error}{' '}
          <Button type="button" variant="link" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </Callout>
      )}

      {!vat && !error && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {vat && selected && (
        <>
          {!vat.vat_applicable && (
            <Callout tone="warning">Ce compte n’est pas assujetti à la TVA — montants indicatifs.</Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="TVA collectée" value={Number(selected.output_vat)} format="eur" />
            <StatCard label="TVA déductible" value={Number(selected.deductible_vat)} format="eur" />
            <StatCard
              label="TVA nette à payer"
              value={<span className={netDueTone(selected.net_due)}>{eur(selected.net_due)}</span>}
              footnote={Number(selected.net_due) < 0 ? 'Crédit de TVA' : undefined}
            />
          </div>

          <Card title={`Flux du T${selected.quarter} ${vat.year}`} padding={false}>
            <DataTable
              columns={columns}
              rows={visibleFlows}
              emptyMessage="Aucun flux avec de la TVA ce trimestre."
            />
          </Card>
        </>
      )}
    </div>
  )
}
