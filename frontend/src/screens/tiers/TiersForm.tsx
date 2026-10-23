import { useState } from 'react'
import { Info } from 'lucide-react'
import { Badge, Callout, Field, Icon, Input, Tooltip, toast } from '@qvanderlinden/ui'
import type { ThirdPartyRead } from '../../api/types'
import { messageOf } from '../../errors'
import { countLabel } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import { checkIban, groupIban, normalizeIban } from '../../iban'
import { usesLabel } from './tiersList'

/** One autosaved field, as `TiersScreen` sends it: a name, or an IBAN already checked (null clears it). */
export type TiersPatch = { name: string } | { iban: string | null }

/**
 * The fields of a tiers, shared by the desktop dialog and the mobile full-screen form
 * (`Tiers` and `MobileTiers` artboards). Each field saves itself; a failed save shows
 * the error and puts the server's value back. An IBAN is checked as it is typed and
 * only a valid or empty one is sent.
 */
export function TiersForm({
  row,
  isNew,
  mobile,
  onSave,
}: {
  /** The saved tiers; undefined while a new one has no name yet, so does not exist. */
  row: ThirdPartyRead | undefined
  isNew: boolean
  mobile: boolean
  onSave(patch: TiersPatch): Promise<void>
}) {
  const [name, setName] = useState(row?.name ?? '')
  const [nameTyped, setNameTyped] = useState(false)
  const [iban, setIban] = useState(groupIban(row?.iban ?? ''))
  const check = checkIban(iban)

  const nameSaver = useAutosave(async (value) => {
    try {
      await onSave({ name: value })
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
      setName(row?.name ?? '')
    }
  })

  const ibanSaver = useAutosave(async (value) => {
    if (checkIban(value).state === 'invalid') return
    try {
      await onSave({ iban: normalizeIban(value) })
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
      setIban(groupIban(row?.iban ?? ''))
    }
  })

  const nameError =
    nameTyped && name.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : un tiers sans nom n’est pas gardé.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const ibanError =
    check.state === 'invalid'
      ? `IBAN invalide : vérifiez les chiffres${check.country ? ` (${check.country})` : ''}`
      : undefined
  const validLabel = `IBAN valide${check.country ? ` · ${check.country}` : ''}`
  const ibanInfo = check.state === 'valid' ? validLabel : 'Facultatif : utile pour payer ce tiers par virement.'
  const uses = row?.uses ?? 0
  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Porté par ${countLabel(uses, 'pièce', 'pièces')}`}>
        Il ne peut pas être supprimé tant que des pièces le portent.
      </Callout>
    ) : null

  const fields = (
    <>
      <Field label="Nom" error={nameError}>
        <Input
          placeholder="Société ou personne"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameTyped(true)
            nameSaver.onChange(e.target.value)
          }}
          onBlur={nameSaver.onBlur}
        />
      </Field>
      <Field
        label={
          <>
            IBAN
            <Tooltip label={ibanInfo} side="bottom">
              <span
                tabIndex={0}
                role="img"
                aria-label={ibanInfo}
                // Inside the label: a click on the dot must not move focus to the input.
                onClick={(e) => e.preventDefault()}
                className="inline-flex cursor-help rounded-pill text-fg-muted"
              >
                <Icon icon={Info} size={14} />
              </span>
            </Tooltip>
          </>
        }
        error={ibanError}
      >
        <Input
          placeholder="BE00 0000 0000 0000"
          className="font-mono tracking-wide"
          autoComplete="off"
          spellCheck={false}
          value={iban}
          onChange={(e) => {
            setIban(e.target.value)
            ibanSaver.onChange(e.target.value)
          }}
          onBlur={ibanSaver.onBlur}
        />
      </Field>
    </>
  )

  if (!mobile) {
    return (
      <>
        {fields}
        {inUse}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">identité</span>
        {fields}
        {check.state === 'valid' ? (
          <div className="flex">
            <Badge tone="positive">{validLabel}</Badge>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">
        <span className="type-eyebrow text-fg-muted">pièces</span>
        <div className="flex justify-between gap-2 rounded-lg bg-surface-sunken px-4 py-3.5 text-md">
          <span>Utilisé</span>
          <span className="numeric text-fg-strong">{usesLabel(uses)}</span>
        </div>
        {inUse}
      </section>
    </>
  )
}
