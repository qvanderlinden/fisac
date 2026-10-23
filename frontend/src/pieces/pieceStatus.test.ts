import { describe, expect, it } from 'vitest'
import { reference, statusLabel } from './pieceStatus'

describe('statusLabel', () => {
  it('names each status with a tone', () => {
    expect(statusLabel('paid')).toEqual({ label: 'payée', tone: 'positive' })
    expect(statusLabel('planned')).toEqual({ label: 'planifiée', tone: 'neutral' })
    expect(statusLabel('late')).toEqual({ label: 'en retard', tone: 'negative' })
  })
})

describe('reference', () => {
  it('pads sales and purchases to four digits, assets to three', () => {
    expect(reference('S', 1)).toBe('S-0001')
    expect(reference('A', 12)).toBe('A-0012')
    expect(reference('I', 4)).toBe('I-004')
    expect(reference('S', 12345)).toBe('S-12345')
  })
})
