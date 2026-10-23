import { useRef, useState } from 'react'
import { Badge, Callout, Field, Input, Select } from '@qvanderlinden/ui'
import type { IsocRubric, IsocSchemeRead } from '../../api/types'
import { countLabel, eur, formatRate, parseRequiredRate, rateInput } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import { InfoLabel } from '../../lists/InfoLabel'
import type { SaveResult } from '../../lists/useEditSession'
import { isocExample } from '../../schemeExamples'
import { RUBRICS, RUBRIC_OPTIONS } from './isocSchemesList'

/** The values the form edits: the name as typed, the deductible share as an API decimal, the rubric. */
export interface IsocFields {
  label: string
  rate: string
  rubric: IsocRubric
}

/** What a new scheme starts as: fully deductible, in the "autres" rubric. */
export const ISOC_DEFAULTS: IsocFields = { label: '', rate: '100', rubric: 'other' }

/**
 * The fields of an ISOC scheme, shared by the desktop dialog and the mobile full-screen
 * form (`RegimeIsocEdition` and `MobileRegimeIsocForm` artboards). Each field saves
 * itself; when a save fails (the session toasts it) the field goes back to the value the
 * server last confirmed, unless it was changed again since. A rate is sent only once it
 * reads as a percentage.
 */
export function IsocSchemesForm({
  row,
  isNew,
  mobile,
  onSave,
}: {
  /** The saved scheme; undefined while a new one has no name yet, so does not exist. */
  row: IsocSchemeRead | undefined
  isNew: boolean
  mobile: boolean
  onSave(patch: Partial<IsocFields>): Promise<SaveResult<IsocFields>>
}) {
  const [label, setLabel] = useState(row?.label ?? ISOC_DEFAULTS.label)
  const [labelTyped, setLabelTyped] = useState(false)
  const [rate, setRate] = useState(rateInput(row?.deductible_rate ?? ISOC_DEFAULTS.rate))
  const [rubric, setRubric] = useState<IsocRubric>(row?.rubric ?? ISOC_DEFAULTS.rubric)
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ label, rate, rubric })

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

  async function pickRubric(value: string) {
    const next = value as IsocRubric
    typed.current.rubric = next
    setRubric(next)
    const result = await onSave({ rubric: next })
    if (!result.ok && typed.current.rubric === next) {
      typed.current.rubric = result.server.rubric
      setRubric(result.server.rubric)
    }
  }

  const parsedRate = parseRequiredRate(rate)
  const labelError =
    labelTyped && label.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : un régime sans nom n’est pas gardé.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const rateError = parsedRate === null ? (rate.trim() === '' ? 'Obligatoire' : 'Un pourcentage entre 0 et 100') : undefined
  const uses = row?.uses ?? 0
  const example = parsedRate === null ? null : isocExample(parsedRate)

  const nameField = (
    <Field label="Libellé" error={labelError}>
      <Input
        placeholder="69 % · restaurant"
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

  const rateField = (
    <Field label={<InfoLabel info="Le reste est ajouté à la base imposable">Part déductible</InfoLabel>} error={rateError}>
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

  const rubricField = (
    <Field
      label={
        <InfoLabel info="La part non déductible va à cette ligne des dépenses non admises de l’écran ISOC">
          Rubrique de l’annexe
        </InfoLabel>
      }
    >
      <Select options={RUBRIC_OPTIONS} value={rubric} onValueChange={(v) => void pickRubric(v)} />
    </Field>
  )

  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Porté par ${countLabel(uses, 'pièce', 'pièces')}`}>
        Il ne peut pas être supprimé tant que des pièces le portent. Changer sa part déductible recalcule les dépenses non
        admises de l’exercice.
      </Callout>
    ) : null

  if (!mobile) {
    return (
      <>
        {nameField}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {rateField}
          {rubricField}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-surface-sunken px-4 py-3.5">
          <span className="type-eyebrow text-fg-muted">Pour €100 de charge</span>
          <span className="numeric text-sm">
            {example ? `${eur(example.admitted)} admis · ${eur(example.disallowed)} rejeté` : 'saisissez une part déductible'}
          </span>
        </div>
        {inUse}
      </>
    )
  }

  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="type-eyebrow text-fg-muted">part déductible</span>
          <span className="numeric text-md text-fg-strong">{parsedRate === null ? '—' : formatRate(parsedRate)}</span>
        </div>
        <Badge tone={RUBRICS[rubric].tone}>{RUBRICS[rubric].label}</Badge>
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">régime</span>
        {nameField}
        {rateField}
        {rubricField}
      </section>
      <section className="flex flex-col gap-2">
        <span className="type-eyebrow text-fg-muted">pour €100 de charge</span>
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken px-4 py-3.5 text-sm">
          {example ? (
            <>
              <div className="flex justify-between">
                <span>Admis</span>
                <span className="numeric">{eur(example.admitted)}</span>
              </div>
              <div className="flex justify-between">
                <span>Rejeté</span>
                <span className="numeric">{eur(example.disallowed)}</span>
              </div>
            </>
          ) : (
            <span className="text-fg-muted">saisissez une part déductible</span>
          )}
        </div>
      </section>
      {inUse}
    </>
  )
}
