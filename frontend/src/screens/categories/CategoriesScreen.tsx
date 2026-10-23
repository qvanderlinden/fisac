import { useState } from 'react'
import { Callout, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { CategoryDirection, CategoryRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { CategoriesCards } from './CategoriesCards'
import { CategoriesForm, type CategoryFields } from './CategoriesForm'
import { CategoriesTable } from './CategoriesTable'
import { DIRECTION_TABS, deletable, displayName } from './categoriesList'

/** The API names of the form's fields; the direction is only sent when a category is created. */
function bodyOf(patch: Partial<CategoryFields>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.label !== undefined) body.label = patch.label.trim()
  if (patch.archived !== undefined) body.archived = patch.archived
  return body
}

/**
 * A category in the form. The API needs a name and a direction: a new category is POSTed
 * with the first name typed, in the direction of the tab it was opened from; a blank name
 * is never sent (the form says so), and a new category whose name is erased again is
 * deleted when the form closes.
 */
function rulesFor(direction: CategoryDirection): EditRules<CategoryRead, CategoryFields> {
  return {
    fields: (row) => ({
      label: row?.label ?? '',
      direction: row?.direction ?? direction,
      archived: row?.archived ?? false,
    }),
    patchBody: (patch) => (patch.label !== undefined && patch.label.trim() === '' ? null : bodyOf(patch)),
    createBody: (local) => (local.label.trim() ? { label: local.label.trim(), direction: local.direction } : null),
    discard: (local) => local.label.trim() === '',
  }
}

/**
 * The Catégories screen: loads the categories, shows the ventes / achats tabs and the table
 * (desktop) or the cards (mobile), and owns the edit form, its saves (`useEditSession`),
 * the archiving and the deletions.
 */
export function CategoriesScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<CategoryRead[]>('/categories')
  const [tab, setTab] = useState<CategoryDirection>('sales')
  const { editing, open, close, remove, create } = useEditSession('/categories', setData, rulesFor(tab))
  const [deleting, setDeleting] = useState<number[] | null>(null)

  if (error) {
    return (
      <Callout tone="negative" title="Les catégories n’ont pas pu être chargées.">
        {messageOf(error)}
      </Callout>
    )
  }
  if (!data) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  /** Archives or restores categories outside the form. */
  async function archive(ids: number[], archived: boolean) {
    const rows = (data ?? []).filter((c) => ids.includes(c.id) && c.archived !== archived)
    const results = await Promise.allSettled(
      rows.map((c) => api.patch<CategoryRead>(`/categories/${c.id}`, { archived })),
    )
    const saved = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    if (saved.length) setData((list) => list.map((c) => saved.find((s) => s.id === c.id) ?? c))
    const refused = results.find((r) => r.status === 'rejected')
    if (refused) toast(messageOf(refused.reason), { tone: 'negative' })
  }

  const openRow = (row: CategoryRead | null) => {
    setDeleting(null)
    open(row)
  }
  const openId = (id: number) => {
    const c = data.find((r) => r.id === id)
    if (c) openRow(c)
  }
  const askDelete = (ids: number[]) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting(ids)
  }

  const row = editing && editing.id !== null ? data.find((r) => r.id === editing.id) : undefined
  const title = editing?.isNew ? 'Nouvelle catégorie' : displayName(row)
  const doomed = deleting ? data.filter((r) => deleting.includes(r.id) && deletable(r)) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer « ${doomed[0].label || 'la catégorie'} » ?` : `Supprimer ${doomed.length} catégories ?`,
        description: one ? 'Aucune pièce ne la porte. C’est définitif.' : 'Aucune pièce ne les porte. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : doomed.map((c) => ({ label: displayName(c), detail: DIRECTION_TABS.find((t) => t.value === c.direction)?.label })),
        action: mobile ? 'Supprimer' : one ? 'Supprimer la catégorie' : `Supprimer ${doomed.length} catégories`,
        onConfirm: () => {
          setDeleting(null)
          void remove(doomed.map((c) => c.id))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction =
    row && deletable(row) ? { label: 'Supprimer la catégorie', run: () => askDelete([row.id]) } : undefined

  const form = editing ? (
    <CategoriesForm
      key={editing.key}
      row={row}
      direction={tab}
      isNew={editing.isNew}
      mobile={mobile}
      onSave={editing.save}
    />
  ) : null

  if (mobile) {
    return (
      <>
        <CategoriesCards rows={data} tab={tab} onTab={setTab} onAdd={() => openRow(null)} onOpen={openId} />
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
      <CategoriesTable
        rows={data}
        tab={tab}
        onTab={setTab}
        onAdd={() => openRow(null)}
        onOpen={openId}
        onDuplicate={(c) =>
          void create({
            label: `${c.label} (copie)`.slice(0, 120),
            direction: c.direction,
          })
        }
        onArchive={(ids, archived) => void archive(ids, archived)}
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
