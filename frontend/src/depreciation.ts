import type { DepreciationFirstYear, DepreciationMethod } from './api/types'

/** One year of a depreciation schedule: amounts as API decimals. */
export interface ScheduleRow {
  year: number
  amount: string
  rest: string
}

const DAY = 86_400_000

function decimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** Days from the date to 31 December of its year, both included, at most 365. */
function daysLeft(acquired: string): { year: number; days: number } {
  const [y, m, d] = acquired.split('-').map(Number)
  const days = Math.round((Date.UTC(y, 11, 31) - Date.UTC(y, m - 1, d)) / DAY) + 1
  return { year: y, days: Math.min(365, days) }
}

/**
 * The depreciation of `value` bought on `acquired` (YYYY-MM-DD), in integer cents.
 * The first year counts `days / 365` of a year when prorated, a whole year otherwise.
 * Linear: `value / years` a year, the first year scaled, an extra last row when the
 * first year was partial, the last row takes the remainder. Declining: twice the
 * linear rate on what remains, linear over the remaining life once that gives more,
 * the last row takes the remainder. Not a whole number of years: no rows.
 */
export function schedule(
  value: string,
  acquired: string,
  years: number,
  method: DepreciationMethod,
  firstYear: DepreciationFirstYear,
): ScheduleRow[] {
  if (!Number.isInteger(years) || years < 1) return []
  const total = Math.round(Number(value) * 100)
  const { year, days } = daysLeft(acquired)
  const first = firstYear === 'prorata' ? days : 365
  const out: ScheduleRow[] = []
  let rest = total

  const push = (amount: number) => {
    rest -= amount
    out.push({ year: year + out.length, amount: decimal(amount), rest: decimal(rest) })
  }

  if (method === 'declining') {
    // The remaining life and every part of it are counted in days of a 365-day year.
    let life = years * 365
    let linear = false
    for (let i = 0; rest > 0 && i < years + 2; i++) {
      const part = i === 0 ? first : 365
      let amount: number
      if (life <= part) amount = rest
      else {
        // Linear over the remaining life beats twice the linear rate once life <= years * 365 / 2.
        if (years * 365 >= 2 * life) linear = true
        const share = linear ? rest * part / life : (rest * 2 * part) / (years * 365)
        amount = Math.min(Math.round(share), rest)
      }
      life -= part
      push(amount)
    }
    return out
  }

  const count = first < 365 ? years + 1 : years
  for (let i = 0; i < count && rest > 0; i++) {
    if (i === count - 1) push(rest)
    else push(Math.min(i === 0 ? Math.round((total * first) / (years * 365)) : Math.round(total / years), rest))
  }
  return out
}
