import { useEffect, useMemo, useRef } from 'react'

export interface Autosaver {
  onChange(value: string): void
  onBlur(): void
  /** Sends a pending value now (on blur, on unmount). */
  flush(): void
}

/**
 * Saves the last value typed once typing pauses for `delay` ms, or at once
 * on blur; with `delay` null, on blur only (a date input reports each partial
 * year typed). A value is saved once: a blur after the timer fired sends nothing.
 * `save` reports its own failure (the screens restore the server value and
 * toast `messageOf`), so a rejection is swallowed here.
 */
export function createAutosaver(save: (value: string) => Promise<void>, delay: number | null = 500): Autosaver {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { value: string } | undefined

  function flush() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (pending === undefined) return
    const { value } = pending
    pending = undefined
    save(value).catch(() => undefined)
  }

  return {
    onChange(value) {
      pending = { value }
      if (timer !== undefined) clearTimeout(timer)
      if (delay !== null) timer = setTimeout(flush, delay)
    },
    onBlur: flush,
    flush,
  }
}

/** Autosave for one field: wire `onChange` to the input's typing and `onBlur` to its blur. */
export function useAutosave(
  save: (value: string) => Promise<void>,
  delay: number | null = 500,
): { onChange(value: string): void; onBlur(): void } {
  // The latest `save` is called, so a caller's closure over fresh state never goes stale.
  const saveRef = useRef(save)
  saveRef.current = save
  const saver = useMemo(() => createAutosaver((value) => saveRef.current(value), delay), [delay])
  // A field unmounted mid-typing (a dialog closed) still saves what was typed.
  useEffect(() => () => saver.flush(), [saver])
  return useMemo(() => ({ onChange: saver.onChange, onBlur: saver.onBlur }), [saver])
}
