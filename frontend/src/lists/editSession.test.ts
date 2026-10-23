import { describe, expect, it, vi } from 'vitest'
import { createSerialQueue } from '../serialQueue'
import { createEditSessions, type EditSessionOptions } from './editSession'

type Row = { id: number; name: string; iban: string | null }
type Fields = { name: string; iban: string | null }

/** A promise settled from the test, to hold a request in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function setup(over: Partial<EditSessionOptions<Row, Fields>['api']> = {}) {
  let nextId = 10
  const calls: string[] = []
  const api = {
    post: vi.fn(async (body: object) => {
      calls.push(`POST ${JSON.stringify(body)}`)
      return { id: nextId++, iban: null, ...body } as Row
    }),
    patch: vi.fn(async (id: number, body: object) => {
      calls.push(`PATCH ${id} ${JSON.stringify(body)}`)
      return { id, name: 'server', iban: null, ...body } as Row
    }),
    del: vi.fn(async (id: number) => {
      calls.push(`DELETE ${id}`)
    }),
    ...over,
  }
  const events = { saved: [] as Row[], deleted: [] as number[], errors: [] as unknown[], created: [] as number[] }
  const sessions = createEditSessions<Row, Fields>({
    api,
    enqueue: createSerialQueue(),
    fields: (row) => ({ name: row?.name ?? '', iban: row?.iban ?? null }),
    patchBody: (patch) => {
      if (patch.name !== undefined && patch.name.trim() === '') return null
      return patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch
    },
    createBody: (local) => (local.name.trim() ? { name: local.name.trim(), iban: local.iban } : null),
    discard: (local) => local.name.trim() === '',
    onSaved: (row) => events.saved.push(row),
    onCreated: (s) => events.created.push(s.id!),
    onDeleted: (ids) => events.deleted.push(...ids),
    onError: (e) => events.errors.push(e),
  })
  return { sessions, api, calls, events }
}

const existing: Row = { id: 1, name: 'Old', iban: null }

describe('createEditSessions', () => {
  it('sends nothing for a new row until it has a name, then POSTs with the values typed so far', async () => {
    const { sessions, calls } = setup()
    const s = sessions.open(null)
    await sessions.save(s, { iban: 'BE68539007547034' })
    expect(calls).toEqual([])
    await sessions.save(s, { name: 'Fiduciaire' })
    expect(calls).toEqual(['POST {"name":"Fiduciaire","iban":"BE68539007547034"}'])
    expect(s.id).toBe(10)
  })

  it('PATCHes, never POSTs again, what is typed while the POST is in flight', async () => {
    const held = deferred<Row>()
    const { sessions, calls, api } = setup({
      post: vi.fn(async (body: object) => {
        calls.push(`POST ${JSON.stringify(body)}`)
        return held.promise
      }),
    })
    const s = sessions.open(null)
    const first = sessions.save(s, { name: 'A' })
    await flush()
    const second = sessions.save(s, { name: 'Ab' })
    held.resolve({ id: 7, name: 'A', iban: null })
    await Promise.all([first, second])
    expect(calls).toEqual(['POST {"name":"A","iban":null}', 'PATCH 7 {"name":"Ab"}'])
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('deletes on close a new row whose name was erased, after its pending saves', async () => {
    const { sessions, calls, events } = setup()
    const s = sessions.open(null)
    await sessions.save(s, { name: 'Temp' })
    void sessions.save(s, { iban: 'NL91ABNA0417164300' })
    void sessions.save(s, { name: '' })
    await sessions.close(s)
    expect(calls).toEqual(['POST {"name":"Temp","iban":null}', 'PATCH 10 {"iban":"NL91ABNA0417164300"}', 'DELETE 10'])
    expect(events.deleted).toEqual([10])
  })

  it('creates nothing for a name erased before its POST could run', async () => {
    const { sessions, calls } = setup()
    const s = sessions.open(null)
    void sessions.save(s, { name: 'Temp' })
    void sessions.save(s, { name: '' })
    await sessions.close(s)
    expect(calls).toEqual([])
  })

  it('keeps on close a new row that still has its name, and never deletes an existing one', async () => {
    const { sessions, calls } = setup()
    const s = sessions.open(null)
    void sessions.save(s, { name: 'Kept' })
    await sessions.close(s)
    const t = sessions.open(existing)
    void sessions.save(t, { name: '' })
    await sessions.close(t)
    expect(calls).toEqual(['POST {"name":"Kept","iban":null}'])
  })

  it('closed during its POST, a row erased meanwhile is deleted once the POST answers', async () => {
    const held = deferred<Row>()
    const { sessions, calls } = setup({
      post: vi.fn(async (body: object) => {
        calls.push(`POST ${JSON.stringify(body)}`)
        return held.promise
      }),
    })
    const s = sessions.open(null)
    void sessions.save(s, { name: 'X' })
    await flush()
    void sessions.save(s, { name: '' })
    const closed = sessions.close(s)
    expect(calls).toEqual(['POST {"name":"X","iban":null}'])
    held.resolve({ id: 4, name: 'X', iban: null })
    await closed
    expect(calls).toEqual(['POST {"name":"X","iban":null}', 'DELETE 4'])
  })

  it('a failed save answers the last value the server confirmed, not the one the row was opened with', async () => {
    let fail = false
    const { sessions, events } = setup({
      patch: vi.fn(async (id: number, body: object) => {
        if (fail) throw new Error('refused')
        return { id, name: 'Old', iban: null, ...body } as Row
      }),
    })
    const s = sessions.open(existing)
    expect(await sessions.save(s, { name: 'Foo' })).toEqual({ ok: true })
    fail = true
    const result = await sessions.save(s, { name: 'Foo2' })
    expect(result).toEqual({ ok: false, server: { name: 'Foo', iban: null } })
    expect(s.local.name).toBe('Foo')
    expect(events.errors).toHaveLength(1)
  })

  it('a failed POST resets the session, so a later IBAN does not create the row with the refused name', async () => {
    let fail = true
    const { sessions, calls } = setup({
      post: vi.fn(async (body: object) => {
        calls.push(`POST ${JSON.stringify(body)}`)
        if (fail) throw new Error('offline')
        return { id: 3, iban: null, ...body } as Row
      }),
    })
    const s = sessions.open(null)
    expect(await sessions.save(s, { name: 'X' })).toEqual({ ok: false, server: { name: '', iban: null } })
    fail = false
    await sessions.save(s, { iban: 'BE68539007547034' })
    expect(calls).toEqual(['POST {"name":"X","iban":null}'])
    expect(s.id).toBeNull()
  })

  it('keeps a value typed after the one that failed', async () => {
    const held = deferred<Row>()
    const { sessions } = setup({ patch: vi.fn(() => held.promise) })
    const s = sessions.open(existing)
    const failing = sessions.save(s, { name: 'A' })
    void sessions.save(s, { name: 'AB' })
    held.reject(new Error('refused'))
    await failing
    expect(s.local.name).toBe('AB')
  })

  it('closes the open session before opening another one', async () => {
    const { sessions, calls } = setup()
    const s = sessions.open(null)
    await sessions.save(s, { name: 'First' })
    void sessions.save(s, { name: '' })
    const t = sessions.open(existing)
    expect(s.closed).toBe(true)
    expect(t.closed).toBe(false)
    await sessions.save(t, { name: 'Renamed' })
    expect(calls).toEqual(['POST {"name":"First","iban":null}', 'DELETE 10', 'PATCH 1 {"name":"Renamed"}'])
  })

  it('removes rows after the saves already sent, and drops the saves of a deleted open row', async () => {
    const { sessions, calls, events } = setup()
    const s = sessions.open(existing)
    const t = { ...existing, id: 2 }
    const other = sessions.open(t)
    await sessions.save(other, { name: 'Saved' })
    const s2 = sessions.open(existing)
    void sessions.save(s2, { name: 'Queued' })
    await sessions.remove([1, 2])
    await sessions.save(s2, { name: 'After' })
    await sessions.close(s2)
    expect(s.closed).toBe(true)
    // The queued rename of row 1 runs after it was marked deleted: dropped, not sent.
    expect(calls).toEqual(['PATCH 2 {"name":"Saved"}', 'DELETE 1', 'DELETE 2'])
    expect(events.deleted).toEqual([1, 2])
  })

  it('reports the first failed deletion and keeps the rows that were deleted', async () => {
    const { sessions, events } = setup({
      del: vi.fn(async (id: number) => {
        if (id === 2) throw new Error('in use')
      }),
    })
    await sessions.remove([1, 2, 3])
    expect(events.deleted).toEqual([1, 3])
    expect(events.errors).toEqual([new Error('in use')])
  })
})
