import { describe, expect, it, vi } from 'vitest'
import { Trash2 } from 'lucide-react'
import { deleteItem, inUseLabel } from './inUse'

describe('inUseLabel', () => {
  it('says "pièce" for one', () => {
    expect(inUseLabel(1)).toBe('Porté par 1 pièce : impossible de le supprimer')
  })

  it('says "pièces" for more', () => {
    expect(inUseLabel(2)).toBe('Porté par 2 pièces : impossible de le supprimer')
  })
})

describe('deleteItem', () => {
  it('is the danger delete item when nothing carries the row', () => {
    const run = vi.fn()
    expect(deleteItem('Supprimer le tiers', 0, run)).toEqual({ label: 'Supprimer le tiers', icon: Trash2, danger: true, run })
  })

  it('is the disabled in-use line when pieces carry the row', () => {
    const item = deleteItem('Supprimer le tiers', 12, () => {})
    expect(item).toMatchObject({ label: 'Porté par 12 pièces : impossible de le supprimer', icon: Trash2, disabled: true })
    expect(item.danger).toBeUndefined()
  })
})
