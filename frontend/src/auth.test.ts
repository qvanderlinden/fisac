import { describe, expect, it } from 'vitest'
import { authOrigin, signInUrl, signOutUrl } from './auth'

describe('authOrigin', () => {
  it('is the auth subdomain of the parent domain', () => {
    expect(authOrigin('fisac.quentinvanderlinden.dev')).toBe('https://auth.quentinvanderlinden.dev')
  })

  it('is undefined without a parent domain', () => {
    expect(authOrigin('localhost')).toBeUndefined()
    expect(authOrigin('127.0.0.1')).toBeUndefined()
    expect(authOrigin('quentinvanderlinden.dev')).toBeUndefined()
  })
})

describe('signInUrl and signOutUrl', () => {
  it('send back to the page asked for', () => {
    expect(signInUrl('https://fisac.quentinvanderlinden.dev/ventes?x=1')).toBe(
      'https://auth.quentinvanderlinden.dev/oauth2/start?rd=https%3A%2F%2Ffisac.quentinvanderlinden.dev%2Fventes%3Fx%3D1',
    )
    expect(signOutUrl('https://fisac.quentinvanderlinden.dev')).toBe(
      'https://auth.quentinvanderlinden.dev/oauth2/sign_out?rd=https%3A%2F%2Ffisac.quentinvanderlinden.dev',
    )
  })

  it('are undefined in local development', () => {
    expect(signInUrl('http://localhost:5173/ventes')).toBeUndefined()
    expect(signOutUrl('http://localhost:5173')).toBeUndefined()
  })
})
