import { describe, expect, it } from 'vitest'
import type { PieceRead } from '../api/types'
import { NO_FILTER, filterPieces, periodOf, periodsOf, quartersOf, totals, unpaidTotal } from './piecesList'

const piece = (id: number, over: Partial<PieceRead> = {}): PieceRead => ({
  id,
  fiscal_year_id: 1,
  number: id,
  kind: 'invoice',
  third_party_id: 1,
  third_party_name: 'Langerman',
  description: `Prestations ${id}`,
  document_date: '2026-01-31',
  booking_date: '2026-01-31',
  payment_method_id: 1,
  payment_date: '2026-02-15',
  paid: true,
  status: 'paid',
  net: '100.00',
  vat: '21.00',
  total: '121.00',
  ...over,
})

describe('filterPieces', () => {
  const rows = [
    piece(1),
    piece(2, { status: 'planned', paid: false }),
    piece(3, { status: 'late', paid: false, third_party_id: 2, third_party_name: 'Fiduciaire' }),
    // Dated in March, booked in April: it belongs to the second quarter.
    piece(4, { document_date: '2026-03-28', booking_date: '2026-04-14', kind: 'credit_note' }),
  ]
  const ids = (f: Partial<typeof NO_FILTER>) => filterPieces(rows, { ...NO_FILTER, ...f }).map((p) => p.id)

  it('keeps every row without a filter', () => {
    expect(ids({})).toEqual([1, 2, 3, 4])
  })

  it('filters on the status', () => {
    expect(ids({ status: 'paid' })).toEqual([1, 4])
    expect(ids({ status: 'planned' })).toEqual([2])
    expect(ids({ status: 'late' })).toEqual([3])
  })

  it('filters on the quarter of the booking date, not the document date', () => {
    expect(ids({ period: '2026-1' })).toEqual([1, 2, 3])
    expect(ids({ period: '2026-2' })).toEqual([4])
    expect(ids({ period: '2025-2' })).toEqual([])
  })

  it('filters on the tiers, the kind and the search text', () => {
    expect(ids({ tiers: 2 })).toEqual([3])
    expect(ids({ kind: 'credit_note' })).toEqual([4])
    expect(ids({ kind: 'invoice' })).toEqual([1, 2, 3])
    expect(ids({ query: 'fidu' })).toEqual([3])
    expect(ids({ query: ' prestations 2 ' })).toEqual([2])
    expect(ids({ query: 'S-0004' })).toEqual([4])
  })
})

describe('the invoice / credit-note filter', () => {
  // Achats: two invoices and a credit note from the same supplier.
  const rows = [
    piece(1, { net: '500.00', vat: '105.00', total: '605.00' }),
    piece(2, { kind: 'credit_note', net: '100.00', vat: '21.00', total: '121.00' }),
    piece(3, { net: '40.00', vat: '8.40', total: '48.40', paid: false, status: 'planned' }),
  ]

  it('keeps the invoices only, or the credit notes only', () => {
    expect(filterPieces(rows, { ...NO_FILTER, kind: 'invoice' }).map((p) => p.id)).toEqual([1, 3])
    expect(filterPieces(rows, { ...NO_FILTER, kind: 'credit_note' }).map((p) => p.id)).toEqual([2])
  })

  it('totals the credit notes shown as negative amounts', () => {
    expect(totals(filterPieces(rows, { ...NO_FILTER, kind: 'credit_note' }))).toEqual({ net: -100, vat: -21, total: -121 })
    expect(totals(filterPieces(rows, { ...NO_FILTER, kind: 'invoice' }))).toEqual({ net: 540, vat: 113.4, total: 653.4 })
  })

  it('combines with the status', () => {
    expect(filterPieces(rows, { ...NO_FILTER, kind: 'invoice', status: 'planned' }).map((p) => p.id)).toEqual([3])
  })
})

describe('the VAT period filter', () => {
  const rows = [
    piece(1, { booking_date: '2026-04-30' }),
    piece(2, { document_date: '2026-04-28', booking_date: '2026-05-02' }),
    piece(3, { booking_date: '2026-06-01' }),
  ]

  it('reads the period of a date as a quarter, or a month under a monthly regime', () => {
    expect(periodOf('2026-05-02', false)).toBe('2026-2')
    expect(periodOf('2026-05-02', true)).toBe('2026-05')
  })

  it('filters on the month of the booking date under a monthly regime', () => {
    const ids = (period: string) => filterPieces(rows, { ...NO_FILTER, period }, true).map((p) => p.id)
    expect(ids('2026-04')).toEqual([1])
    expect(ids('2026-05')).toEqual([2])
    expect(ids('2026-06')).toEqual([3])
  })

  it('lists the months of a fiscal year under a monthly regime, its quarters otherwise', () => {
    const months = periodsOf({ start_date: '2025-07-01', end_date: '2026-06-30' }, true)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ value: '2025-07', label: 'juillet 2025' })
    expect(months[11]).toEqual({ value: '2026-06', label: 'juin 2026' })
    expect(periodsOf({ start_date: '2026-01-01', end_date: '2026-12-31' }, false)).toEqual(
      quartersOf({ start_date: '2026-01-01', end_date: '2026-12-31' }),
    )
  })
})

describe('quartersOf', () => {
  it('lists the calendar quarters a fiscal year touches', () => {
    expect(quartersOf({ start_date: '2026-01-01', end_date: '2026-12-31' })).toEqual([
      { value: '2026-1', label: 'T1 2026' },
      { value: '2026-2', label: 'T2 2026' },
      { value: '2026-3', label: 'T3 2026' },
      { value: '2026-4', label: 'T4 2026' },
    ])
    expect(quartersOf({ start_date: '2025-07-01', end_date: '2026-06-30' }).map((q) => q.label)).toEqual([
      'T3 2025',
      'T4 2025',
      'T1 2026',
      'T2 2026',
    ])
  })
})

describe('totals', () => {
  it('sums the rows, a credit note counting negative once', () => {
    const rows = [
      piece(1, { net: '550.10', vat: '115.52', total: '665.62' }),
      piece(2, { net: '0.20', vat: '0.04', total: '0.24' }),
      piece(3, { kind: 'credit_note', net: '100.00', vat: '21.00', total: '121.00' }),
    ]
    expect(totals(rows)).toEqual({ net: 450.3, vat: 94.56, total: 544.86 })
    expect(totals([])).toEqual({ net: 0, vat: 0, total: 0 })
  })

  it('sums what is still to be paid, signed', () => {
    const rows = [
      piece(1),
      piece(2, { paid: false, status: 'planned', total: '242.00' }),
      piece(3, { paid: false, status: 'late', kind: 'credit_note', total: '12.10' }),
    ]
    expect(unpaidTotal(rows)).toBe(229.9)
  })
})
