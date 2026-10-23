import { useRef, useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Badge, Button, Callout, Field, Input, Select } from '@qvanderlinden/ui'
import type { CategoryKind, CategoryRead, IsocSchemeRead, VatSchemeRead } from '../../api/types'
import { countLabel } from '../../format'
import { useAutosave } from '../../hooks/useAutosave'
import type { SaveResult } from '../../lists/useEditSession'
import { isTaxed } from './categoriesList'
import { KINDS, ROLE_SCREENS, kindTone } from './kinds'
import { usesLabel } from '../tiers/tiersList'

/** The values the form edits: the name as typed, the kind, the two defaults (null for none) and the archive flag. */
export interface CategoryFields {
  label: string
  kind: CategoryKind
  defaultVat: number | null
  defaultIsoc: number | null
  archived: boolean
}

const NONE = 'none'
const KIND_OPTIONS = (Object.keys(KINDS) as CategoryKind[]).map((k) => ({ value: k, label: KINDS[k].label }))

const idOf = (value: string) => (value === NONE ? null : Number(value))
const valueOf = (id: number | null) => (id === null ? NONE : String(id))

/**
 * The fields of a category, shared by the desktop dialog and the mobile full-screen form
 * (`CategorieEdition` and `MobileCategorieForm` artboards). Each field saves itself; when
 * a save fails (the session toasts it) the field goes back to the value the server last
 * confirmed, unless it was changed again since. A category a screen books into
 * (`role`) or that pieces carry keeps its kind.
 */
export function CategoriesForm({
  row,
  isNew,
  mobile,
  vatSchemes,
  isocSchemes,
  onSave,
}: {
  /** The saved category; undefined while a new one has no name yet, so does not exist. */
  row: CategoryRead | undefined
  isNew: boolean
  mobile: boolean
  vatSchemes: VatSchemeRead[]
  isocSchemes: IsocSchemeRead[]
  onSave(patch: Partial<CategoryFields>): Promise<SaveResult<CategoryFields>>
}) {
  const [label, setLabel] = useState(row?.label ?? '')
  const [labelTyped, setLabelTyped] = useState(false)
  const [kind, setKind] = useState<CategoryKind>(row?.kind ?? 'expense')
  const [vat, setVat] = useState<number | null>(row?.default_vat_scheme_id ?? null)
  const [isoc, setIsoc] = useState<number | null>(row?.default_isoc_scheme_id ?? null)
  // What the inputs hold now, read when a save answers.
  const typed = useRef({ label, kind, vat, isoc })

  const labelSaver = useAutosave(async (value) => {
    const result = await onSave({ label: value })
    if (!result.ok && typed.current.label === value) {
      typed.current.label = result.server.label
      setLabel(result.server.label)
    }
  })

  async function pickKind(value: string) {
    const next = value as CategoryKind
    typed.current.kind = next
    setKind(next)
    const result = await onSave({ kind: next })
    if (!result.ok && typed.current.kind === next) {
      typed.current.kind = result.server.kind
      setKind(result.server.kind)
    }
  }

  async function pickVat(value: string) {
    const next = idOf(value)
    typed.current.vat = next
    setVat(next)
    const result = await onSave({ defaultVat: next })
    if (!result.ok && typed.current.vat === next) {
      typed.current.vat = result.server.defaultVat
      setVat(result.server.defaultVat)
    }
  }

  async function pickIsoc(value: string) {
    const next = idOf(value)
    typed.current.isoc = next
    setIsoc(next)
    const result = await onSave({ defaultIsoc: next })
    if (!result.ok && typed.current.isoc === next) {
      typed.current.isoc = result.server.defaultIsoc
      setIsoc(result.server.defaultIsoc)
    }
  }

  const screen = row?.role ? ROLE_SCREENS[row.role] : null
  const uses = row?.uses ?? 0
  const locked = screen !== null || uses > 0
  const labelError =
    labelTyped && label.trim() === ''
      ? isNew
        ? 'Donnez-lui un nom : une catégorie sans nom n’est pas gardée.'
        : 'Donnez-lui un nom : sans nom, le précédent est gardé.'
      : undefined
  const lockNote = screen ? `fixé par l’écran ${screen}` : 'fixé : déjà utilisée'

  const vatOptions = [
    { value: NONE, label: 'hors TVA' },
    ...vatSchemes.map((s) => ({ value: String(s.id), label: s.label })),
  ]
  const isocOptions = isocSchemes.map((s) => ({ value: String(s.id), label: s.label }))

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

  const kindField = (
    <div className="flex flex-col gap-1.5">
      <Field label="Type">
        <Select options={KIND_OPTIONS} value={kind} onValueChange={(v) => void pickKind(v)} disabled={locked} />
      </Field>
      <span className="text-xs text-fg-muted">{locked ? `${lockNote} · ${KINDS[kind].hint}` : KINDS[kind].hint}</span>
    </div>
  )

  const defaults = isTaxed(kind) ? (
    <div className={mobile ? 'flex flex-col gap-4' : 'grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4'}>
      <div className="flex flex-col gap-1.5">
        <Field label="TVA par défaut">
          <Select options={vatOptions} value={valueOf(vat)} onValueChange={(v) => void pickVat(v)} />
        </Field>
        <span className="text-xs text-fg-muted">Proposée sur une nouvelle ligne</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Field label="ISOC par défaut">
          <Select
            options={isocOptions}
            placeholder="Aucune"
            value={isoc === null ? '' : valueOf(isoc)}
            onValueChange={(v) => void pickIsoc(v)}
          />
        </Field>
        <span className="text-xs text-fg-muted">La part admise en déduction</span>
      </div>
    </div>
  ) : null

  const archived = row?.archived ?? false
  const inUse =
    uses > 0 ? (
      <Callout tone="info" title={`Utilisée par ${countLabel(uses, 'pièce', 'pièces')}`}>
        Elle ne peut pas être supprimée, seulement archivée : elle disparaît alors des listes de choix, et les pièces qui la
        portent la gardent.
      </Callout>
    ) : null
  const archive =
    row && row.role === null && (uses > 0 || archived) ? (
      <Button
        variant="ghost"
        iconLeft={archived ? ArchiveRestore : Archive}
        onClick={() => void onSave({ archived: !archived })}
      >
        {archived ? 'Désarchiver' : 'Archiver la catégorie'}
      </Button>
    ) : null
  const systemNote = screen ? (
    <p className="m-0 text-sm text-fg-muted">Utilisée d’office par l’écran {screen} : son type est fixe.</p>
  ) : null

  if (!mobile) {
    return (
      <>
        {systemNote}
        {nameField}
        {kindField}
        {defaults}
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
            <Badge tone={kindTone(kind)}>{KINDS[kind].label}</Badge>
            {archived ? <Badge tone="neutral">archivée</Badge> : null}
          </div>
          <span className="numeric text-sm text-fg-muted">{usesLabel(uses)}</span>
        </div>
        {systemNote}
      </section>
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">catégorie</span>
        {nameField}
        {kindField}
      </section>
      {defaults ? (
        <section className="flex flex-col gap-4">
          <span className="type-eyebrow text-fg-muted">par défaut</span>
          {defaults}
        </section>
      ) : null}
      {inUse}
      {archive}
    </>
  )
}
