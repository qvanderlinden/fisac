import { describe, expect, it } from 'vitest'
import { mainView } from './mainView'

const none = { hasYear: false, loading: false, failed: false }

describe('mainView', () => {
  it('opens "/" on the first-year step while no year exists, and on the route once one does', () => {
    expect(mainView('/', none)).toBe('open-first-year')
    expect(mainView('/', { ...none, hasYear: true })).toBe('outlet')
  })

  it('keeps configuration screens reachable without a year', () => {
    expect(mainView('/societe', none)).toBe('outlet')
    expect(mainView('/moyens-paiement', { ...none, loading: true })).toBe('outlet')
  })

  it('needs a year on other routes', () => {
    expect(mainView('/ventes', none)).toBe('open-first-year')
    expect(mainView('/ventes', { ...none, loading: true })).toBe('loading')
    expect(mainView('/ventes', { ...none, failed: true })).toBe('error')
  })
})
