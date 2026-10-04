import { describe, expect, it } from 'vitest'
import { describeError, frameError, httpStatus } from './errors'

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

describe('frameError', () => {
  it('asks to check the fields after a client error, quoting the server detail', () => {
    const err = apiError(422, 'Unprocessable Entity', '{"detail":"Name is required."}')
    expect(frameError(err)).toBe('Vérifiez les champs, puis réessayez. (détail : Name is required).')
  })

  it('asks to retry after a server error', () => {
    expect(frameError(apiError(500, 'Internal Server Error', 'boom'))).toBe(
      'Réessayez dans un instant. (détail : boom).',
    )
  })

  it('asks to retry when the server cannot be reached', () => {
    expect(frameError(new TypeError('Failed to fetch'))).toBe(
      'Réessayez dans un instant. (détail : Le serveur ne répond pas).',
    )
  })

  it('treats an error that is not an API error like a server error', () => {
    expect(frameError(new Error('Something else'))).toBe('Réessayez dans un instant. (détail : Something else).')
  })

  it('trims the detail so no full stop is doubled and the message ends with exactly one', () => {
    const message = frameError(apiError(409, 'Conflict', '{"detail":"Already exists. . \\n"}'))
    expect(message).toBe('Vérifiez les champs, puis réessayez. (détail : Already exists).')
    expect(message).not.toContain('..')
    expect(message.endsWith(').')).toBe(true)
  })

  it('drops the detail when nothing is left of it', () => {
    expect(frameError(new Error(''))).toBe('Réessayez dans un instant.')
    expect(frameError(new Error('...'))).toBe('Réessayez dans un instant.')
  })

  it('uses the caller\'s lead sentences instead of the defaults', () => {
    const leads = { client: 'Rechargez la page, puis réessayez.', other: 'Vérifiez que l’API tourne.' }
    expect(frameError(apiError(404, 'Not Found', '{"detail":"Gone"}'), leads)).toBe(
      'Rechargez la page, puis réessayez. (détail : Gone).',
    )
    expect(frameError(new TypeError('Failed to fetch'), leads)).toBe(
      'Vérifiez que l’API tourne. (détail : Le serveur ne répond pas).',
    )
  })
})
