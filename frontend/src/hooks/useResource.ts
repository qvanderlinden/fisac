import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ApiError } from '../api/types'
import { isApiError, messageOf } from '../errors'

export interface Resource<T> {
  data: T | undefined
  error: ApiError | undefined
  loading: boolean
  reload(): Promise<void>
  /** Replaces the loaded data locally (after a PATCH, POST or DELETE answered). */
  setData(fn: (d: T) => T): void
}

/** A network failure or anything else thrown, in the `ApiError` shape (status 0). */
function asApiError(e: unknown): ApiError {
  return isApiError(e) ? e : { status: 0, message: messageOf(e), fields: {} }
}

/**
 * Numbers the loads of one resource: only the answer to the latest one may land, so two
 * overlapping reloads can never leave the older answer on screen.
 */
export function createLoadCounter() {
  let latest = 0
  return {
    /** A new load; its number. */
    start: () => ++latest,
    isLatest: (n: number) => n === latest,
  }
}

/**
 * GETs `/api{path}` and keeps the answer; a null path loads nothing. A new
 * path drops the previous data; an answer for a path no longer asked for, or
 * to a load since overtaken by another, is ignored. A failed reload keeps the
 * data it had (the screen decides how to report the error).
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: ApiError; loading: boolean }>({
    path,
    loading: path !== null,
  })
  const current = useRef(path)
  current.current = path
  const [loads] = useState(createLoadCounter)

  const load = useCallback(async (p: string) => {
    const n = loads.start()
    setState((s) => (s.path === p ? { ...s, loading: true } : { path: p, loading: true }))
    try {
      const data = await api.get<T>(p)
      if (current.current === p && loads.isLatest(n)) setState({ path: p, data, loading: false })
    } catch (e) {
      if (current.current === p && loads.isLatest(n)) setState((s) => ({ ...s, path: p, error: asApiError(e), loading: false }))
    }
  }, [loads])

  useEffect(() => {
    if (path === null) setState({ path: null, loading: false })
    else void load(path)
  }, [path, load])

  const reload = useCallback(async () => {
    if (current.current !== null) await load(current.current)
  }, [load])

  const setData = useCallback((fn: (d: T) => T) => {
    setState((s) => (s.data === undefined ? s : { ...s, data: fn(s.data) }))
  }, [])

  // Until the effect for a new path has run, the state still holds the old one's.
  const fresh = state.path === path
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    loading: fresh ? state.loading : path !== null,
    reload,
    setData,
  }
}
