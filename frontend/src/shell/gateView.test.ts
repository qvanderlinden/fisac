import { describe, expect, it } from 'vitest'
import { gateView } from './gateView'

describe('gateView', () => {
  it('waits while Clerk loads', () => {
    expect(gateView(false, undefined, false)).toBe('loading')
  })

  it('says so when Clerk never loads', () => {
    expect(gateView(false, undefined, true)).toBe('unreachable')
  })

  it('sends a signed-out visitor to sign in', () => {
    expect(gateView(true, false, false)).toBe('signed-out')
  })

  it('opens the app when signed in', () => {
    expect(gateView(true, true, false)).toBe('signed-in')
  })

  it('lets a late load win over the timeout', () => {
    expect(gateView(true, true, true)).toBe('signed-in')
    expect(gateView(true, false, true)).toBe('signed-out')
  })
})
