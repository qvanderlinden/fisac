import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, toApiError } from './client'

describe('toApiError', () => {
  it('reads a 422 into fields keyed by the last loc part', () => {
    const body = JSON.stringify({
      detail: [
        { loc: ['body', 'label'], msg: 'Ce libellé existe déjà', type: 'value_error' },
        { loc: ['body', 'rate'], msg: 'Un taux de 0 à 100 %', type: 'value_error' },
      ],
    })
    expect(toApiError(422, 'Unprocessable Entity', body)).toEqual({
      status: 422,
      message: 'Ce libellé existe déjà',
      fields: { label: 'Ce libellé existe déjà', rate: 'Un taux de 0 à 100 %' },
    })
  })

  it('keeps the code and uses of a 409', () => {
    const body = JSON.stringify({ detail: 'Porté par 3 pièce(s)', code: 'in_use', uses: 3 })
    expect(toApiError(409, 'Conflict', body)).toEqual({
      status: 409,
      code: 'in_use',
      uses: 3,
      message: 'Porté par 3 pièce(s)',
      fields: {},
    })
  })

  it('falls back to the status text when the body is not JSON', () => {
    expect(toApiError(502, 'Bad Gateway', '<html>')).toEqual({ status: 502, message: 'Bad Gateway', fields: {} })
  })
})

describe('request on a 401', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stub(status: number, href: string) {
    const assign = vi.fn()
    const url = new URL(href)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Authentification requise"}', { status })))
    vi.stubGlobal('location', { href, hostname: url.hostname, origin: url.origin, assign })
    const stored = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
    })
    return assign
  }

  const PENDING = Symbol('pending')
  const settle = (p: Promise<unknown>) =>
    Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(PENDING), 10))])

  it('sends the browser to sign in', async () => {
    const assign = stub(401, 'https://fisac.quentinvanderlinden.dev/ventes')
    expect(await settle(api.get('/company'))).toBe(PENDING)
    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(
      'https://auth.quentinvanderlinden.dev/oauth2/start?rd=https%3A%2F%2Ffisac.quentinvanderlinden.dev%2Fventes',
    )
  })

  it('does not loop: a second 401 within a minute throws HttpError', async () => {
    // The proxy accepts the session but the API refuses it (another client
    // ID, a clock off): signing in again would bring the same 401 forever.
    const assign = stub(401, 'https://fisac.quentinvanderlinden.dev/ventes')
    expect(await settle(api.get('/company'))).toBe(PENDING)
    await expect(api.get('/company')).rejects.toMatchObject({ name: 'HttpError', status: 401 })
    expect(assign).toHaveBeenCalledOnce()
  })

  it('throws HttpError when there is no auth origin', async () => {
    const assign = stub(401, 'http://localhost:5173/ventes')
    await expect(api.get('/company')).rejects.toMatchObject({ name: 'HttpError', status: 401 })
    expect(assign).not.toHaveBeenCalled()
  })

  it('still throws HttpError on a 404', async () => {
    const assign = stub(404, 'https://fisac.quentinvanderlinden.dev/ventes')
    await expect(api.get('/company')).rejects.toMatchObject({ name: 'HttpError', status: 404 })
    expect(assign).not.toHaveBeenCalled()
  })
})
