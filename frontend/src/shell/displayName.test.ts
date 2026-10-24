import { describe, expect, it } from 'vitest'
import type { Me } from '../api/types'
import { displayName, initials } from './displayName'

const me: Me = {
  email: 'q@example.com',
  name: 'Quentin Vanderlinden',
  given_name: 'Quentin',
  family_name: 'Vanderlinden',
  picture: null,
}
const nameless: Me = { ...me, name: null, given_name: null, family_name: null }

describe('displayName', () => {
  it('is the full name, else the given and family names, else the e-mail', () => {
    expect(displayName(me)).toBe('Quentin Vanderlinden')
    expect(displayName({ ...me, name: null, family_name: null })).toBe('Quentin')
    expect(displayName({ ...me, name: null })).toBe('Quentin Vanderlinden')
    expect(displayName(nameless)).toBe('q@example.com')
  })
})

describe('initials', () => {
  it('takes the given and family names, else the first letter of the e-mail', () => {
    expect(initials(me)).toBe('QV')
    expect(initials({ ...me, family_name: null })).toBe('Q')
    expect(initials(nameless)).toBe('Q')
  })
})
