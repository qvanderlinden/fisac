import { afterEach, describe, expect, it, vi } from 'vitest'
import { messageOf } from '../errors'
import { api, HttpError, setTokenGetter, toApiError } from './client'

describe('the session token', () => {
  const fetchOk = () => {
    const mock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mock)
    return mock
  }
  const headersOf = (mock: ReturnType<typeof fetchOk>) => new Headers(mock.mock.calls[0][1].headers)

  afterEach(() => {
    setTokenGetter(null)
    vi.unstubAllGlobals()
  })

  it('sends the bearer token from the getter', async () => {
    const mock = fetchOk()
    setTokenGetter(async () => 'tok')
    await api.post('/sales', { a: 1 })
    expect(headersOf(mock).get('Authorization')).toBe('Bearer tok')
    expect(headersOf(mock).get('Content-Type')).toBe('application/json')
  })

  it('sends no header without a getter', async () => {
    const mock = fetchOk()
    await api.get('/sales')
    expect(headersOf(mock).has('Authorization')).toBe(false)
  })

  it('sends no header when the getter has no token', async () => {
    const mock = fetchOk()
    setTokenGetter(async () => null)
    await api.get('/sales')
    expect(headersOf(mock).has('Authorization')).toBe(false)
  })

  it('a 401 is an ordinary HttpError', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"detail":"Non authentifié"}', { status: 401 }))
    const error = await api.get('/sales').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(401)
    expect(messageOf(error)).toBe('Non authentifié')
  })

  it('a getter failure reads as the server not responding, and sends nothing', async () => {
    const mock = fetchOk()
    setTokenGetter(async () => {
      throw new Error('ClerkOfflineError')
    })
    const error = await api.get('/sales').catch((e: unknown) => e)
    expect(messageOf(error)).toMatch(/^Le serveur ne répond pas/)
    expect(mock).not.toHaveBeenCalled()
  })
})

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
