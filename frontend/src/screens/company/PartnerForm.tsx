import { useRef, useState } from 'react'
import { Field, Input } from '@qvanderlinden/ui'
import type { PartnerRead } from '../../api/types'
import { InfoLabel } from '../../lists/InfoLabel'
import { amountInput, formatNumber, isBadAmount, MAX_AMOUNT } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import type { SaveResult } from '../../lists/useEditSession'
import { sharePercent } from './fiscalYearHint'
import { parseContribution, parseShares } from './partners'

/** The values the form edits, as typed: the name, the number of parts and the contribution. */
export interface PartnerFields {
  name: string
  parts: string
  apport: string
}

/**
 * The fields of a partner, shared by the desktop dialog and the mobile full-screen form
 * (`SocieteAssocie` and `MobileSocieteAssocie` artboards). Each field saves itself; a
 * value that cannot be sent (a blank name, a fraction of a part, a negative amount) is
 * flagged and kept out of the request. When a save fails (the session toasts it) the
 * field goes back to the value the server last confirmed, unless typed again since.
 */
export function PartnerForm({
  row,
  isNew,
  mobile,
  otherShares,
  onSave,
}: {
  /** The saved partner; undefined while a new one has no name yet, so does not exist. */
  row: PartnerRead | undefined
  isNew: boolean
  mobile: boolean
  /** The parts the other partners hold. */
  otherShares: number
  onSave(patch: Partial<PartnerFields>): Promise<SaveResult<PartnerFields>>
}) {
  const [name, setName] = useState(row?.name ?? '')
  const [nameTyped, setNameTyped] = useState(false)
  const [parts, setParts] = useState(row ? String(row.shares) : '')
  const [apport, setApport] = useState(row ? amountInput(row.contribution) : '')
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ name, parts, apport })

  const nameSaver = useAutosave(async (value) => {
    const result = await onSave({ name: value })
    if (!result.ok && typed.current.name === value) {
      typed.current.name = result.server.name
      setName(result.server.name)
    }
  })
  const partsSaver = useAutosave(async (value) => {
    if (parseShares(value) === null) return
    const result = await onSave({ parts: value })
    if (!result.ok && typed.current.parts === value) {
      typed.current.parts = result.server.parts
      setParts(result.server.parts)
    }
  })
  const apportSaver = useAutosave(async (value) => {
    if (parseContribution(value) === null) return
    const result = await onSave({ apport: value })
    if (!result.ok && typed.current.apport === value) {
      typed.current.apport = result.server.apport
      setApport(result.server.apport)
    }
  })

  const nameError =
    nameTyped && name.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : un associé sans nom n’est pas gardé.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const partsBad = parts.trim() !== '' && parseShares(parts) === null
  const apportBad = apport.trim() !== '' && isBadAmount(apport, { max: MAX_AMOUNT })
  const mine = parseShares(parts) ?? 0
  const total = otherShares + mine
  const partsInfo = total ? `${sharePercent(mine, total)} des ${formatNumber(total)} parts` : 'Aucune part émise'

  const nameField = (
    <Field label="Nom" error={nameError}>
      <Input
        placeholder="Personne ou société"
        value={name}
        onChange={(e) => {
          typed.current.name = e.target.value
          setName(e.target.value)
          setNameTyped(true)
          nameSaver.onChange(e.target.value)
        }}
        onBlur={nameSaver.onBlur}
      />
    </Field>
  )
  const partsField = (
    <Field label={<InfoLabel info={partsInfo}>Nombre de parts</InfoLabel>} error={partsBad ? 'Un nombre entier de parts' : undefined}>
      <Input
        numeric
        value={parts}
        onChange={(e) => {
          typed.current.parts = e.target.value
          setParts(e.target.value)
          partsSaver.onChange(e.target.value)
        }}
        onBlur={partsSaver.onBlur}
      />
    </Field>
  )
  const apportField = (
    <Field
      label={<InfoLabel info="Ce qu’il a versé pour ses parts">Apport</InfoLabel>}
      error={apportBad ? 'Un montant positif' : undefined}
    >
      <Input
        numeric
        prefix="€"
        placeholder="0,00"
        value={apport}
        onChange={(e) => {
          typed.current.apport = e.target.value
          setApport(e.target.value)
          apportSaver.onChange(e.target.value)
        }}
        onBlur={apportSaver.onBlur}
      />
    </Field>
  )

  if (!mobile) {
    return (
      <>
        {nameField}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {partsField}
          {apportField}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-2xs text-fg-muted">part du capital</span>
          <span className="numeric text-2xl font-medium text-fg-strong">{sharePercent(mine, total)}</span>
        </div>
        <span className="text-right font-mono text-xs text-fg-muted">{partsInfo}</span>
      </div>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">associé</span>
        {nameField}
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">parts et apport</span>
        {partsField}
        {apportField}
      </section>
    </>
  )
}
