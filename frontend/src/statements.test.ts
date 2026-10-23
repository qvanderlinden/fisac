import { describe, expect, it } from 'vitest'
import { nextStatements, statementFor } from './statements'

describe('nextStatements', () => {
  it('lists the statement still open, then the next ones', () => {
    expect(nextStatements(25, 5, '2026-10-22', 3)).toEqual([
      { month: '2026-10', start: '2026-09-26', end: '2026-10-25', payment: '2026-11-05' },
      { month: '2026-11', start: '2026-10-26', end: '2026-11-25', payment: '2026-12-05' },
      { month: '2026-12', start: '2026-11-26', end: '2026-12-25', payment: '2027-01-05' },
    ])
  })

  it('starts with the next month once the closing day has passed', () => {
    expect(nextStatements(25, 5, '2026-10-26', 1)[0].month).toBe('2026-11')
  })

  it('reads day 31 as the last day of the month', () => {
    expect(nextStatements(31, 5, '2027-02-10', 1)).toEqual([
      { month: '2027-02', start: '2027-02-01', end: '2027-02-28', payment: '2027-03-05' },
    ])
  })
})

describe('statementFor', () => {
  it('finds the statement a card purchase falls in, paid the next month', () => {
    expect(statementFor('2026-03-12', 25, 5)).toEqual({ month: '2026-03', start: '2026-02-26', end: '2026-03-25', payment: '2026-04-05' })
    expect(statementFor('2026-03-25', 25, 5).month).toBe('2026-03')
    expect(statementFor('2026-03-26', 25, 5)).toEqual({ month: '2026-04', start: '2026-03-26', end: '2026-04-25', payment: '2026-05-05' })
  })

  it('crosses the year and reads day 31 as the month end', () => {
    expect(statementFor('2026-12-28', 25, 5).payment).toBe('2027-02-05')
    expect(statementFor('2026-12-28', 25, 5).month).toBe('2027-01')
    expect(statementFor('2027-02-10', 31, 31)).toEqual({ month: '2027-02', start: '2027-02-01', end: '2027-02-28', payment: '2027-03-31' })
  })
})
