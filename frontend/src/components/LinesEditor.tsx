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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function readNumber(text: string): number | null {
  const n = parseNumber(text)
  return Number.isFinite(n) ? n : null
}

// Mirrors the backend's gross computation: net + per-line-rounded VAT.
export function netToGross(net: string, vatRate: string): string {
  const amount = readNumber(net)
  if (amount === null) return ''
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount + round2((amount * rate) / 100)))
}

export function grossToNet(gross: string, vatRate: string): string {
  const amount = readNumber(gross)
  if (amount === null) return ''
  const rate = readNumber(vatRate) ?? 0
  return amountInput(round2(amount / (1 + rate / 100)))
}

// Client-side preview of the totals the backend computes from the lines (net
// + per-line-rounded VAT = gross). Accepts drafts and API lines alike.
export function linesTotals(lines: { amount_net: string; vat_rate?: string | null }[]): {
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
    vat += round2((amount * rate) / 100)
  }
  return { net: round2(net), vat: round2(vat), gross: round2(net + vat) }
}

// Blank is fine (the line is dropped, or the rate is 0); anything else must be
// a readable number in range, or saving would silently drop or reject it.
function amountProblem(text: string): boolean {
  if (text.trim() === '') return false
  const n = readNumber(text)
  return n === null || n < 0
}

function rateProblem(text: string): boolean {
  if (text.trim() === '') return false
  const n = readNumber(text)
  return n === null || n < 0 || n > 100
}

/** False while any line holds an unreadable or out-of-range amount or rate. */
export function linesValid(lines: LineDraft[]): boolean {
  return lines.every(
    (l) => !amountProblem(l.amount_net) && !amountProblem(l.amount_gross) && !rateProblem(l.vat_rate),
  )
}

// Seeds editable drafts from a flow's persisted lines. An empty flow starts
// with one blank line so the editor is never empty. net is authoritative; gross
// is derived for display and editing (see LineDraft).
export function linesToDrafts(lines: FlowLineRead[]): LineDraft[] {
  if (lines.length === 0) return [emptyLine()]
  return lines.map((l) => ({
    description: l.description ?? '',
    amount_net: amountInput(l.amount_net),
    amount_gross: netToGross(l.amount_net, l.vat_rate),
    basis: 'net' as const,
    vat_rate: rateInput(l.vat_rate),
    ledger_account_id: l.ledger_account_id === null ? '' : String(l.ledger_account_id),
  }))
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
}

const GRID =
  'grid grid-cols-[minmax(8rem,1fr)_7rem_5.5rem_7rem_minmax(9rem,1fr)_auto] items-center gap-2'

export function LinesEditor({ lines, onChange, ledgerAccounts }: LinesEditorProps) {
  const totals = useMemo(() => linesTotals(lines), [lines])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const ledgerOptions = [
    { value: UNBOOKED, label: 'Non imputée' },
    ...ledgerAccounts.map((la) => ({ value: String(la.id), label: `${la.code} — ${la.name}` })),
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
                invalid={amountProblem(line.amount_net)}
                value={line.amount_net}
                onChange={(e) =>
                  updateLine(i, {
                    amount_net: e.target.value,
                    amount_gross: netToGross(e.target.value, line.vat_rate),
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
                      ? { vat_rate: e.target.value, amount_net: grossToNet(line.amount_gross, e.target.value) }
                      : { vat_rate: e.target.value, amount_gross: netToGross(line.amount_net, e.target.value) },
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
                    amount_net: grossToNet(e.target.value, line.vat_rate),
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
