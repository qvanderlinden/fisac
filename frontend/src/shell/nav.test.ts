import { describe, expect, it } from 'vitest'
import { NAV } from './nav'

describe('NAV', () => {
  it('lists the canvas groups and the slice A and B routes enabled', () => {
    expect(NAV.map((g) => g.group)).toEqual(['mouvements', 'dirigeant', 'taxes', 'clôture', 'configuration'])
    expect(NAV.flatMap((g) => g.items).filter((i) => i.path).map((i) => i.path)).toEqual([
      '/ventes',
      '/achats',
      '/immobilisations',
      '/journaux',
      '/tva',
      '/resultat',
      '/societe',
      '/tiers',
      '/categories',
      '/regimes-tva',
      '/regimes-isoc',
      '/modeles-amortissement',
      '/moyens-paiement',
    ])
    expect(NAV.flatMap((g) => g.items).every((i) => i.label === i.label.toLowerCase())).toBe(true)
  })
})
