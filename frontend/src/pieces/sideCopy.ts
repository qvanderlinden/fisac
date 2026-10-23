import type { PieceRead } from '../api/types'
import type { PieceSide } from './usePieceRefs'

/** The words of a side, for its list, its form and their messages: "vente" / "achat". */
export interface SideCopy {
  /** The title's noun: "Vente", and "Nouvelle vente" while just created. */
  noun: string
  newNoun: string
  prefix: 'S' | 'A'
  /** "vente" / "ventes". */
  one: string
  many: string
  title: string
  subtitle: string
  /** The tiers' role: "Client" / "Fournisseur"; "Tous les clients". */
  tiers: string
  allTiers: string
  search: string
  /** A piece without description: "Vente sans description". */
  untitled: string
  /** "Client · description", or "Vente sans description". */
  describe(piece: Pick<PieceRead, 'third_party_name' | 'description'>): string
  /** "vente sélectionnée" / "ventes sélectionnées". */
  selectedOne: string
  selectedMany: string
  /** The status filter: "Payées ou non", "payées", "planifiées". */
  statusAll: string
  paidMany: string
  plannedMany: string
  markPaid: string
  markUnpaid: string
  markPaidMany: string
  /** What the unpaid rows still bring in / cost: "à recevoir" / "à payer". */
  due: string
  empty: string
  emptyFiltered: string
  /** The toast of "Dupliquer": "Copiée en" / "Copié en". */
  copiedTo: string
  /** "Supprimer la vente". */
  remove: string
  /** What deleting it does, ending "C’est définitif." */
  removeNote: string
  removeManyNote: string
  loadError: string
  openError: string
}

export const SIDE_COPY: Record<PieceSide, SideCopy> = {
  sale: {
    noun: 'Vente',
    newNoun: 'Nouvelle vente',
    prefix: 'S',
    one: 'vente',
    many: 'ventes',
    title: 'Ventes',
    subtitle: 'Le livre des ventes : chaque facture émise, numérotée, avec sa TVA et son paiement',
    tiers: 'Client',
    allTiers: 'Tous les clients',
    search: 'Chercher une description ou un client',
    untitled: 'Vente sans description',
    describe: (p) => [p.third_party_name, p.description].filter(Boolean).join(' · ') || 'Vente sans description',
    selectedOne: 'vente sélectionnée',
    selectedMany: 'ventes sélectionnées',
    statusAll: 'Payées ou non',
    paidMany: 'payées',
    plannedMany: 'planifiées',
    markPaid: 'Marquer comme payée',
    markUnpaid: 'Marquer comme non payée',
    markPaidMany: 'Marquer comme payées',
    due: 'à recevoir',
    empty: 'Aucune vente pour l’instant',
    emptyFiltered: 'Aucune vente ne correspond à ces filtres',
    copiedTo: 'Copiée en',
    remove: 'Supprimer la vente',
    removeNote: 'La vente, ses lignes et son paiement au journal financier sont supprimés. C’est définitif.',
    removeManyNote: 'Ces ventes, leurs lignes et leurs paiements au journal financier sont supprimés. C’est définitif.',
    loadError: 'Les ventes n’ont pas pu être chargées.',
    openError: 'La vente n’a pas pu être ouverte.',
  },
  purchase: {
    noun: 'Achat',
    newNoun: 'Nouvel achat',
    prefix: 'A',
    one: 'achat',
    many: 'achats',
    title: 'Achats',
    subtitle: 'Le livre des achats : chaque facture reçue, classée par catégorie, avec la TVA que l’on récupère',
    tiers: 'Fournisseur',
    allTiers: 'Tous les fournisseurs',
    search: 'Chercher une description ou un fournisseur',
    untitled: 'Achat sans description',
    describe: (p) => [p.third_party_name, p.description].filter(Boolean).join(' · ') || 'Achat sans description',
    selectedOne: 'achat sélectionné',
    selectedMany: 'achats sélectionnés',
    statusAll: 'Payés ou non',
    paidMany: 'payés',
    plannedMany: 'planifiés',
    markPaid: 'Marquer comme payé',
    markUnpaid: 'Marquer comme non payé',
    markPaidMany: 'Marquer comme payés',
    due: 'à payer',
    empty: 'Aucun achat pour l’instant',
    emptyFiltered: 'Aucun achat ne correspond à ces filtres',
    copiedTo: 'Copié en',
    remove: 'Supprimer l’achat',
    removeNote: 'L’achat, ses lignes et son paiement au journal financier sont supprimés. C’est définitif.',
    removeManyNote: 'Ces achats, leurs lignes et leurs paiements au journal financier sont supprimés. C’est définitif.',
    loadError: 'Les achats n’ont pas pu être chargés.',
    openError: 'L’achat n’a pas pu être ouvert.',
  },
}
