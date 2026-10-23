import { useRef, useState } from 'react'
import { Badge, Callout, Field, Input, Select } from '@qvanderlinden/ui'
import type { DepreciationFirstYear, DepreciationMethod, DepreciationModelRead } from '../../api/types'
import { schedule } from '../../depreciation'
import { countLabel, eur, formatNumber } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import { InfoLabel } from '../../lists/InfoLabel'
import type { SaveResult } from '../../lists/useEditSession'
import { FIRST_YEAR_OPTIONS, METHOD_LABELS, METHOD_OPTIONS, FIRST_YEAR_LABELS, durationLabel } from './depreciationModelsList'

/** The values the form edits: the name as typed, the years as typed, the method, the first year. */
export interface ModelFields {
  label: string
  years: string
  method: DepreciationMethod
  firstYear: DepreciationFirstYear
}

/** What a new model starts as: five years, linear, prorated. */
export const MODEL_DEFAULTS: ModelFields = { label: '', years: '5', method: 'linear', firstYear: 'prorata' }

/** The years as typed: a whole number from 1 to 50, or null. */
export function parseYears(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}

/** The rate with up to two decimals, comma decimal: `100 / 3` → `33,33`. */
function percent(value: number): string {
  return formatNumber(Math.round(value * 100) / 100, { decimals: 2 }).replace(/,?0+$/, '')
}

/**
 * The fields of a depreciation model, shared by the desktop dialog and the mobile
 * full-screen form (`ModeleAmortissementEdition` and `MobileModeleAmortissementForm`
 * artboards), with the €1 000 example the schedule gives. Each field saves itself; when a
 * save fails (the session toasts it) the field goes back to the value the server last
 * confirmed, unless it was changed again since. A duration is sent only once it reads as
 * a whole number of years from 1 to 50.
 */
