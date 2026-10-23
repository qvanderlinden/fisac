import { useState } from 'react'
import { Callout } from '@qvanderlinden/ui'
import type { VatSchemeRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { VAT_DEFAULTS, VatSchemesForm, type VatFields } from './VatSchemesForm'
import { VatSchemesCards } from './VatSchemesCards'
import { VatSchemesTable } from './VatSchemesTable'
import { displayName, summary } from './vatSchemesList'

/** The API names of the form's fields. */
function bodyOf(patch: Partial<VatFields>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.label !== undefined) body.label = patch.label.trim()
  if (patch.rate !== undefined) body.rate = patch.rate
  if (patch.forSales !== undefined) body.for_sales = patch.forSales
  if (patch.forPurchases !== undefined) body.for_purchases = patch.forPurchases
  if (patch.recoverable !== undefined) body.recoverable_rate = patch.recoverable
  return body
}

/**
 * A VAT scheme in the form. The API needs a name, a rate and a side: a new scheme is
 * POSTed with the first name typed (a purchase scheme at 21 %, 100 % recoverable, unless
 * other values were set before), a blank name is never sent (the form says so), and a new
 * scheme whose name is erased again is deleted when the form closes.
 */
const RULES: EditRules<VatSchemeRead, VatFields> = {
  fields: (row) =>
    row
      ? {
          label: row.label,
          forSales: row.for_sales,
          forPurchases: row.for_purchases,
          rate: row.rate,
          recoverable: row.recoverable_rate,
        }
      : VAT_DEFAULTS,
  patchBody: (patch) => (patch.label !== undefined && patch.label.trim() === '' ? null : bodyOf(patch)),
  createBody: (local) =>
    local.label.trim()
      ? {
          label: local.label.trim(),
          rate: local.rate,
          recoverable_rate: local.forPurchases ? local.recoverable : null,
          for_sales: local.forSales,
          for_purchases: local.forPurchases,
        }
      : null,
  discard: (local) => local.label.trim() === '',
}

/**
 * The Régimes de TVA screen: loads the schemes, shows the table (desktop) or the cards
 * (mobile), and owns the edit form, its saves (`useEditSession`) and the deletions.
 */
export function VatSchemesScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<VatSchemeRead[]>('/vat-schemes')
  const { editing, open, close, remove, create } = useEditSession('/vat-schemes', setData, RULES)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  if (error) {
    return (
      <Callout tone="negative" title="Les régimes de TVA n’ont pas pu être chargés.">
        {messageOf(error)}
      </Callout>
    )
  }
  if (!data) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const openRow = (row: VatSchemeRead | null) => {
    setDeleting(null)
    open(row)
  }
  const openId = (id: number) => {
    const s = data.find((r) => r.id === id)
    if (s) openRow(s)
  }
  const askDelete = (ids: number[]) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting(ids)
  }

  const row = editing && editing.id !== null ? data.find((r) => r.id === editing.id) : undefined
  const title = editing?.isNew ? 'Nouveau régime de TVA' : displayName(row)
  const doomed = deleting ? data.filter((r) => deleting.includes(r.id) && r.uses === 0) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer « ${doomed[0].label || 'le régime'} » ?` : `Supprimer ${doomed.length} régimes ?`,
        description: one ? 'Aucune pièce ne le porte. C’est définitif.' : 'Aucune pièce ne les porte. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : doomed.map((s) => ({ label: displayName(s), detail: summary(s) })),
        action: mobile ? 'Supprimer' : one ? 'Supprimer le régime' : `Supprimer ${doomed.length} régimes`,
        onConfirm: () => {
          setDeleting(null)
          void remove(doomed.map((s) => s.id))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction = row && row.uses === 0 ? { label: 'Supprimer le régime', run: () => askDelete([row.id]) } : undefined

  const form = editing ? (
    <VatSchemesForm key={editing.key} row={row} isNew={editing.isNew} mobile={mobile} onSave={editing.save} />
  ) : null

  if (mobile) {
    return (
      <>
        <VatSchemesCards rows={data} onAdd={() => openRow(null)} onOpen={openId} />
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
      <VatSchemesTable
        rows={data}
        onAdd={() => openRow(null)}
        onOpen={openId}
        onDuplicate={(s) =>
          void create({
            label: `${s.label} (copie)`.slice(0, 120),
            rate: s.rate,
            recoverable_rate: s.recoverable_rate,
            for_sales: s.for_sales,
            for_purchases: s.for_purchases,
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
