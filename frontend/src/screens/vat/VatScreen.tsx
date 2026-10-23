import { useState } from 'react'
import { Callout, Select, Tabs } from '@qvanderlinden/ui'
import type { VatPeriodRead, VatPeriodsRead, VatPieceRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { SalePanel } from '../sales/SalesForm'
import { VatCards } from './VatCards'
import { VatPeriodView } from './VatPeriodView'
import { defaultPeriod, periodLabel } from './vatView'

/**
 * The TVA screen: one tab per period of the fiscal year (quarters or months, from the company's
 * regime) with its summary, its filing date typed in place and its pieces; a piece opens its
 * panel and the periods reload when it closes. A franchise or VAT-free company has no return.
 */
export function VatScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { current } = useFiscalYear()
  const vat = useResource<VatPeriodsRead>(current ? `/fiscal-years/${current.id}/vat-periods` : null)
  const [picked, setPicked] = useState<number | null>(null)
  const [open, setOpen] = useState<VatPieceRead | null>(null)

  if (vat.error) {
    return (
      <Callout tone="negative" title="La TVA n’a pas pu être chargée.">
        {messageOf(vat.error)}
      </Callout>
    )
  }
  if (!vat.data || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const { regime, periods } = vat.data
  const noReturn = regime === 'franchise' || regime === 'none'
  const period = periods.find((p) => p.id === picked) ?? defaultPeriod(periods)

  function saved(next: VatPeriodRead) {
    vat.setData((d) => ({ ...d, periods: d.periods.map((p) => (p.id === next.id ? next : p)) }))
  }

  function closePiece() {
    setOpen(null)
    void vat.reload()
  }

  const view = { onSaved: saved, onOpen: setOpen }
  const options = periods.map((p) => ({ value: String(p.id), label: periodLabel(p, regime) }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-title text-4xl text-fg-strong">TVA</h1>
        <span className="text-sm text-fg-muted">
          {regime === 'monthly' ? 'Déclarations mensuelles' : 'Déclarations trimestrielles'} · exercice {current.end_date.slice(0, 4)} · les
          montants viennent des ventes et des achats
        </span>
      </div>

      {noReturn ? (
        <Callout tone="info" title={regime === 'franchise' ? 'Franchise de TVA' : 'Pas de TVA'}>
          {regime === 'franchise'
            ? 'La société est en franchise de TVA : elle ne dépose aucune déclaration.'
            : 'La société n’est pas assujettie à la TVA : il n’y a aucune déclaration à déposer.'}{' '}
          Le régime se règle dans « Structure société ».
        </Callout>
      ) : period ? (
        <>
          {mobile ? (
            <Select
              size="md"
              aria-label="Période"
              className="w-full min-w-0"
              options={options}
              value={String(period.id)}
              onValueChange={(v) => setPicked(Number(v))}
            />
          ) : (
            <Tabs tabs={options} value={String(period.id)} onChange={(v) => setPicked(Number(v))} />
          )}
          {mobile ? <VatCards period={period} {...view} /> : <VatPeriodView period={period} {...view} />}
        </>
      ) : (
        <Callout tone="info" title="Aucune période">
          Aucune période de TVA ne couvre cet exercice.
        </Callout>
      )}

      {open?.kind === 'sale' ? <SalePanel id={open.piece_id} onClose={closePiece} /> : null}
      {open?.kind === 'purchase' ? <PurchasePanel id={open.piece_id} onClose={closePiece} /> : null}
    </div>
  )
}
