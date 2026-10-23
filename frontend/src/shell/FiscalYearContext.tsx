import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { ApiError, FiscalYearRead, NextPeriod } from '../api/types'
import { useResource } from '../hooks/useResource'

export interface FiscalYearState {
  /** Newest first, as the API lists them. */
  years: FiscalYearRead[]
  /** The year picked, or the newest; undefined while loading or with no year yet. */
  current: FiscalYearRead | undefined
  setCurrent(id: number): void
  /** Opens the next year (POST) and picks it. */
  openNext(): Promise<void>
  /** The period `openNext` would open. */
  next: NextPeriod | undefined
  loading: boolean
  error: ApiError | undefined
}

const STORAGE_KEY = 'fisac.fiscalYear'

// localStorage can throw (blocked site data, private windows) or hold junk;
// the app then simply starts on the newest year.
function readStoredId(): number | undefined {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(id) && id > 0 ? id : undefined
  } catch {
    return undefined
  }
}

function storeId(id: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // Not remembered across reloads; nothing else depends on it.
  }
}

const FiscalYearContext = createContext<FiscalYearState | undefined>(undefined)

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const list = useResource<FiscalYearRead[]>('/fiscal-years')
  const nextPeriod = useResource<NextPeriod>('/fiscal-years/next')
  const [picked, setPicked] = useState<number | undefined>(readStoredId)

  const years = useMemo(() => list.data ?? [], [list.data])
  const current = years.find((y) => y.id === picked) ?? years[0]

  const setCurrent = useCallback((id: number) => {
    setPicked(id)
    storeId(id)
  }, [])

  const { setData, reload: reloadYears } = list
  const reloadNextPeriod = nextPeriod.reload
  const openNext = useCallback(async () => {
    const opened = await api.post<FiscalYearRead>('/fiscal-years')
    setData((ys) => [opened, ...ys.filter((y) => y.id !== opened.id)])
    setCurrent(opened.id)
    // The list as the server has it (another tab may have opened one too) and the period after this one.
    await Promise.all([reloadYears(), reloadNextPeriod()])
  }, [setData, setCurrent, reloadYears, reloadNextPeriod])

  const value = useMemo<FiscalYearState>(
    () => ({
      years,
      current,
      setCurrent,
      openNext,
      next: nextPeriod.data,
      loading: list.loading,
      error: list.error,
    }),
    [years, current, setCurrent, openNext, nextPeriod.data, list.loading, list.error],
  )
  return <FiscalYearContext.Provider value={value}>{children}</FiscalYearContext.Provider>
}

export function useFiscalYear(): FiscalYearState {
  const state = useContext(FiscalYearContext)
  if (state === undefined) throw new Error('useFiscalYear needs a FiscalYearProvider')
  return state
}

/** "FY2026": a year is named after the calendar year it ends in. */
export function fyLabel(year: { end_date: string }): string {
  return `FY${year.end_date.slice(0, 4)}`
}
