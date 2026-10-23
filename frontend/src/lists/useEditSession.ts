import { useEffect, useRef, useState } from 'react'
import { toast } from '@qvanderlinden/ui'
import { api } from '../api/client'
import { messageOf } from '../errors'
import { createSerialQueue } from '../serialQueue'
import { createEditSessions, type EditSession, type EditSessionOptions, type SaveResult } from './editSession'

export type { SaveResult } from './editSession'

/** The rules of a screen's rows: see `EditSessionOptions`. */
export type EditRules<T extends { id: number }, F extends object> = Pick<
  EditSessionOptions<T, F>,
  'fields' | 'patchBody' | 'createBody' | 'discard'
>

/** The row open in the form. Pass `save` to the form: it stays bound to this session after it closes. */
export interface Editing<F> {
  key: number
  id: number | null
  isNew: boolean
  save(patch: Partial<F>): Promise<SaveResult<F>>
}

/**
 * `createEditSessions` bound to a screen: requests to `/api{path}`, the answers put in
 * the list through `setData`, failures toasted in French. `close()` hides the form; the
 * session closes (and a new row emptied again is deleted) once the form has unmounted,
 * so the save its unmount flushes is queued first.
 */
export function useEditSession<T extends { id: number }, F extends object>(
  path: string,
  setData: (fn: (rows: T[]) => T[]) => void,
  rules: EditRules<T, F>,
) {
  const latest = useRef({ path, setData, rules })
  latest.current = { path, setData, rules }
  const [editing, setEditing] = useState<(Editing<F> & { session: EditSession<F> }) | null>(null)

  const [sessions] = useState(() =>
    createEditSessions<T, F>({
      api: {
        post: (body) => api.post<T>(latest.current.path, body),
        patch: (id, body) => api.patch<T>(`${latest.current.path}/${id}`, body),
        del: (id) => api.del(`${latest.current.path}/${id}`),
      },
      enqueue: createSerialQueue(),
      fields: (row) => latest.current.rules.fields(row),
      patchBody: (patch) => latest.current.rules.patchBody(patch),
      createBody: (local) => latest.current.rules.createBody(local),
      discard: (local) => latest.current.rules.discard(local),
      onSaved: (row) =>
        latest.current.setData((rows) =>
          rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row],
        ),
      onCreated: (s) => setEditing((e) => (e?.session === s ? { ...e, id: s.id } : e)),
      onDeleted: (ids) => latest.current.setData((rows) => rows.filter((r) => !ids.includes(r.id))),
      onError: (e) => toast(messageOf(e), { tone: 'negative' }),
    }),
  )

  // Passive effects of this component run after the unmounted form's cleanups (its last
  // autosave), so the session closes after that save was queued.
  const shown = useRef<EditSession<F> | null>(null)
  const session = editing?.session ?? null
  useEffect(() => {
    if (shown.current && shown.current !== session) void sessions.close(shown.current)
    shown.current = session
  }, [session, sessions])

  return {
    editing,
    /** Opens the form on a row, or on a new one for null. */
    open(row: T | null) {
      const s = sessions.open(row)
      setEditing({ key: s.key, id: s.id, isNew: s.isNew, session: s, save: (patch) => sessions.save(s, patch) })
    },
    close() {
      setEditing(null)
    },
    /** Deletes rows (after the pending saves); closes the form when its row is among them. */
    remove(ids: number[]): Promise<void> {
      if (editing?.id != null && ids.includes(editing.id)) setEditing(null)
      return sessions.remove(ids)
    },
    /** POSTs a row outside the form, e.g. a duplicate. */
    create(body: object): Promise<void> {
      return sessions.create(body)
    },
  }
}
