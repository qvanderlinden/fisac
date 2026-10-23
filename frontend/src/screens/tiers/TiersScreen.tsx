import { useState } from 'react'
import { Callout, toast } from '@qvanderlinden/ui'
import type { ThirdPartyRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { groupIban } from '../../iban'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { TiersCards } from './TiersCards'
import { TiersForm, type TiersFields } from './TiersForm'
import { TiersTable } from './TiersTable'
import { displayName } from './tiersList'

/**
 * A tiers in the form. The API needs a name: a new tiers is POSTed with the first name
 * typed (and the IBAN typed before it), a blank name is never sent (the form says so),
 * and a new tiers whose name is erased again is deleted when the form closes.
 */
const RULES: EditRules<ThirdPartyRead, TiersFields> = {
  fields: (row) => ({ name: row?.name ?? '', iban: row?.iban ?? null }),
  patchBody: (patch) => {
    if (patch.name === undefined) return patch
    const name = patch.name.trim()
    return name ? { ...patch, name } : null
  },
  createBody: (local) => (local.name.trim() ? { name: local.name.trim(), iban: local.iban } : null),
  discard: (local) => local.name.trim() === '',
}

/**
 * The Tiers screen: loads the list, shows the table (desktop) or the cards (mobile),
 * and owns the edit form, its saves (`useEditSession`) and the deletions.
 */
export function TiersScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<ThirdPartyRead[]>('/third-parties')
  const { editing, open, close, remove, create } = useEditSession('/third-parties', setData, RULES)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  async function copyIban(row: ThirdPartyRead) {
    try {
      await navigator.clipboard.writeText(row.iban ?? '')
      toast('IBAN copié.', { tone: 'positive' })
    } catch {
      toast('L’IBAN n’a pas pu être copié : sélectionnez-le dans la fiche.', { tone: 'negative' })
    }
  }

  if (error) {
    return (
      <Callout tone="negative" title="Les tiers n’ont pas pu être chargés.">
        {messageOf(error)}
      </Callout>
    )
  }
  if (!data) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const openRow = (row: ThirdPartyRead | null) => {
    setDeleting(null)
    open(row)
  }
  const openId = (id: number) => {
    const t = data.find((r) => r.id === id)
    if (t) openRow(t)
  }
  const askDelete = (id: number) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting([id])
  }

  const row = editing && editing.id !== null ? data.find((r) => r.id === editing.id) : undefined
  const title = editing?.isNew ? 'Nouveau tiers' : displayName(row)
  const doomed = deleting ? data.filter((r) => deleting.includes(r.id) && r.uses === 0) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer « ${doomed[0].name || 'le tiers'} » ?` : `Supprimer ${doomed.length} tiers ?`,
        description: one ? 'Aucune pièce ne le porte. C’est définitif.' : 'Aucune pièce ne les porte. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : doomed.map((t) => ({ label: displayName(t), detail: t.iban ? groupIban(t.iban) : 'sans IBAN' })),
        action: mobile ? 'Supprimer' : one ? 'Supprimer le tiers' : `Supprimer ${doomed.length} tiers`,
        onConfirm: () => {
          setDeleting(null)
          void remove(doomed.map((t) => t.id))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction = row && row.uses === 0 ? { label: 'Supprimer le tiers', run: () => askDelete(row.id) } : undefined

  const form = editing ? (
    <TiersForm key={editing.key} row={row} isNew={editing.isNew} mobile={mobile} onSave={editing.save} />
  ) : null

  if (mobile) {
    return (
      <>
        <TiersCards rows={data} onAdd={() => openRow(null)} onOpen={openId} />
        {editing ? (
          <FullScreenForm
            title={title}
            onClose={close}
            remove={removeAction}
            confirm={deleteConfirm}
          >
            {form}
          </FullScreenForm>
        ) : null}
      </>
    )
  }

  return (
    <>
      <TiersTable
        rows={data}
        onAdd={() => openRow(null)}
        onOpen={openId}
        onDuplicate={(t) => void create({ name: `${t.name} (copie)`, iban: t.iban })}
        onCopyIban={(t) => void copyIban(t)}
        onDelete={setDeleting}
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
