/**
 * The edit sessions of a configuration list: one row open in its form at a time,
 * every field saving itself. Pure (no React), so it is tested with fake requests;
 * `useEditSession` binds it to a screen.
 *
 * A new row is not POSTed when the form opens: the API needs its required fields,
 * so it is created by the first save that makes `createBody` non-null, with every
 * value typed so far, and PATCHed after. Every request goes through one queue, so a
 * save typed while the POST is in flight PATCHes the created row. A new row emptied
 * again (`discard`) is deleted when its session closes, after its pending saves.
 */

export interface EditSession<F> {
  readonly key: number
  /** Null while a new row does not exist yet. */
  id: number | null
  readonly isNew: boolean
  /** The values the server last confirmed; the blank draft until a new row exists. */
  server: F
  /** The latest values handed to `save`, sent or not. */
  local: F
  closed: boolean
  /** Deleted: later saves of the form are dropped. */
  dead: boolean
}

/** A failed save answers the server's values, for the form to put back. */
export type SaveResult<F> = { ok: true } | { ok: false; server: F }

export interface EditSessionOptions<T extends { id: number }, F extends object> {
  api: {
    post(body: object): Promise<T>
    patch(id: number, body: object): Promise<T>
    del(id: number): Promise<void>
  }
  /** Runs the requests one at a time, in order (`createSerialQueue`). */
  enqueue<R>(task: () => Promise<R>): Promise<R>
  /** A row's values as the form edits them; the blank draft for null. */
  fields(row: T | null): F
  /** The PATCH body for the fields typed, or null when they must not be sent (a blank required field). */
  patchBody(patch: Partial<F>): object | null
  /** The POST body of a new row, or null while it lacks what the API requires. */
  createBody(local: F): object | null
  /** Whether a new row left like this is deleted when its form closes. */
  discard(local: F): boolean
  /** The server's answer to a PATCH or POST: put it in the list. */
  onSaved(row: T): void
  /** A new row now exists: `session.id` is set. */
  onCreated(session: EditSession<F>): void
  onDeleted(ids: number[]): void
  onError(e: unknown): void
}

export function createEditSessions<T extends { id: number }, F extends object>(o: EditSessionOptions<T, F>) {
  let keys = 0
  let current: EditSession<F> | null = null

  function accept(s: EditSession<F>, row: T) {
    s.server = o.fields(row)
    o.onSaved(row)
  }

  /** Closes the open session and its delete-if-emptied check; resolves once that check has run. */
  function close(s: EditSession<F>): Promise<void> {
    if (s.closed) return Promise.resolve()
    s.closed = true
    if (current === s) current = null
    if (!s.isNew) return Promise.resolve()
    return o
      .enqueue(async () => {
        if (s.dead || s.id === null || !o.discard(s.local)) return
        await o.api.del(s.id)
        s.dead = true
        o.onDeleted([s.id])
      })
      .catch(o.onError)
  }

  return {
    /** Opens a row, or a new one for null; a session still open is closed first. */
    open(row: T | null): EditSession<F> {
      if (current) void close(current)
      const values = o.fields(row)
      current = {
        key: ++keys,
        id: row?.id ?? null,
        isNew: row === null,
        server: values,
        local: { ...values },
        closed: false,
        dead: false,
      }
      return current
    },

    /**
     * Saves fields of a session. On failure the error is reported, and each field not
     * typed again since goes back to the server's value, in the session as in the answer.
     */
    save(s: EditSession<F>, patch: Partial<F>): Promise<SaveResult<F>> {
      if (s.dead) return Promise.resolve({ ok: true })
      s.local = { ...s.local, ...patch }
      const body = o.patchBody(patch)
      if (body === null) return Promise.resolve({ ok: true })
      return o
        .enqueue(async () => {
          if (s.dead) return
          if (s.id !== null) {
            accept(s, await o.api.patch(s.id, body))
            return
          }
          const create = o.createBody(s.local)
          if (create === null) return // Not creatable yet: these values go with the POST.
          const row = await o.api.post(create)
          s.id = row.id
          accept(s, row)
          o.onCreated(s)
        })
        .then(
          (): SaveResult<F> => ({ ok: true }),
          (e): SaveResult<F> => {
            o.onError(e)
            const local = { ...s.local }
            for (const k of Object.keys(patch) as (keyof F)[]) {
              if (Object.is(local[k], patch[k])) local[k] = s.server[k]
            }
            s.local = local
            return { ok: false, server: s.server }
          },
        )
    },

    close,

    /** Deletes rows after the pending saves; the open one among them stops saving. */
    async remove(ids: number[]): Promise<void> {
      if (current && current.id !== null && ids.includes(current.id)) current.dead = true
      const results = await Promise.allSettled(ids.map((id) => o.enqueue(() => o.api.del(id)).then(() => id)))
      const gone = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (gone.length) o.onDeleted(gone)
      const refused = results.find((r) => r.status === 'rejected')
      if (refused) o.onError(refused.reason)
    },

    /** POSTs a row outside the form (a duplicate), in order with the saves. */
    async create(body: object): Promise<void> {
      try {
        o.onSaved(await o.enqueue(() => o.api.post(body)))
      } catch (e) {
        o.onError(e)
      }
    },
  }
}

export type EditSessions<T extends { id: number }, F extends object> = ReturnType<typeof createEditSessions<T, F>>
