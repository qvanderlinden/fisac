import { useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, IconButton, Input, Select } from '@qvanderlinden/ui'
import type { FlowLineCreate, FlowLineRead, LedgerAccountRead } from '../api/types'
import { amountInput, eur, parseDecimal, parseNumber, rateInput } from '../format'

export interface LineDraft {
  description: string
  // Amounts and rate hold the text as typed: comma or dot decimals, read with
  // parseNumber. Whichever of net and gross was typed last is the "basis" and
  // stays fixed; the other re-derives from it (and from the rate when the rate
  // changes). Only net is ever sent to the backend.
  amount_net: string
  amount_gross: string
  basis: 'net' | 'gross'
  vat_rate: string
  // '' means unbooked. Converted to null on submit.
  ledger_account_id: string
}

// Radix Select values can't be empty strings; this stands for "no ledger account".
const UNBOOKED = 'none'

export function emptyLine(): LineDraft {
  return { description: '', amount_net: '', amount_gross: '', basis: 'net', vat_rate: '21', ledger_account_id: '' }
}

// Half-up to the cent like the backend's ROUND_HALF_UP; the 1e-9 absorbs float
// noise (4,10 x 15 / 100 is 0.6149999999999999, not the tie 0,615 it is).
function round2(n: number): number {
  return Math.round(n * 100 + 1e-9) / 100
}

// One line's VAT, in euros: net x rate % rounded to the cent. Working in
// hundredths (net * rate) keeps the tie 21,50 x 21 % = 4,515 exactly on x.5.
function lineVat(net: number, rate: number): number {
  return Math.round(net * rate + 1e-9) / 100
}

function readNumber(text: string): number | null {
  const n = parseNumber(text)
  return Number.isFinite(n) ? n : null
}

// Mirrors the backend's gross computation: net + per-line-rounded VAT. On a
// reverse charge flow no VAT is paid, so the gross is the net (the VAT stays
// notional, see linesTotals).
export function netToGross(net: string, vatRate: string, reverseCharge = false): string {
  const amount = readNumber(net)
  if (amount === null) return ''
  if (reverseCharge) return amountInput(round2(amount))
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount + lineVat(amount, rate)))
}

export function grossToNet(gross: string, vatRate: string, reverseCharge = false): string {
  const amount = readNumber(gross)
  if (amount === null) return ''
  if (reverseCharge) return amountInput(round2(amount))
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount / (1 + rate / 100)))
}

// Client-side preview of the totals the backend computes from the lines (net
// + per-line-rounded VAT = gross; on a reverse charge flow gross = net while
// the notional VAT is still reported). Accepts drafts and API lines alike.
export function linesTotals(
  lines: { amount_net: string; vat_rate?: string | null }[],
  reverseCharge = false,
): {
  net: number
  vat: number
  gross: number
} {
  let net = 0
  let vat = 0
  for (const line of lines) {
    const amount = readNumber(line.amount_net)
    if (amount === null) continue
    const rate = readNumber(line.vat_rate ?? '0') ?? 0
    net += amount
    vat += lineVat(amount, rate)
  }
  return { net: round2(net), vat: round2(vat), gross: round2(reverseCharge ? net : net + vat) }
}

// The backend stores a net as Numeric(12,2): ten billion and up is rejected.
const MAX_NET = 10_000_000_000

// Blank is fine (the line is dropped, or the rate is 0); anything else must be
// what linesToPayload will read through parseDecimal (so no third decimal), and
// in range, or saving would silently drop, round or reject it. The gross is
// only ever a means to a net, so the column limit applies to the net alone.
function amountProblem(text: string, max = Infinity): boolean {
  if (text.trim() === '') return false
  const d = parseDecimal(text)
  return d === null || Number(d) < 0 || Number(d) >= max
}

function rateProblem(text: string): boolean {
  if (text.trim() === '') return false
  const d = parseDecimal(text)
  return d === null || Number(d) < 0 || Number(d) > 100
}

/** False while any line holds an unreadable or out-of-range amount or rate. */
export function linesValid(lines: LineDraft[]): boolean {
  return lines.every(
    (l) => !amountProblem(l.amount_net, MAX_NET) && !amountProblem(l.amount_gross) && !rateProblem(l.vat_rate),
  )
}

// Seeds editable drafts from a flow's persisted lines. An empty flow starts
// with one blank line so the editor is never empty. net is authoritative; gross
// is derived for display and editing (see LineDraft).
export function linesToDrafts(lines: FlowLineRead[], reverseCharge = false): LineDraft[] {
  if (lines.length === 0) return [emptyLine()]
  return lines.map((l) => ({
    description: l.description ?? '',
    amount_net: amountInput(l.amount_net),
    amount_gross: netToGross(l.amount_net, l.vat_rate, reverseCharge),
    basis: 'net' as const,
    vat_rate: rateInput(l.vat_rate),
    ledger_account_id: l.ledger_account_id === null ? '' : String(l.ledger_account_id),
  }))
}

