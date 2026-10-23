import { describe, expect, it } from 'vitest'
import { toApiError } from './client'

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
