import type { PieceStatus } from '../api/types'

export type StatusTone = 'positive' | 'neutral' | 'negative'

/** The badge of a sale ("payée", feminine) or a purchase ("payé"): its label and tone. */
export function statusLabel(
  status: PieceStatus,
  side: 'sale' | 'purchase' = 'sale',
): {
  label: 'payée' | 'planifiée' | 'payé' | 'planifié' | 'en retard'
  tone: StatusTone
} {
  const sale = side === 'sale'
  switch (status) {
    case 'paid':
      return { label: sale ? 'payée' : 'payé', tone: 'positive' }
    case 'planned':
      return { label: sale ? 'planifiée' : 'planifié', tone: 'neutral' }
    case 'late':
      return { label: 'en retard', tone: 'negative' }
  }
}

/** The number as shown: S-0001 for a sale, A-0001 for a purchase, I-001 for a fixed asset. */
export function reference(prefix: 'S' | 'A' | 'I', n: number): string {
  return `${prefix}-${String(n).padStart(prefix === 'I' ? 3 : 4, '0')}`
}