// Re-derives the gross-side of each draft after the flow's reverse-charge flag
// flipped, without reseeding: in-progress edits (descriptions, accounts, typed
// amounts) are kept. Like a rate change, the side typed last (the basis) stays
// fixed and the other follows. Returns the same array when nothing changes.
export function rebaseLinesForReverseCharge(lines: LineDraft[], reverseCharge: boolean): LineDraft[] {
  let changed = false
  const next = lines.map((l) => {
    const patch: Partial<LineDraft> =
      l.basis === 'gross'
        ? { amount_net: grossToNet(l.amount_gross, l.vat_rate, reverseCharge) }
        : { amount_gross: netToGross(l.amount_net, l.vat_rate, reverseCharge) }
    if ((patch.amount_net ?? l.amount_net) === l.amount_net && (patch.amount_gross ?? l.amount_gross) === l.amount_gross) {
      return l
    }
    changed = true
    return { ...l, ...patch }
  })
  return changed ? next : lines
}

// The normalization applied on submit: lines with no amount are dropped, a
// blank rate means 0, typed numbers become API decimal strings. Check
// linesValid first: an unreadable amount is dropped here like a blank one.
export function linesToPayload(lines: LineDraft[]): FlowLineCreate[] {
  return lines.flatMap((l) => {
    const net = parseDecimal(l.amount_net)
    if (net === null) return []
    return [
      {
        description: l.description.trim() || null,
        amount_net: net,
        vat_rate: parseDecimal(l.vat_rate) ?? '0',
        ledger_account_id: l.ledger_account_id === '' ? null : Number(l.ledger_account_id),
      },
    ]
  })
}

interface LinesEditorProps {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  // The account's chart of accounts, for booking each line.
  ledgerAccounts: LedgerAccountRead[]
  // A reverse charge flow pays no VAT: the previewed gross equals the net.
  reverseCharge?: boolean
}

const GRID =
  'grid grid-cols-[minmax(8rem,1fr)_7rem_5.5rem_7rem_minmax(9rem,1fr)_auto] items-center gap-2'

export function LinesEditor({ lines, onChange, ledgerAccounts, reverseCharge = false }: LinesEditorProps) {
  const totals = useMemo(() => linesTotals(lines, reverseCharge), [lines, reverseCharge])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const ledgerOptions = [
    { value: UNBOOKED, label: 'Non imputée' },
    // One wrapper: the Select item is a flex row with a gap, which would pull
    // the code away from its name.
    ...ledgerAccounts.map((la) => ({
      value: String(la.id),
      label: (
        <span>
          <span className="numeric">{la.code}</span> — {la.name}
        </span>
      ),
    })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-[40rem] flex-col gap-2">
          <div className={`${GRID} type-eyebrow text-fg-subtle`}>
            <span>description</span>
            <span className="text-right">net</span>
            <span className="text-right">tva</span>
            <span className="text-right">brut</span>
            <span>compte</span>
            <span className="w-7" />
          </div>
          {lines.map((line, i) => (
            <div className={GRID} key={i}>
              <Input
                size="sm"
                aria-label="Description"
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <Input
                size="sm"
                numeric
                aria-label="Montant net"
                placeholder="0,00"
                invalid={amountProblem(line.amount_net, MAX_NET)}
                value={line.amount_net}
                onChange={(e) =>
                  updateLine(i, {
                    amount_net: e.target.value,
                    amount_gross: netToGross(e.target.value, line.vat_rate, reverseCharge),
                    basis: 'net',
                  })
                }
              />
              <Input
                size="sm"
                numeric
                suffix="%"
                aria-label="Taux de TVA"
                invalid={rateProblem(line.vat_rate)}
                value={line.vat_rate}
                onChange={(e) =>
                  updateLine(
                    i,
                    line.basis === 'gross'
                      ? {
                          vat_rate: e.target.value,
                          amount_net: grossToNet(line.amount_gross, e.target.value, reverseCharge),
                        }
                      : {
                          vat_rate: e.target.value,
                          amount_gross: netToGross(line.amount_net, e.target.value, reverseCharge),
                        },
                  )
                }
              />
              <Input
                size="sm"
                numeric
                aria-label="Montant brut"
                placeholder="0,00"
                invalid={amountProblem(line.amount_gross)}
                value={line.amount_gross}
                onChange={(e) =>
                  updateLine(i, {
                    amount_gross: e.target.value,
                    amount_net: grossToNet(e.target.value, line.vat_rate, reverseCharge),
                    basis: 'gross',
                  })
                }
              />
              <Select
                size="sm"
                aria-label="Compte du plan comptable"
                value={line.ledger_account_id === '' ? UNBOOKED : line.ledger_account_id}
                onValueChange={(value) => updateLine(i, { ledger_account_id: value === UNBOOKED ? '' : value })}
                options={ledgerOptions}
              />
              <IconButton
                type="button"
                icon={X}
                size="sm"
                label="Retirer la ligne"
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                disabled={lines.length === 1}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" iconLeft={Plus} onClick={() => onChange([...lines, emptyLine()])}>
          Ajouter une ligne
        </Button>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">net</dt>
            <dd className="numeric text-sm text-fg-body">{eur(totals.net)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">tva</dt>
            <dd className="numeric text-sm text-fg-body">{eur(totals.vat)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="type-eyebrow text-fg-subtle">brut</dt>
            <dd className="numeric text-sm font-medium text-fg-strong">{eur(totals.gross)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
