import {
  ArrowDownLeft,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Landmark,
  Package,
  Percent,
  Receipt,
  Tags,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  /** The route; null for a screen of a later slice, shown disabled ("bientôt"). */
  path: string | null
  label: string
  icon: LucideIcon
  /** Shown to administrators only. */
  adminOnly?: boolean
}

// The sidebar of the canvas's `Main` artboard, in its order and with its
// icons. Labels are lowercase (brand rule for navigation).
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'mouvements',
    items: [
      { path: '/ventes', label: 'ventes', icon: ArrowDownLeft },
      { path: '/achats', label: 'achats', icon: Receipt },
      { path: null, label: 'divers', icon: ArrowLeftRight },
      { path: '/immobilisations', label: 'immobilisations', icon: Package },
      { path: '/journaux', label: 'journaux', icon: BookOpen },
    ],
  },
  { group: 'dirigeant', items: [{ path: null, label: 'rémunération', icon: Banknote }] },
  {
    group: 'taxes',
    items: [
      { path: '/tva', label: 'tva', icon: Percent },
      { path: null, label: 'isoc', icon: Landmark },
    ],
  },
  {
    group: 'clôture',
    items: [
      { path: '/resultat', label: 'résultat', icon: TrendingUp },
      { path: null, label: 'inventaire', icon: ClipboardList },
    ],
  },
  {
    group: 'configuration',
    items: [
      { path: '/societe', label: 'structure société', icon: Building2 },
      { path: null, label: 'inventaire d’ouverture', icon: ClipboardCheck },
      { path: '/tiers', label: 'tiers', icon: Users },
      { path: '/categories', label: 'catégories', icon: Tags },
      { path: '/regimes-tva', label: 'régimes de tva', icon: Percent },
      { path: '/regimes-isoc', label: 'régimes isoc', icon: Landmark },
      { path: '/modeles-amortissement', label: 'modèles d’amortissement', icon: Package },
      { path: '/moyens-paiement', label: 'moyens de paiement', icon: CreditCard },
      { path: '/utilisateurs', label: 'utilisateurs', icon: Users, adminOnly: true },
    ],
  },
]

/** The nav without the entries reserved to administrators, unless `isAdmin`. */
export function visibleNav(isAdmin: boolean): typeof NAV {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) }))
}

/** The routes that work without a fiscal year: the configuration group's. */
export const CONFIGURATION_PATHS: string[] = NAV.filter((g) => g.group === 'configuration').flatMap((g) =>
  g.items.flatMap((i) => (i.path ? [i.path] : [])),
)

/** The nav entry a pathname belongs to. */
export function navItemOf(pathname: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find(
    (i) => i.path !== null && (pathname === i.path || pathname.startsWith(`${i.path}/`)),
  )
}
