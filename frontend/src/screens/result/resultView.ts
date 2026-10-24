import type { ResultPieceRead, ResultRead } from '../../api/types'
import { formatNumber } from '../../format'

export type ResultGroup = 'revenue' | 'charges' | 'depreciation'

/** One line of the income statement: a category with its pieces, or an asset with its depreciation. */
export interface ResultRow {
  key: string
  label: string
  /** "3 ventes", "1 achat", "1 immobilisation". */
  count: string
  amount: string
  /** The pieces a category row opens; an asset row has none and opens the asset. */
  pieces?: ResultPieceRead[]
  assetId?: number
  note?: string
}

export interface ResultSection {
  group: ResultGroup
  title: string
  totalLabel: string
  total: string
  rows: ResultRow[]
}

const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** The three sections of the result, in the order the screen shows them. */
export function resultSections(result: ResultRead): ResultSection[] {
  return [
    {
      group: 'revenue',
      title: 'Recettes',
      totalLabel: 'Total des recettes',
      total: result.revenue.total,
      rows: result.revenue.by_category.map((c) => ({
        key: `c${c.category_id}`,
        label: c.label,
        count: count(c.pieces.length, 'vente', 'ventes'),
        amount: c.total,
        pieces: c.pieces,
      })),
    },
    {
      group: 'charges',
      title: 'Dépenses',
      totalLabel: 'Total des dépenses',
      total: result.charges.total,
      rows: result.charges.by_category.map((c) => ({
        key: `c${c.category_id}`,
        label: c.label,
        count: count(c.pieces.length, 'achat', 'achats'),
        amount: c.total,
        pieces: c.pieces,
      })),
    },
    {
      group: 'depreciation',
      title: 'Amortissements',
      totalLabel: 'Total des amortissements',
      total: result.depreciation.total,
      rows: result.depreciation.by_asset.map((a) => ({
        key: `a${a.asset_id}`,
        label: a.description,
        count: a.reference,
        amount: a.amount,
        assetId: a.asset_id,
      })),
    },
  ]
}

/** One of the three rows that close the result: before tax, the estimated tax, after tax. */
export interface ClosingRow {
  key: 'before' | 'tax' | 'after'
  label: string
  amount: string
  /** A total row, shown in bold. */
  total: boolean
  /** Where the row leads: the estimated tax opens the ISOC screen. */
  to?: string
}

/** The rows that close the income statement, in the order the screen shows them. */
export function resultClosing(result: ResultRead): ClosingRow[] {
  return [
    { key: 'before', label: 'Résultat avant impôt', amount: result.result, total: true },
    { key: 'tax', label: 'Impôt des sociétés estimé', amount: result.estimated_tax, total: false, to: '/isoc' },
    { key: 'after', label: 'Résultat de l’exercice', amount: result.after_tax, total: true },
  ]
}

const cents = (value: string) => Math.round(Number(value) * 100)

/** The charges plus the depreciation, added in cents, as an API decimal string. */
export function spendingTotal(result: ResultRead): string {
  const sum = cents(result.charges.total) + cents(result.depreciation.total)
  const abs = Math.abs(sum)
  return `${sum < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** An amount's share of the revenue as "85,1 %"; null when there is no revenue to compare with. */
export function shareOfRevenue(amount: string, revenue: string): string | null {
  const total = Number(revenue)
  if (total === 0) return null
  return `${formatNumber((Number(amount) / total) * 100, { decimals: 1 })} %`
}

/** The side of a piece, from its reference: `S-0001` is a sale, `A-0001` a purchase. */
export function pieceSide(reference: string): 'sale' | 'purchase' | null {
  if (reference.startsWith('S-')) return 'sale'
  if (reference.startsWith('A-')) return 'purchase'
  return null
}
