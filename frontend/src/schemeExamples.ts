// What one line of a scheme gives, for the example panel of the scheme forms: €100
// excluding VAT under a VAT scheme, €100 of expense under an ISOC scheme. Computed in
// integer cents, so no rounding drift and no float formatting.

const RATE = /^(\d{1,3})(?:\.(\d{1,2}))?$/

/** A rate of 0-100 as hundredths of a percent ("21" → 2100); null when it is not one. */
function hundredths(rate: string | null): number | null {
  const m = rate === null ? null : RATE.exec(rate.trim())
  if (!m) return null
  const n = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return n > 10000 ? null : n
}

/** Cents as an API decimal string: 1050 → "10.50". */
function decimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export interface VatExampleRow {
  side: 'sale' | 'purchase'
  /** The VAT of the line. */
  vat: string
  /** A sale: the invoiced total. A purchase: the VAT recovered. */
  second: string
  /** A sale: the revenue. A purchase: the charge. */
  third: string
}

/**
 * The example of a VAT scheme for €100 excluding VAT, one row per side it serves (sale
 * first): a sale gives its VAT, the amount invoiced and the revenue (€100); a purchase
 * its VAT, the part recovered (`vat * recoverable / 100`, to the cent) and the charge
 * (`100 + vat − recovered`). No row for a rate that is not a percentage of 0-100; an
 * absent or unreadable recoverable rate recovers nothing.
 */
export function vatExample(s: {
  rate: string
  recoverable_rate: string | null
  for_sales: boolean
  for_purchases: boolean
}): VatExampleRow[] {
  const rate = hundredths(s.rate)
  if (rate === null) return []
  // €100 = 10 000 cents; a rate in hundredths of a percent is then exactly the VAT in cents.
  const vat = rate
  const rows: VatExampleRow[] = []
  if (s.for_sales) {
    rows.push({ side: 'sale', vat: decimal(vat), second: decimal(10000 + vat), third: decimal(10000) })
  }
  if (s.for_purchases) {
    const share = hundredths(s.recoverable_rate) ?? 0
    const recovered = Math.floor((vat * share + 5000) / 10000)
    rows.push({ side: 'purchase', vat: decimal(vat), second: decimal(recovered), third: decimal(10000 + vat - recovered) })
  }
  return rows
}

/** The example of an ISOC scheme for a €100 expense: the part admitted and the part disallowed. */
export function isocExample(deductibleRate: string): { admitted: string; disallowed: string } {
  const rate = hundredths(deductibleRate)
  if (rate === null) return { admitted: decimal(0), disallowed: decimal(0) }
  return { admitted: decimal(rate), disallowed: decimal(10000 - rate) }
}
