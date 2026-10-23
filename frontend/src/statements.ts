/** A card's monthly statement: the purchases from `start` to `end` are paid on `payment`. */
export interface Statement {
  /** The month the statement closes in, `YYYY-MM`. */
  month: string
  start: string
  end: string
  payment: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** The day of the month, cut to its last day: 31 stands for the end of every month. */
const clamp = (y: number, m: number, d: number) => Math.min(d, daysIn(y, m))

/**
 * The statement of a card still open on `today` (`YYYY-MM-DD`), then the next ones, `count`
 * in all (the `MoyensPaiement` artboard's `statements()`). A statement closes on `closingDay`
 * of its month, starts the day after the previous closing, and is paid on `paymentDay` of
 * the following month. Days run from 1 to 31; 31 is the month's last day.
 */
export function nextStatements(closingDay: number, paymentDay: number, today: string, count: number): Statement[] {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7)) - 1
  const d = Number(today.slice(8, 10))
  if (d > clamp(y, m, closingDay)) [y, m] = m === 11 ? [y + 1, 0] : [y, m + 1]

  const out: Statement[] = []
  for (let i = 0; i < count; i++) {
    const [py, pm] = m === 0 ? [y - 1, 11] : [y, m - 1]
    const startDay = clamp(py, pm, closingDay) + 1
    // The previous closing was its month's last day: the statement starts on the 1st.
    const start = startDay > daysIn(py, pm) ? iso(y, m, 1) : iso(py, pm, startDay)
    const [ny, nm] = m === 11 ? [y + 1, 0] : [y, m + 1]
    out.push({
      month: `${y}-${pad(m + 1)}`,
      start,
      end: iso(y, m, clamp(y, m, closingDay)),
      payment: iso(ny, nm, clamp(ny, nm, paymentDay)),
    })
    ;[y, m] = [ny, nm]
  }
  return out
}

/**
 * The statement a card purchase paid on `day` falls in (the backend's
 * `books/card_statements.statement_for`): it closes on the first `closingDay` from
 * `day` on and is paid by the settlement account on `paymentDay` of the next month.
 */
export function statementFor(day: string, closingDay: number, paymentDay: number): Statement {
  return nextStatements(closingDay, paymentDay, day, 1)[0]
}
