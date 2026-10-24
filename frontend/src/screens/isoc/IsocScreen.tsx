import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge, Callout } from '@qvanderlinden/ui'
import type { IsocPrepaymentRead, IsocRead, IsocRubric, PaymentMethodRead, ResultRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { DisallowedDetail } from './DisallowedDetail'
import { IsocCards } from './IsocCards'
import { IsocComputation, IsocTiles } from './IsocComputation'
import { IsocConditions } from './IsocConditions'
import { IsocMajoration, IsocPrepayments, usePrepaymentEditor } from './IsocPrepayments'
import type { ComputationRow, LineTarget } from './isocView'

/**
 * The ISOC screen: the estimated corporate tax of the fiscal year, from the result before
 * tax to the balance. A disallowed rubric lists its lines (a purchase opens in its panel,
 * an asset in the register); the three conditions of the reduced rate and the advance
 * payments are typed in place, and the computation reloads after each save.
 */
export function IsocScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const navigate = useNavigate()
  const { current } = useFiscalYear()
  const base = current ? `/fiscal-years/${current.id}` : null
  const isoc = useResource<IsocRead>(base && `${base}/isoc`)
  const prepayments = useResource<IsocPrepaymentRead[]>(base && `${base}/isoc-prepayments`)
  // Only to find the ids behind the references of the disallowed lines.
  const result = useResource<ResultRead>(base && `${base}/result`)
  const methods = useResource<PaymentMethodRead[]>('/payment-methods')
  const [rubric, setRubric] = useState<IsocRubric | null>(null)
  const [purchase, setPurchase] = useState<number | null>(null)

  const reloadIsoc = isoc.reload
  const editor = usePrepaymentEditor(
    (row) => prepayments.setData((rows) => rows.map((r) => (r.id === row.id ? row : r))),
    reloadIsoc,
  )

  const error = isoc.error ?? prepayments.error
  if (error) {
    return (
      <Callout tone="negative" title="L’ISOC n’a pas pu être chargé.">
        {messageOf(error)}
      </Callout>
    )
  }
  if (!isoc.data || !prepayments.data || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const data = isoc.data
  const year = current.end_date.slice(0, 4)
  const rows = [...prepayments.data].sort((a, b) => a.number - b.number)

  function open(row: ComputationRow) {
    if (row.result) navigate('/resultat')
    else if (row.rubric) setRubric(row.rubric)
  }

  function openLine(target: LineTarget) {
    if (target.kind === 'asset') navigate(`/immobilisations?asset=${target.id}`)
    else setPurchase(target.id)
  }

  // Once the panel's last save or its delete has been answered, not as it closes.
  const reload = () => {
    void isoc.reload()
    void result.reload()
  }

  const computation = { isoc: data, onOpen: open }
  const conditions = <IsocConditions isoc={data} yearId={current.id} onSaved={reloadIsoc} />
  const va = <IsocPrepayments rows={rows} isoc={data} methods={methods.data ?? []} editor={editor} mobile={mobile} />
  const majoration = <IsocMajoration isoc={data} mobile={mobile} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-3">
          <h1 className="type-title text-4xl text-fg-strong">ISOC</h1>
          <Badge tone="info">estimation</Badge>
        </span>
        <span className="text-sm text-fg-muted">
          Impôt des sociétés de l’exercice {year} · exercice d’imposition {data.assessment_year} · estimé à partir du résultat
        </span>
      </div>

      {data.parameters_fallback ? (
        <Callout tone="warning" title={`Paramètres ${data.assessment_year} inconnus`}>
          Les taux, bonifications et seuils de l’exercice d’imposition {data.assessment_year} ne sont pas encore connus :
          l’estimation reprend ceux du dernier exercice d’imposition connu.
        </Callout>
      ) : null}

      <IsocTiles isoc={data} mobile={mobile} />

      {mobile ? (
        <>
          <IsocCards {...computation} />
          {conditions}
          {va}
          {majoration}
        </>
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <IsocComputation {...computation} />
            <div className="flex flex-col gap-6">
              {conditions}
              {majoration}
            </div>
          </div>
          {va}
        </>
      )}

      {rubric && purchase === null ? (
        <DisallowedDetail
          rubric={rubric}
          isoc={data}
          result={result.data}
          year={year}
          mobile={mobile}
          onOpen={openLine}
          onClose={() => setRubric(null)}
        />
      ) : null}
      {purchase !== null ? <PurchasePanel id={purchase} onClose={() => setPurchase(null)} onSettled={reload} /> : null}
    </div>
  )
}
