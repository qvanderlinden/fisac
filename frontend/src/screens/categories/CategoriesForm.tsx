import { useRef, useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Badge, Button, Callout, Field, Input } from '@qvanderlinden/ui'
import type { CategoryDirection, CategoryRead } from '../../api/types'
import { countLabel } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import type { SaveResult } from '../../lists/useEditSession'
import { usesLabel } from '../../lists/inUse'
import { DIRECTION_TABS } from './categoriesList'

/** The values the form edits: the name as typed and the archive flag; the direction is fixed at creation. */
export interface CategoryFields {
  label: string
  direction: CategoryDirection
  archived: boolean
}

const directionLabel = (d: CategoryDirection) => DIRECTION_TABS.find((t) => t.value === d)?.label ?? d

/**
 * The fields of a category, shared by the desktop dialog and the mobile full-screen form
 * (`CategorieEdition` and `MobileCategorieForm` artboards). The name saves itself; when
 * a save fails (the session toasts it) it goes back to the value the server last
 * confirmed, unless it was changed again since. A category that lines carry can only be
 * archived.
 */
export function CategoriesForm({
  row,
  direction,
  isNew,
  mobile,
  onSave,
}: {
  /** The saved category; undefined while a new one has no name yet, so does not exist. */
  row: CategoryRead | undefined
  /** The direction of a new category (the active tab's); a saved one shows its own. */
  direction: CategoryDirection
  isNew: boolean
  mobile: boolean
  onSave(patch: Partial<CategoryFields>): Promise<SaveResult<CategoryFields>>
}) {
  const [label, setLabel] = useState(row?.label ?? '')
  const [labelTyped, setLabelTyped] = useState(false)
  // What the input holds now, read when a save answers.
  const typed = useRef({ label })

  const labelSaver = useAutosave(async (value) => {
    const result = await onSave({ label: value })
    if (!result.ok && typed.current.label === value) {
      typed.current.label = result.server.label
      setLabel(result.server.label)
    }
  })

  const shown = row?.direction ?? direction
  const uses = row?.uses ?? 0
  const labelError =
    labelTyped && label.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : une catégorie sans nom n’est pas gardée.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined

  const nameField = (
    <Field label="Nom" error={labelError}>
      <Input
        placeholder="Honoraires, Loyer, Frais bancaires…"
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

  const archived = row?.archived ?? false
  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Utilisée par ${countLabel(uses, 'ligne', 'lignes')}`}>
        Elle ne peut pas être supprimée, seulement archivée : elle disparaît alors des listes de choix, et les lignes qui la
        portent la gardent.
      </Callout>
    ) : null
  const archive =
    row && (uses > 0 || archived) ? (
      <Button
        variant="ghost"
        iconLeft={archived ? ArchiveRestore : Archive}
        onClick={() => void onSave({ archived: !archived })}
      >
        {archived ? 'Désarchiver' : 'Archiver la catégorie'}
      </Button>
    ) : null

  if (!mobile) {
    return (
      <>
        {nameField}
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Badge tone="neutral">{directionLabel(shown)}</Badge>
          <span>Proposée sur les lignes de {shown === 'sales' ? 'vente' : 'achat'}</span>
        </div>
        {inUse}
        {archive}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{directionLabel(shown)}</Badge>
            {archived ? <Badge tone="neutral">archivée</Badge> : null}
          </div>
          <span className="numeric text-sm text-fg-muted">{usesLabel(uses)}</span>
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">catégorie</span>
        {nameField}
      </section>
      {inUse}
      {archive}
    </>
  )
}
