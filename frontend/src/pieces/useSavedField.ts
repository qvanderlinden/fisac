import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useAutosave } from '../hooks/useAutosave'

/**
 * A text field of a piece that saves itself (on blur, or 500 ms after typing stops).
 * `server` is the stored value as the field shows it. While the field is focused or a
 * typed value is waiting for its answer, what is typed stays; otherwise the field
 * follows `server` (a total recomputed, "Rétablir", another field's answer). A failed
 * save (`save` resolves false) puts the server's value back, unless typed again since.
 */
export function useSavedText(server: string, save: (text: string) => Promise<boolean>) {
  const [text, setText] = useState(server)
  const typed = useRef<string | null>(null)
  const focused = useRef(false)
  const restore = useRef(false)
  const [settled, setSettled] = useState(0)

  useEffect(() => {
    if (typed.current !== null) return
    if (focused.current && !restore.current) return
    restore.current = false
    setText(server)
  }, [server, settled])

  const saver = useAutosave(async (value) => {
    const ok = await save(value)
    if (typed.current !== value) return
    typed.current = null
    if (!ok) restore.current = true
    setSettled((n) => n + 1)
  })

  return {
    value: text,
    onChange(e: ChangeEvent<HTMLInputElement>) {
      typed.current = e.target.value
      setText(e.target.value)
      saver.onChange(e.target.value)
    },
    onFocus() {
      focused.current = true
    },
    onBlur() {
      focused.current = false
      saver.onBlur()
      setSettled((n) => n + 1)
    },
  }
}

/**
 * A pick that saves at once (a select, a checkbox): shows the value picked until the
 * answer, then the server's; a failed save goes back to the server's value.
 */
export function useSavedPick<V>(server: V, save: (value: V) => Promise<boolean>): [V, (value: V) => void] {
  const [picked, setPicked] = useState<{ value: V } | null>(null)
  const last = useRef<{ value: V } | null>(null)

  function pick(value: V) {
    const mine = { value }
    last.current = mine
    setPicked(mine)
    void save(value).then(() => {
      if (last.current === mine) setPicked(null)
    })
  }

  return [picked ? picked.value : server, pick]
}
