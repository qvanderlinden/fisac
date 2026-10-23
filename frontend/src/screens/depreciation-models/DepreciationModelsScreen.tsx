import { useState } from 'react'
import { Callout } from '@qvanderlinden/ui'
import type { DepreciationModelRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { MODEL_DEFAULTS, DepreciationModelsForm, parseYears, type ModelFields } from './DepreciationModelsForm'
import { DepreciationModelsCards } from './DepreciationModelsCards'
import { DepreciationModelsTable } from './DepreciationModelsTable'
import { displayName, summary } from './depreciationModelsList'

/** The API names of the form's fields. */
function bodyOf(patch: Partial<ModelFields>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.label !== undefined) body.label = patch.label.trim()
  if (patch.years !== undefined) body.years = Number(patch.years)
  if (patch.method !== undefined) body.method = patch.method
  if (patch.firstYear !== undefined) body.first_year = patch.firstYear
  return body
}

/**
 * A depreciation model in the form. The API needs a name and a duration: a new model is
 * POSTed with the first name typed (5 years, linear, prorated, unless other values were
 * set before), a blank name is never sent (the form says so), and a new model whose name
 * is erased again is deleted when the form closes.
 */
const RULES: EditRules<DepreciationModelRead, ModelFields> = {
  fields: (row) =>
    row
      ? { label: row.label, years: String(row.years), method: row.method, firstYear: row.first_year }
      : MODEL_DEFAULTS,
  patchBody: (patch) => (patch.label !== undefined && patch.label.trim() === '' ? null : bodyOf(patch)),
  createBody: (local) =>
    local.label.trim()
      ? {
          label: local.label.trim(),
          // A duration not readable yet starts as the default, 5 years.
          years: parseYears(local.years) ?? 5,
          method: local.method,
          first_year: local.firstYear,
        }
      : null,
  discard: (local) => local.label.trim() === '',
}

/**
 * The Modèles d’amortissement screen: loads the models, shows the table (desktop) or the cards
 * (mobile), and owns the edit form, its saves (`useEditSession`) and the deletions.
 */
export function DepreciationModelsScreen() {
  const { current } = useFiscalYear()
  // The example asset is bought on 1 July of the current fiscal year.
  const year = current ? Number(current.end_date.slice(0, 4)) : new Date().getFullYear()
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<DepreciationModelRead[]>('/depreciation-models')
  const { editing, open, close, remove, create } = useEditSession('/depreciation-models', setData, RULES)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  if (error) {
    return (
      <Callout tone="negative" title="Les modèles d’amortissement n’ont pas pu être chargés.">
        {messageOf(error)}
      </Callout>
    )
  }
  if (!data) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const openRow = (row: DepreciationModelRead | null) => {
    setDeleting(null)
    open(row)
  }
  const openId = (id: number) => {
    const m = data.find((r) => r.id === id)
    if (m) openRow(m)
  }
  const askDelete = (ids: number[]) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting(ids)
  }

  const row = editing && editing.id !== null ? data.find((r) => r.id === editing.id) : undefined
  const title = editing?.isNew ? 'Nouveau modèle' : displayName(row)
  const doomed = deleting ? data.filter((r) => deleting.includes(r.id) && r.uses === 0) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer « ${doomed[0].label || 'le modèle'} » ?` : `Supprimer ${doomed.length} modèles ?`,
        description: one ? 'Aucune immobilisation ne l’utilise. C’est définitif.' : 'Aucune immobilisation ne les utilise. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : doomed.map((m) => ({ label: displayName(m), detail: summary(m) })),
        action: mobile ? 'Supprimer' : one ? 'Supprimer le modèle' : `Supprimer ${doomed.length} modèles`,
        onConfirm: () => {
          setDeleting(null)
          void remove(doomed.map((m) => m.id))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction = row && row.uses === 0 ? { label: 'Supprimer le modèle', run: () => askDelete([row.id]) } : undefined

  const form = editing ? (
    <DepreciationModelsForm
      key={editing.key}
      row={row}
      isNew={editing.isNew}
      mobile={mobile}
      year={year}
      onSave={editing.save}
    />
  ) : null

  if (mobile) {
    return (
      <>
        <DepreciationModelsCards rows={data} onAdd={() => openRow(null)} onOpen={openId} />
        {editing ? (
          <FullScreenForm title={title} onClose={close} remove={removeAction} confirm={deleteConfirm}>
            {form}
          </FullScreenForm>
        ) : null}
      </>
    )
  }

  return (
    <>
      <DepreciationModelsTable
        rows={data}
        onAdd={() => openRow(null)}
        onOpen={openId}
        onDuplicate={(m) =>
          void create({
            label: `${m.label} (copie)`.slice(0, 120),
            years: m.years,
            method: m.method,
            first_year: m.first_year,
          })
        }
        onDelete={askDelete}
      />
      {deleteConfirm ? (
        <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} />
      ) : editing ? (
        <EditDialog title={title} onClose={close} remove={removeAction}>
          {form}
        </EditDialog>
      ) : null}
    </>
  )
}
