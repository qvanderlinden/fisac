import type { DisallowedLineRead, ExemptReason, IsocPrepaymentRead, IsocPrepaymentView, IsocRead, IsocRubric } from '../../api/types'
import { countLabel, eur, formatRate, pluralNoun } from '../../format'

const cents = (value: string) => Math.round(Number(value) * 100)

/** The balance as the screen words it: a negative balance is an excess of advance payments. */
export function balanceLabel(balance: string): 'Solde à payer' | 'Excédent de versements' {
  return cents(balance) < 0 ? 'Excédent de versements' : 'Solde à payer'
}

/** The base before its clamp is negative: the base is brought to zero. */
const isClamped = (isoc: IsocRead) => cents(isoc.before_tax) + cents(isoc.disallowed.total) < 0

/** The base imposable tile's footnote: the disallowed part, or that a loss brought it to zero. */
export function baseFootnote(isoc: IsocRead): string {
  return isClamped(isoc)
    ? `ramenée à zéro · perte de ${eur(-(cents(isoc.before_tax) + cents(isoc.disallowed.total)) / 100)}`
    : `dont ${eur(isoc.disallowed.total)} de dépenses non admises`
}

/** The balance tile's footnote: what the balance is made of (the inventory screen is still to come). */
export function balanceFootnote(balance: string): string {
  return cents(balance) < 0 ? 'versements au-delà de l’impôt estimé' : 'impôt estimé moins les versements payés'
}

export type Condition = 'small_company' | 'minimum_pay' | 'shares_owned'

/** The three conditions of the reduced rate, each worded as met (ticked = met). */
export const conditionLabels: Record<Condition, string> = {
  small_company: 'Petite société',
  minimum_pay: 'Rémunération du dirigeant suffisante',
  shares_owned: 'Pas détenue à 50 % ou plus par une autre société',
}

/** The fiscal-year column each condition is stored in. */
export const conditionFields: Record<Condition, 'isoc_small_company' | 'isoc_minimum_pay' | 'isoc_shares_owned'> = {
  small_company: 'isoc_small_company',
  minimum_pay: 'isoc_minimum_pay',
  shares_owned: 'isoc_shares_owned',
}

export const RUBRICS: IsocRubric[] = ['restaurant', 'car', 'other']

export const rubricLabels: Record<IsocRubric, string> = {
  restaurant: 'Restaurant',
  car: 'Voiture',
  other: 'Autres',
}

/** One row of "Calcul de l’impôt". */
export interface ComputationRow {
  key: string
  label: string
  meta: string
  amount: string
  /** A subtotal or the balance (shaded, bold). */
  total?: boolean
  /** The result before tax opens the Résultat screen. */
  result?: boolean
  /** A disallowed rubric opens its lines. */
  rubric?: IsocRubric
}

const max0 = (n: number) => (n > 0 ? n : 0)

