import { describe, expect, it } from 'vitest'
import { createLoadCounter } from './useResource'

describe('createLoadCounter', () => {
  it('lets only the latest load land', () => {
    const loads = createLoadCounter()
    const first = loads.start()
    const second = loads.start()
    expect(loads.isLatest(first)).toBe(false)
    expect(loads.isLatest(second)).toBe(true)
  })
})