export function DepreciationModelsForm({
  row,
  isNew,
  mobile,
  year,
  onSave,
}: {
  /** The saved model; undefined while a new one has no name yet, so does not exist. */
  row: DepreciationModelRead | undefined
  isNew: boolean
  mobile: boolean
  /** The year the example asset is bought in (1 July). */
  year: number
  onSave(patch: Partial<ModelFields>): Promise<SaveResult<ModelFields>>
}) {
  const [label, setLabel] = useState(row?.label ?? MODEL_DEFAULTS.label)
  const [labelTyped, setLabelTyped] = useState(false)
  const [years, setYears] = useState(String(row?.years ?? MODEL_DEFAULTS.years))
  const [method, setMethod] = useState<DepreciationMethod>(row?.method ?? MODEL_DEFAULTS.method)
  const [firstYear, setFirstYear] = useState<DepreciationFirstYear>(row?.first_year ?? MODEL_DEFAULTS.firstYear)
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ label, years, method, firstYear })

  const labelSaver = useAutosave(async (value) => {
    const result = await onSave({ label: value })
    if (!result.ok && typed.current.label === value) {
      typed.current.label = result.server.label
      setLabel(result.server.label)
    }
  })

  const yearsSaver = useAutosave(async (value) => {
    if (parseYears(value) === null) return
    const result = await onSave({ years: value.trim() })
    if (!result.ok && typed.current.years === value) {
      typed.current.years = result.server.years
      setYears(result.server.years)
    }
  })

  async function pickMethod(value: string) {
    const next = value as DepreciationMethod
    typed.current.method = next
    setMethod(next)
    const result = await onSave({ method: next })
    if (!result.ok && typed.current.method === next) {
      typed.current.method = result.server.method
      setMethod(result.server.method)
    }
  }

  async function pickFirstYear(value: string) {
    const next = value as DepreciationFirstYear
    typed.current.firstYear = next
    setFirstYear(next)
    const result = await onSave({ firstYear: next })
    if (!result.ok && typed.current.firstYear === next) {
      typed.current.firstYear = result.server.firstYear
      setFirstYear(result.server.firstYear)
    }
  }

  const n = parseYears(years)
  const labelError =
    labelTyped && label.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : un modèle sans nom n’est pas gardé.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const yearsError = n === null ? 'Un nombre entier d’années, de 1 à 50' : undefined
  const uses = row?.uses ?? 0
  const rows = n === null ? [] : schedule('1000', `${year}-07-01`, n, method, firstYear)
  const note =
    n === null
      ? 'Saisissez une durée pour voir les amortissements.'
      : `${
          method === 'declining'
            ? `Dégressif : ${percent(200 / n)} % de la valeur restante, puis linéaire dès que c’est plus ; `
            : `Linéaire : ${eur(1000 / n)} par an ; `
        }${firstYear === 'prorata' ? 'la première année compte 184 jours sur 365.' : 'la première année compte entière.'}`

  const nameField = (
    <Field label="Libellé" error={labelError}>
      <Input
        placeholder="Nature du bien · durée"
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

  const yearsField = (
    <Field
      label={
        <InfoLabel info={n === null ? 'Un nombre entier d’années, de 1 à 50' : `Taux linéaire ${percent(100 / n)} % par an`}>
          Durée en années
        </InfoLabel>
      }
      error={yearsError}
    >
      <Input
        numeric
        invalid={yearsError !== undefined}
        value={years}
        onChange={(e) => {
          typed.current.years = e.target.value
          setYears(e.target.value)
          yearsSaver.onChange(e.target.value)
        }}
        onBlur={yearsSaver.onBlur}
      />
    </Field>
  )

  const methodField = (
    <Field label="Méthode">
      <Select options={METHOD_OPTIONS} value={method} onValueChange={(v) => void pickMethod(v)} />
    </Field>
  )

  const firstYearField = (
    <Field label="Première année">
      <Select options={FIRST_YEAR_OPTIONS} value={firstYear} onValueChange={(v) => void pickFirstYear(v)} />
    </Field>
  )

  const table = rows.length ? (
    <div className="flex flex-col">
      <div className="type-eyebrow flex gap-3 border-b border-line-default py-1.5 text-fg-muted">
        <span className="w-14 flex-none">année</span>
        <span className="flex-auto text-right">amortissement</span>
        <span className="flex-auto text-right">valeur résiduelle</span>
      </div>
      {rows.map((r) => (
        <div key={r.year} className="numeric flex gap-3 border-b border-line-hairline py-1.5 text-sm">
          <span className="w-14 flex-none text-fg-muted">{r.year}</span>
          <span className="flex-auto text-right text-fg-strong">{eur(r.amount)}</span>
          <span className="flex-auto text-right">{eur(r.rest)}</span>
        </div>
      ))}
    </div>
  ) : null

  const example = (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken px-4 py-3.5">
      <span className="text-sm font-semibold text-fg-strong">Exemple · €1 000 acquis le 1er juillet {year}</span>
      <span className="text-xs text-fg-muted">{note}</span>
      {table}
    </div>
  )

  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Utilisé par ${countLabel(uses, 'immobilisation', 'immobilisations')}`}>
        Il ne peut pas être supprimé tant que des immobilisations l’utilisent.
      </Callout>
    ) : null

  if (!mobile) {
    return (
      <>
        {nameField}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-start gap-4">
          {yearsField}
          {methodField}
          {firstYearField}
        </div>
        {example}
        {inUse}
      </>
    )
  }

  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="type-eyebrow text-fg-muted">durée</span>
          <span className="numeric text-md text-fg-strong">{n === null ? '—' : durationLabel(n)}</span>
        </div>
        <Badge tone="neutral">
          {METHOD_LABELS[method]} · {FIRST_YEAR_LABELS[firstYear]}
        </Badge>
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">modèle</span>
        {nameField}
        {yearsField}
        {methodField}
        {firstYearField}
      </section>
      <section className="flex flex-col gap-2">
        <span className="type-eyebrow text-fg-muted">exemple</span>
        {example}
      </section>
      {inUse}
    </>
  )
}
