import { useRef, useState } from 'react'
import { Badge, Callout, Checkbox, Field, Input } from '@qvanderlinden/ui'
import type { VatSchemeRead } from '../../api/types'
import { countLabel, eur, formatRate, parseRequiredRate, rateInput } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import { InfoLabel } from '../../lists/InfoLabel'
import { usesLabel } from '../../lists/inUse'
import type { SaveResult } from '../../lists/useEditSession'
import { vatExample } from '../../schemeExamples'
import { sensText, sensTone } from './vatSchemesList'

/**
 * The values the form edits: the name as typed, the sides, the rate and the recoverable
 * share as API decimals (the recoverable share is null on a sales-only scheme).
 */
export interface VatFields {
  label: string
  forSales: boolean
  forPurchases: boolean
  rate: string
  recoverable: string | null
}

/** What a new scheme starts as: a purchase scheme at 21 %, fully recoverable. */
export const VAT_DEFAULTS: VatFields = { label: '', forSales: false, forPurchases: true, rate: '21', recoverable: '100' }

const PERCENT_ERROR = 'Un pourcentage entre 0 et 100'

/**
 * The fields of a VAT scheme, shared by the desktop dialog and the mobile full-screen
 * form (`RegimeTvaEdition` and `MobileRegimeTvaForm` artboards). Each field saves itself;
 * when a save fails (the session toasts it) the field goes back to the value the server
 * last confirmed, unless it was changed again since. A rate is sent only once it reads
 * as a percentage; one side at least stays ticked, and the recoverable share exists only
 * on the purchase side.
 */
