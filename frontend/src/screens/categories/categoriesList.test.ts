import { describe, expect, it } from 'vitest'
import type { CategoryRead } from '../../api/types'
import { deletable, selectionNote, tabCount, visible } from './categoriesList'

const cat = (id: number, direction: CategoryRead['direction'], uses = 0, archived = false): CategoryRead => ({
  id,
  label: `c${id}`,
  direction,
  archived,
  uses,
})

describe('categoriesList', () => {
  const rows = [cat(1, 'sales'), cat(2, 'purchases', 3), cat(3, 'purchases', 0, true)]

  it('filters by direction and hides the archived ones unless asked', () => {
    expect(visible(rows, 'purchases', false).map((c) => c.id)).toEqual([2])
    expect(visible(rows, 'purchases', true).map((c) => c.id)).toEqual([2, 3])
    expect(tabCount(rows, 'purchases')).toBe(1)
    expect(tabCount(rows, 'sales')).toBe(1)
  })

  it('deletes only unused categories', () => {
    expect(deletable(rows[0])).toBe(true)
    expect(deletable(rows[1])).toBe(false)
    expect(selectionNote([rows[0]])).toBeUndefined()
    expect(selectionNote([rows[1]])).toContain('1 utilisée')
  })
})
