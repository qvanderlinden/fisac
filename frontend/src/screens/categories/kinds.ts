import type { ComponentProps } from 'react'
import type { Badge } from '@qvanderlinden/ui'
import type { CategoryKind, CategoryRole } from '../../api/types'

/** A category's type: its badge and what it does to the result (the `Categories` artboard legend). */
export const KINDS: Record<CategoryKind, { label: string; tone: string; hint: string }> = {
  revenue: { label: 'recette', tone: 'positive', hint: 'Augmente le résultat. Les ventes la portent.' },
  expense: {
    label: 'dépense',
    tone: 'warning',
    hint: 'Diminue le résultat. Les achats et la rémunération la portent.',
  },
  tax: { label: 'impôt', tone: 'info', hint: 'Vient en déduction de l’impôt estimé, pas du résultat avant impôt.' },
  fixed_asset: {
    label: 'immobilisation',
    tone: 'info',
    hint: 'Va au registre : c’est l’amortissement qui diminue le résultat.',
  },
  outside: {
    label: 'hors résultat',
    tone: 'neutral',
    hint: 'Change la trésorerie ou l’inventaire, jamais le résultat : TVA, transferts, dettes et créances reprises.',
  },
}

/** The screen that books into a role category by itself: the category keeps its type and cannot be archived or deleted. */
export const ROLE_SCREENS: Record<CategoryRole, string> = {
  sales: 'ventes',
  net_salary: 'rémunération',
  social_contributions: 'rémunération',
  withholding_tax: 'rémunération',
  corporate_tax: 'taxe ISOC',
  card_statement: 'décompte Visa',
  fixed_asset: 'registre',
}

/** The tone of a kind's badge. */
export function kindTone(kind: CategoryKind): ComponentProps<typeof Badge>['tone'] {
  return KINDS[kind].tone as ComponentProps<typeof Badge>['tone']
}
