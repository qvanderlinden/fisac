import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver } from './useAutosave'

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves the last value 500 ms after the last keystroke', () => {
    const save = vi.fn(async (_value: string) => {})
    const saver = createAutosaver(save)
    saver.onChange('a')
    vi.advanceTimersByTime(400)
    saver.onChange('ab')
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save.mock.calls).toEqual([['ab']])
  })

  it('saves at once on blur, and only once', () => {
    const save = vi.fn(async (_value: string) => {})
    const saver = createAutosaver(save)
    saver.onChange('x')
    saver.onBlur()
    vi.advanceTimersByTime(1000)
    saver.onBlur()
    expect(save.mock.calls).toEqual([['x']])
  })

  it('sends nothing on a blur without typing', () => {
    const save = vi.fn(async (_value: string) => {})
    createAutosaver(save).onBlur()
    expect(save).not.toHaveBeenCalled()
  })
})
