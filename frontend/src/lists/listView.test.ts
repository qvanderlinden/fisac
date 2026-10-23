import { describe, expect, it } from 'vitest'
import { listView } from './listView'
import { toggleAllIds, toggleId } from './useSelection'

type Row = { id: number; name: string; uses: number }

const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  name: `tiers ${String(i + 1).padStart(2, '0')}`,
  uses: i % 3,
}))

const base = {
  query: '',
  matches: (r: Row, q: string) => r.name.includes(q),
  sort: { key: 'name', dir: 'asc' as const },
  compare: {
    name: (a: Row, b: Row) => a.name.localeCompare(b.name),
    uses: (a: Row, b: Row) => a.uses - b.uses,
  },
  page: 1,
}

describe('listView', () => {
  it('pages by 25: page 2 of 30 rows holds the last 5', () => {
    const v = listView(rows, { ...base, page: 2 })
    expect(v.rows.map((r) => r.id)).toEqual([26, 27, 28, 29, 30])
    expect(v).toMatchObject({ total: 30, page: 2, pages: 2, label: 'lignes 26–30 sur 30' })
  })

  it('labels the first page', () => {
    expect(listView(rows, base).label).toBe('lignes 1–25 sur 30')
  })

  it('clamps a page past the end to the last one', () => {
    const v = listView(rows, { ...base, page: 9 })
    expect(v.page).toBe(2)
    expect(v.rows).toHaveLength(5)
  })

  it('clamps a page below 1 to the first one', () => {
    expect(listView(rows, { ...base, page: 0 }).page).toBe(1)
  })

  it('has one page and "aucune ligne" when empty', () => {
    const v = listView([] as Row[], { ...base, page: 3 })
    expect(v).toEqual({ rows: [], total: 0, page: 1, pages: 1, label: 'aucune ligne' })
  })

  it('filters on the query before paging', () => {
    const v = listView(rows, { ...base, query: 'tiers 2', page: 2 })
    expect(v.total).toBe(10)
    expect(v.pages).toBe(1)
    expect(v.page).toBe(1)
    expect(v.rows.map((r) => r.id)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29])
    expect(v.label).toBe('lignes 1–10 sur 10')
  })

  it('ignores a blank query', () => {
    expect(listView(rows, { ...base, query: '   ' }).total).toBe(30)
  })

  it('reverses the order for desc', () => {
    const v = listView(rows, { ...base, sort: { key: 'name', dir: 'desc' } })
    expect(v.rows[0].id).toBe(30)
    expect(v.rows[24].id).toBe(6)
  })

  it('breaks ties on the first compare key, ascending', () => {
    const shuffled = [...rows].reverse()
    const asc = listView(shuffled, { ...base, sort: { key: 'uses', dir: 'asc' }, per: 30 })
    expect(asc.rows.slice(0, 3).map((r) => r.id)).toEqual([1, 4, 7])
    const desc = listView(shuffled, { ...base, sort: { key: 'uses', dir: 'desc' }, per: 30 })
    expect(desc.rows.slice(0, 3).map((r) => r.id)).toEqual([3, 6, 9])
  })

  it('does not mutate the rows it is given', () => {
    const copy = [...rows].reverse()
    const before = copy.map((r) => r.id)
    listView(copy, base)
    expect(copy.map((r) => r.id)).toEqual(before)
  })
})

describe('selection', () => {
  it('toggles one id in and out', () => {
    const once = toggleId(new Set<number>(), 4)
    expect([...once]).toEqual([4])
    expect([...toggleId(once, 4)]).toEqual([])
  })

  it('selects every id of the page when some are not selected', () => {
    const next = toggleAllIds(new Set([1, 9]), [1, 2, 3])
    expect([...next].sort()).toEqual([1, 2, 3, 9])
  })

  it('clears the page when all of it is selected, keeping other pages', () => {
    const next = toggleAllIds(new Set([1, 2, 3, 9]), [1, 2, 3])
    expect([...next]).toEqual([9])
  })

  it('does nothing for an empty page', () => {
    expect([...toggleAllIds(new Set([9]), [])]).toEqual([9])
  })

  it('returns a new set, leaving the old one alone', () => {
    const old = new Set([1])
    toggleId(old, 2)
    toggleAllIds(old, [3])
    expect([...old]).toEqual([1])
  })
})
