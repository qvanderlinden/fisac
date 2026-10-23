import { describe, expect, it } from 'vitest'
import type { ApiError } from './api/types'
import { messageOf } from './errors'

const apiError = (e: Partial<ApiError> & { status: number }): ApiError => ({ message: '', fields: {}, ...e })

describe('messageOf', () => {
  it('gives the first field message of a 422', () => {
    const e = apiError({
      status: 422,
      message: 'Ce libellé existe déjà',
      fields: { label: 'Ce libellé existe déjà', rate: 'Un taux de 0 à 100 %' },
    })
    expect(messageOf(e)).toBe('Ce libellé existe déjà')
  })

  it('counts the pieces that block a delete', () => {
    expect(messageOf(apiError({ status: 409, code: 'in_use', uses: 2, message: 'x' }))).toBe(
      'Porté par 2 pièces : impossible de le supprimer',
    )
    expect(messageOf(apiError({ status: 409, code: 'in_use', uses: 1, message: 'x' }))).toBe(
      'Porté par 1 pièce : impossible de le supprimer',
    )
    expect(messageOf(apiError({ status: 409, code: 'in_use', uses: 0, message: 'Utilisé par d’autres données' }))).toBe(
      'Utilisé par d’autres données',
    )
  })

  it('gives the server detail of another refusal', () => {
    expect(messageOf(apiError({ status: 409, code: 'last_partner', message: 'Il faut au moins un associé' }))).toBe(
      'Il faut au moins un associé',
    )
    expect(messageOf(apiError({ status: 404, message: 'Tiers introuvable' }))).toBe('Tiers introuvable')
  })

  it('asks to retry after a server error', () => {
    expect(messageOf(apiError({ status: 500, message: 'Internal Server Error' }))).toBe(
      'Le serveur a rencontré une erreur. Réessayez dans un instant.',
    )
  })

  it('names an unreachable server in French', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toBe('Le serveur ne répond pas. Réessayez dans un instant.')
  })

  it('passes other errors through', () => {
    expect(messageOf(new Error('Something else'))).toBe('Something else')
    expect(messageOf('plain')).toBe('plain')
  })
})
