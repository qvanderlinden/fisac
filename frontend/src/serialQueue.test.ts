import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serialQueue'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createSerialQueue', () => {
  it('starts a task only once the previous one has settled, in call order', async () => {
    const enqueue = createSerialQueue()
    const log: string[] = []
    const first = deferred()

    const a = enqueue(async () => {
      log.push('a:start')
      await first.promise
      log.push('a:end')
    })
    const b = enqueue(async () => {
      log.push('b:start')
    })

    await tick()
    expect(log).toEqual(['a:start'])

    first.resolve()
    await Promise.all([a, b])
    expect(log).toEqual(['a:start', 'a:end', 'b:start'])
  })

  it('hands back the task result', async () => {
    const enqueue = createSerialQueue()
    expect(await enqueue(async () => 42)).toBe(42)
  })

  it('rejects the failed task but keeps running the ones after it', async () => {
    const enqueue = createSerialQueue()
    const failing = enqueue(async () => {
      throw new Error('boom')
    })
    const after = enqueue(async () => 'still runs')

    await expect(failing).rejects.toThrow('boom')
    expect(await after).toBe('still runs')
  })

  it('queues a task added while another is running behind it', async () => {
    const enqueue = createSerialQueue()
    const log: string[] = []
    const gate = deferred()

    const a = enqueue(async () => {
      await gate.promise
      log.push('a')
    })
    await tick()
    const b = enqueue(async () => {
      log.push('b')
    })
    gate.resolve()
    await Promise.all([a, b])
    expect(log).toEqual(['a', 'b'])
  })
})
