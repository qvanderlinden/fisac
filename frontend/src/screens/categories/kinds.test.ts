import { describe, expect, it } from 'vitest'
import type { CategoryKind, CategoryRole } from '../../api/types'
import { KINDS, ROLE_SCREENS } from './kinds'

const ALL_KINDS: CategoryKind[] = ['revenue', 'expense', 'tax', 'fixed_asset', 'outside']
const ALL_ROLES: CategoryRole[] = [
  'sales',
  'net_salary',
  'social_contributions',
  'withholding_tax',
  'corporate_tax',
  'card_statement',
  'fixed_asset',
]

describe('KINDS', () => {
  it('has a label, a tone and a hint for every kind', () => {
    for (const k of ALL_KINDS) {
      expect(KINDS[k].label).not.toBe('')
      expect(KINDS[k].tone).not.toBe('')
      expect(KINDS[k].hint).not.toBe('')
    }
  })

  it('names the outside kind "hors résultat"', () => {
    expect(KINDS.outside.label).toBe('hors résultat')
  })
})

describe('ROLE_SCREENS', () => {
  it('names the screen of every role', () => {
    for (const r of ALL_ROLES) expect(ROLE_SCREENS[r]).not.toBe('')
    expect(ROLE_SCREENS.sales).toBe('ventes')
    expect(ROLE_SCREENS.withholding_tax).toBe('rémunération')
    expect(ROLE_SCREENS.card_statement).toBe('décompte Visa')
  })
})