/** From the result before tax to the balance, as the ISOC read computes it. */
export function computationRows(isoc: IsocRead): ComputationRow[] {
  const base = cents(isoc.taxable_base)
  const ceiling = cents(isoc.reduced_ceiling)
  const reduced = formatRate(isoc.reduced_rate)
  const normal = formatRate(isoc.normal_rate)
  const rubrics = RUBRICS.filter((r) => isoc.disallowed[r].lines.length > 0)
  const disallowed: ComputationRow[] =
    rubrics.length > 0
      ? rubrics.map((r) => {
          const lines = isoc.disallowed[r].lines
          const n = lines.length
          return {
            key: `disallowed-${r}`,
            label: `Dépenses non admises — ${rubricLabels[r]}`,
            meta: countLabel(n, 'ligne', 'lignes'),
            amount: isoc.disallowed[r].total,
            rubric: r,
          }
        })
      : [{ key: 'disallowed', label: 'Dépenses non admises', meta: 'aucune', amount: isoc.disallowed.total }]
  const clamped = isClamped(isoc)
  const taxRows: ComputationRow[] = isoc.reduced
    ? [
        {
          key: 'reduced',
          label: `Impôt au taux réduit de ${reduced} sur la tranche jusqu’à ${eur(isoc.reduced_ceiling)}`,
          meta: `${reduced} de ${eur(Math.min(base, ceiling) / 100)}`,
          amount: isoc.tax_reduced,
        },
        {
          key: 'normal',
          label: `Impôt au taux normal de ${normal} sur le surplus`,
          meta: `${normal} de ${eur(max0(base - ceiling) / 100)}`,
          amount: isoc.tax_normal,
        },
      ]
    : [
        { key: 'reduced', label: `Impôt au taux réduit de ${reduced}`, meta: 'non applicable', amount: isoc.tax_reduced },
        {
          key: 'normal',
          label: `Impôt au taux normal de ${normal} sur toute la base`,
          meta: `${normal} de ${eur(isoc.taxable_base)}`,
          amount: isoc.tax_normal,
        },
      ]
  const paid = isoc.prepayments.filter((p) => p.paid && cents(p.amount) > 0).map((p) => `VA${p.number}`)
  return [
    { key: 'before', label: 'Résultat avant impôt', meta: 'selon l’écran Résultat', amount: isoc.before_tax, result: true },
    ...disallowed,
    { key: 'base', label: 'Base imposable', meta: clamped ? 'ramenée à zéro' : '', amount: isoc.taxable_base, total: true },
    ...taxRows,
    { key: 'tax', label: 'Impôt', meta: '', amount: isoc.tax, total: true },
    {
      key: 'majoration',
      label: 'Majoration pour versements insuffisants',
      meta: isoc.majoration.exempt ? 'exonérée' : `${formatRate(isoc.majoration.rate)} de l’impôt moins les bonifications`,
      amount: isoc.majoration.amount,
    },
    { key: 'estimated', label: 'Impôt estimé', meta: '', amount: isoc.estimated_tax, total: true },
    {
      key: 'prepaid',
      label: 'Versements anticipés',
      meta: paid.length > 0 ? `${paid.join(', ')} ${pluralNoun(paid.length, 'payé', 'payés')}` : 'aucun payé',
      amount: cents(isoc.paid_total) === 0 ? isoc.paid_total : `-${isoc.paid_total}`,
    },
    { key: 'balance', label: balanceLabel(isoc.balance), meta: '', amount: isoc.balance, total: true },
  ]
}

export type PrepaymentState = 'payé' | 'planifié' | 'aucun versement'

/** An advance payment with an amount is paid or planned; without one, there is none. */
export function prepaymentState(p: { amount: string; paid: boolean }): PrepaymentState {
  if (cents(p.amount) <= 0) return 'aucun versement'
  return p.paid ? 'payé' : 'planifié'
}

export const STATE_TONE = { payé: 'positive', planifié: 'warning', 'aucun versement': 'neutral' } as const

/** Why the majoration is or is not waived. */
export const exemptReasons: Record<ExemptReason, string> = {
  first_years: 'Pas de majoration : une petite société en est dispensée pendant ses trois premiers exercices.',
  not_small_company: 'Pas de dispense : la société n’est pas une petite société.',
  no_incorporation_date: 'Pas de dispense : la date de constitution n’est pas connue (Structure société).',
  after_first_years: 'Pas de dispense : la société a dépassé ses trois premiers exercices.',
}

/** What an advance payment's bonification column shows. */
export function bonificationText(view: IsocPrepaymentView | undefined): string {
  if (!view || view.quarter === null || view.bonification_rate === null) return '—'
  const rate = `${formatRate(view.bonification_rate)} · ${eur(view.bonification)}`
  return view.quarter === view.number ? rate : `${rate} (compte pour VA${view.quarter})`
}

export type LineTarget = { kind: 'purchase'; id: number } | { kind: 'asset'; id: number }

/** The purchase or fixed asset a disallowed line opens; null when it carries neither. */
export function lineTarget(line: Pick<DisallowedLineRead, 'piece_id' | 'asset_id'>): LineTarget | null {
  if (line.asset_id !== null) return { kind: 'asset', id: line.asset_id }
  if (line.piece_id !== null) return { kind: 'purchase', id: line.piece_id }
  return null
}

/**
 * What ticking or unticking "Payé" sends, decided against the advance payment as the server
 * last answered it (after the saves queued before, a date typed just before included): ticked
 * with no date yet, it is paid on its due date; otherwise only `paid` changes.
 */
export function paidBody(
  paid: boolean,
  latest: Pick<IsocPrepaymentRead, 'payment_date' | 'due_date'>,
): { paid: boolean; payment_date?: string } {
  return paid && !latest.payment_date ? { paid: true, payment_date: latest.due_date } : { paid }
}
