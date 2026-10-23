import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Callout, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { ThirdPartyRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { groupIban } from '../../iban'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { createSerialQueue } from '../../serialQueue'
import { TiersCards } from './TiersCards'
import { TiersForm, type TiersPatch } from './TiersForm'
import { TiersTable } from './TiersTable'
import { displayName } from './tiersList'

const PATH = '/third-parties'

/** The tiers open in the form. `id` is null while a new one has no name yet: it is created by its first name. */
interface Editing {
  key: number
  id: number | null
  isNew: boolean
}

/** What the saves of the open form know, read by the queued requests when they run. */
interface Session extends Editing {
  name: string
  iban: string | null
}

function failed(e: unknown) {
  toast(messageOf(e), { tone: 'negative' })
}

/**
 * The Tiers screen: loads the list, shows the table (desktop) or the cards (mobile),
 * and owns the edit form and the deletions. Every write goes through one queue, so
 * the requests reach the server in the order they were made.
 *
 * "Nouveau tiers" opens an empty form without creating anything: the API needs a
 * name, so the tiers is POSTed with the first name typed (and the IBAN typed before
 * it), and PATCHed after. A new tiers whose name is erased again is deleted when
 * the form closes; one never named was never created.
 */
export function TiersScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<ThirdPartyRead[]>(PATH)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<number[] | null>(null)
  const session = useRef<Session | null>(null)
  const keys = useRef(0)
  const enqueue = useMemo(() => createSerialQueue(), [])

  /** Puts the server's answer in the list: in place of the row, or at the end for a new one. */
  const put = useCallback(
    (row: ThirdPartyRead) =>
      setData((rows) =>
        rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row],
      ),
    [setData],
  )
  const drop = useCallback((ids: number[]) => setData((rows) => rows.filter((r) => !ids.includes(r.id))), [setData])

  /** Opens the form on a tiers, or on a new one for null. */
  function open(row: ThirdPartyRead | null) {
    const next: Editing = { key: ++keys.current, id: row?.id ?? null, isNew: row === null }
    session.current = { ...next, name: row?.name ?? '', iban: row?.iban ?? null }
    setDeleting(null)
    setEditing(next)
  }

  const save = useCallback(
    (patch: TiersPatch): Promise<void> => {
      const s = session.current
      if (!s) return Promise.resolve()
      if ('name' in patch) {
        s.name = patch.name
        // A blank name is never sent: the API refuses it, and the form says so.
        if (patch.name.trim() === '') return Promise.resolve()
      } else s.iban = patch.iban
      const body = 'name' in patch ? { name: patch.name.trim() } : patch
      return enqueue(async () => {
        if (s.id !== null) {
          put(await api.patch<ThirdPartyRead>(`${PATH}/${s.id}`, body))
          return
        }
        if (s.name.trim() === '') return // Not created yet: the IBAN goes with the name.
        const row = await api.post<ThirdPartyRead>(PATH, { name: s.name.trim(), iban: s.iban })
        s.id = row.id
        put(row)
        setEditing((e) => (e?.key === s.key ? { ...e, id: row.id } : e))
      })
    },
    [enqueue, put],
  )

  // Runs once the form has unmounted, after its last typing was handed to `save`.
  useEffect(() => {
    if (editing !== null) return
    const s = session.current
    session.current = null
    if (!s?.isNew) return
    enqueue(async () => {
      if (s.id === null || s.name.trim() !== '') return
      await api.del(`${PATH}/${s.id}`)
      drop([s.id])
    }).catch(failed)
  }, [editing, enqueue, drop])

  async function remove(ids: number[]) {
    setDeleting(null)
    const s = session.current
    if (s && s.id !== null && ids.includes(s.id)) {
      // The form closes on the deleted tiers: its last typing has nothing left to save.
      session.current = null
      setEditing(null)
    }
    const results = await Promise.allSettled(ids.map((id) => enqueue(() => api.del(`${PATH}/${id}`)).then(() => id)))
    drop(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
    const refused = results.find((r) => r.status === 'rejected')
    if (refused) failed(refused.reason)
  }

  async function duplicate(row: ThirdPartyRead) {
    try {
      put(await enqueue(() => api.post<ThirdPartyRead>(PATH, { name: `${row.name} (copie)`, iban: row.iban })))
    } catch (e) {
      failed(e)
    }
  }

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

  const openId = (id: number) => {
    const t = data.find((r) => r.id === id)
    if (t) open(t)
  }
  const askDelete = (id: number) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) setEditing(null)
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
        onConfirm: () => void remove(doomed.map((t) => t.id)),
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction = row && row.uses === 0 ? { label: 'Supprimer le tiers', run: () => askDelete(row.id) } : undefined

  const form = editing ? (
    <TiersForm key={editing.key} row={row} isNew={editing.isNew} mobile={mobile} onSave={save} />
  ) : null

  if (mobile) {
    return (
      <>
        <TiersCards rows={data} onAdd={() => open(null)} onOpen={openId} />
        {editing ? (
          <FullScreenForm
            title={title}
            onClose={() => setEditing(null)}
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
        onAdd={() => open(null)}
        onOpen={openId}
        onDuplicate={(t) => void duplicate(t)}
        onCopyIban={(t) => void copyIban(t)}
        onDelete={setDeleting}
      />
      {deleteConfirm ? (
        <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} />
      ) : editing ? (
        <EditDialog title={title} onClose={() => setEditing(null)} remove={removeAction}>
          {form}
        </EditDialog>
      ) : null}
    </>
  )
}
