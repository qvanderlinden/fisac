export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

// The last day of each month in a year with no 29 February: the fiscal year ends on the day before its start.
const LAST_DAY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** What a start month means: `7` → `L’exercice court du 1er juillet au 30 juin`. */
export function fiscalYearHint(startMonth: number): string {
  const start = startMonth - 1
  const end = (start + 11) % 12
  return `L’exercice court du 1er ${MONTHS[start]} au ${LAST_DAY[end]} ${MONTHS[end]}`
}

/** A holder's share of the parts, to one decimal: `(1, 3)` → `33,3 %`; a dash while no part is issued. */
export function sharePercent(parts: number, total: number): string {
  if (!total) return '—'
  return `${String(Math.round((parts / total) * 1000) / 10).replace('.', ',')} %`
}