export function VatSchemesForm({
  row,
  isNew,
  mobile,
  onSave,
}: {
  /** The saved scheme; undefined while a new one has no name yet, so does not exist. */
  row: VatSchemeRead | undefined
  isNew: boolean
  mobile: boolean
  onSave(patch: Partial<VatFields>): Promise<SaveResult<VatFields>>
}) {
  const start: VatFields = row
    ? {
        label: row.label,
        forSales: row.for_sales,
        forPurchases: row.for_purchases,
        rate: row.rate,
        recoverable: row.recoverable_rate,
      }
    : VAT_DEFAULTS
  const [label, setLabel] = useState(start.label)
  const [labelTyped, setLabelTyped] = useState(false)
  const [sales, setSales] = useState(start.forSales)
  const [purchases, setPurchases] = useState(start.forPurchases)
  const [rate, setRate] = useState(rateInput(start.rate))
  const [rec, setRec] = useState(start.recoverable === null ? '' : rateInput(start.recoverable))
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ label, sales, purchases, rate, rec })

  const labelSaver = useAutosave(async (value) => {
    const result = await onSave({ label: value })
    if (!result.ok && typed.current.label === value) {
      typed.current.label = result.server.label
      setLabel(result.server.label)
    }
  })

  const rateSaver = useAutosave(async (value) => {
    const parsed = parseRequiredRate(value)
    if (parsed === null) return
    const result = await onSave({ rate: parsed })
    if (!result.ok && typed.current.rate === value) {
      typed.current.rate = rateInput(result.server.rate)
      setRate(typed.current.rate)
    }
  })

  const recSaver = useAutosave(async (value) => {
    const parsed = parseRequiredRate(value)
    if (parsed === null || !typed.current.purchases) return
    const result = await onSave({ recoverable: parsed })
    if (!result.ok && typed.current.rec === value) {
      typed.current.rec = result.server.recoverable === null ? '' : rateInput(result.server.recoverable)
      setRec(typed.current.rec)
    }
  })

  async function pickSides(nextSales: boolean, nextPurchases: boolean) {
    // One side at least stays ticked.
    if (!nextSales && !nextPurchases) return
    // The recoverable share goes with the purchase side: cleared when it leaves, back at what
    // was typed (100 % when that is no rate) when it returns.
    const back = parseRequiredRate(typed.current.rec) ?? '100'
    const recoverable = nextPurchases ? back : null
    typed.current.sales = nextSales
    typed.current.purchases = nextPurchases
    typed.current.rec = recoverable === null ? '' : rateInput(recoverable)
    setSales(nextSales)
    setPurchases(nextPurchases)
    setRec(typed.current.rec)
    const result = await onSave({ forSales: nextSales, forPurchases: nextPurchases, recoverable })
    if (!result.ok && typed.current.sales === nextSales && typed.current.purchases === nextPurchases) {
      const s = result.server
      typed.current.sales = s.forSales
      typed.current.purchases = s.forPurchases
      typed.current.rec = s.recoverable === null ? '' : rateInput(s.recoverable)
      setSales(s.forSales)
      setPurchases(s.forPurchases)
      setRec(typed.current.rec)
    }
  }

  const parsedRate = parseRequiredRate(rate)
  const parsedRec = parseRequiredRate(rec)
  const labelError =
    labelTyped && label.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : un régime sans nom n’est pas gardé.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const rateError = parsedRate === null ? (rate.trim() === '' ? 'Obligatoire' : PERCENT_ERROR) : undefined
  const recError = parsedRec === null ? (rec.trim() === '' ? 'Obligatoire' : PERCENT_ERROR) : undefined
  const uses = row?.uses ?? 0
  const sides = { for_sales: sales, for_purchases: purchases }

  const example = parsedRate === null ? [] : vatExample({ rate: parsedRate, recoverable_rate: parsedRec ?? '0', ...sides })
  const lead = 'Pour une ligne de €100 HTVA'

  const nameField = (
    <Field label="Libellé" error={labelError}>
      <Input
        placeholder="Achats 21 % · récupérable"
        value={label}
        onChange={(e) => {
          typed.current.label = e.target.value
          setLabel(e.target.value)
          setLabelTyped(true)
          labelSaver.onChange(e.target.value)
        }}
        onBlur={labelSaver.onBlur}
      />
    </Field>
  )

  const sensField = (
    <Field label="Sens">
      <div role="group" aria-label="Sens" className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox label="Ventes" checked={sales} onCheckedChange={(c) => void pickSides(c === true, purchases)} />
        <Checkbox label="Achats" checked={purchases} onCheckedChange={(c) => void pickSides(sales, c === true)} />
      </div>
    </Field>
  )

  const rateField = (
    <Field label={<InfoLabel info="La TVA d’une ligne : le montant HTVA fois le taux">Taux</InfoLabel>} error={rateError}>
      <Input
        numeric
        suffix="%"
        invalid={rateError !== undefined}
        value={rate}
        onChange={(e) => {
          typed.current.rate = e.target.value
          setRate(e.target.value)
          rateSaver.onChange(e.target.value)
        }}
        onBlur={rateSaver.onBlur}
      />
    </Field>
  )

  const recField = purchases ? (
    <Field
      label={<InfoLabel info="Ce que la déclaration déduit ; le reste est une charge">Part récupérable</InfoLabel>}
      error={recError}
    >
      <Input
        numeric
        suffix="%"
        invalid={recError !== undefined}
        value={rec}
        onChange={(e) => {
          typed.current.rec = e.target.value
          setRec(e.target.value)
          recSaver.onChange(e.target.value)
        }}
        onBlur={recSaver.onBlur}
      />
    </Field>
  ) : null

  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Porté par ${countLabel(uses, 'pièce', 'pièces')}`}>
        Il ne peut pas être supprimé tant que des pièces le portent. Changer son taux ou sa part récupérable recalcule leurs
        lignes et la déclaration du trimestre.
      </Callout>
    ) : null

  if (!mobile) {
    return (
      <>
        {nameField}
        {sensField}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {rateField}
          {recField}
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken px-4 py-3.5">
          <span className="type-eyebrow text-fg-muted">{lead}</span>
          {example.length === 0 ? <span className="text-sm text-fg-muted">saisissez un taux</span> : null}
          {example.map((e) => (
            <div key={e.side} className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] gap-x-3 text-sm">
              <span className="font-medium text-fg-strong">{e.side === 'sale' ? 'Vente' : 'Achat'}</span>
              <span className="numeric">TVA {eur(e.vat)}</span>
              <span className="numeric">
                {e.side === 'sale' ? 'facturé' : 'récupérée'} {eur(e.second)}
              </span>
              <span className="numeric">
                {e.side === 'sale' ? 'recette' : 'charge'} {eur(e.third)}
              </span>
            </div>
          ))}
        </div>
        {inUse}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-eyebrow text-fg-muted">taux</span>
          <span className="numeric text-md text-fg-strong">{parsedRate === null ? '—' : formatRate(parsedRate)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={sensTone(sides)}>{sensText(sides)}</Badge>
          <span className="numeric text-sm text-fg-muted">{usesLabel(uses)}</span>
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">régime</span>
        {nameField}
        {sensField}
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">tva</span>
        <div className="flex flex-col gap-1.5">
          {rateField}
          <span className="text-xs text-fg-muted">La TVA d’une ligne : le montant HTVA fois le taux</span>
        </div>
        {recField ? (
          <div className="flex flex-col gap-1.5">
            {recField}
            <span className="text-xs text-fg-muted">Ce que la déclaration déduit ; le reste est une charge</span>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">
        <span className="type-eyebrow text-fg-muted">exemple</span>
        <div className="flex flex-col gap-3 rounded-lg bg-surface-sunken px-4 py-3.5">
          <span className="text-sm text-fg-muted">{lead}</span>
          {example.length === 0 ? <span className="text-sm text-fg-muted">saisissez un taux</span> : null}
          {example.map((e) => (
            <div key={e.side} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-fg-strong">{e.side === 'sale' ? 'Vente' : 'Achat'}</span>
              <div className="flex justify-between">
                <span>TVA</span>
                <span className="numeric">{eur(e.vat)}</span>
              </div>
              <div className="flex justify-between">
                <span>{e.side === 'sale' ? 'facturé' : 'récupérée'}</span>
                <span className="numeric">{eur(e.second)}</span>
              </div>
              <div className="flex justify-between">
                <span>{e.side === 'sale' ? 'recette' : 'charge'}</span>
                <span className="numeric">{eur(e.third)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      {inUse}
    </>
  )
}
