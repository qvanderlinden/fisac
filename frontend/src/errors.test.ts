import { describe, expect, it } from 'vitest'
import { describeError, httpStatus } from './errors'

// api/client.ts throws Error(`${status} ${statusText}: ${body}`) on a non-2xx response.
const apiError = (status: number, statusText: string, body: string) =>
  new Error(`${status} ${statusText}: ${body}`)

describe('describeError', () => {
  it('returns the detail string of a FastAPI error body', () => {
    const err = apiError(409, 'Conflict', '{"detail":"Code already exists on this account"}')
    expect(describeError(err)).toBe('Code already exists on this account')
  })

  it('joins the messages of a validation error', () => {
    const body = JSON.stringify({
      detail: [
        { loc: ['body', 'name'], msg: 'String should have at least 1 character' },
        { loc: ['body', 'amount_net'], msg: 'Input should be greater than or equal to 0' },
      ],
    })
    expect(describeError(apiError(422, 'Unprocessable Entity', body))).toBe(
      'String should have at least 1 character ; Input should be greater than or equal to 0',
    )
  })

  it('falls back to the raw body, then to the status', () => {
    expect(describeError(apiError(500, 'Internal Server Error', 'boom'))).toBe('boom')
    expect(describeError(apiError(502, 'Bad Gateway', ''))).toBe('Erreur 502')
  })

  it('names an unreachable server in French', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Le serveur ne répond pas.')
  })

  it('passes other errors through', () => {
    expect(describeError(new Error('Something else'))).toBe('Something else')
    expect(describeError(new TypeError('x is undefined'))).toBe('x is undefined')
    expect(describeError('plain')).toBe('plain')
  })
})

describe('httpStatus', () => {
  it('reads the status of an API error', () => {
    expect(httpStatus(apiError(409, 'Conflict', '{}'))).toBe(409)
  })

  it('is null for anything else', () => {
    expect(httpStatus(new TypeError('Failed to fetch'))).toBeNull()
    expect(httpStatus(null)).toBeNull()
  })
})
