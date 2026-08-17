import { useMemo } from 'react'
import type { FlowLineCreate, FlowLineRead } from '../api/types'

export interface LineDraft {
  description: string
  amount_net: string
  // Editable alongside net - whichever the user typed last is the "basis" and
  // stays fixed; the other amount (and on VAT change, the non-basis one)
  // re-derives from it. Only net is ever sent to the backend.
  amount_gross: string
  basis: 'net' | 'gross'
  vat_rate: string
}

export function emptyLine(): LineDraft {
  return { description: '', amount_net: '', amount_gross: '', basis: 'net', vat_rate: '21' }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Mirrors the backend's gross computation: net + per-line-rounded VAT.
export function netToGross(net: string, vatRate: string): string {
  const amount = Number(net)
  if (net.trim() === '' || !Number.isFinite(amount)) return ''
  const rate = Number(vatRate)
  const vat = round2((amount * (Number.isFinite(rate) ? rate : 0)) / 100)
  return round2(amount + vat).toFixed(2)
}

export function grossToNet(gross: string, vatRate: string): string {
  const amount = Number(gross)
  if (gross.trim() === '' || !Number.isFinite(amount)) return ''
  const rate = Number(vatRate)
  return round2(amount / (1 + (Number.isFinite(rate) ? rate : 0) / 100)).toFixed(2)
}

// Client-side preview of the totals the backend computes from the lines
// (net + per-line-rounded VAT = gross).
export function linesTotals(lines: { amount_net: string; vat_rate?: string | null }[]): {
  net: number
  vat: number
  gross: number
} {
  let net = 0
  let vat = 0
  for (const line of lines) {
    const amount = Number(line.amount_net)
    const rate = Number(line.vat_rate ?? 0)
    if (!Number.isFinite(amount)) continue
    net += amount
    vat += round2((amount * (Number.isFinite(rate) ? rate : 0)) / 100)
  }
  return { net: round2(net), vat: round2(vat), gross: round2(net + vat) }
}

// Seeds editable drafts from a flow's persisted lines. An empty flow starts
// with one blank line so the editor is never empty. net is authoritative; gross
// is derived for display/editing (see LineDraft).
export function linesToDrafts(lines: FlowLineRead[]): LineDraft[] {
  if (lines.length === 0) return [emptyLine()]
  return lines.map((l) => ({
    description: l.description ?? '',
    amount_net: l.amount_net,
    amount_gross: netToGross(l.amount_net, l.vat_rate),
    basis: 'net' as const,
    vat_rate: l.vat_rate,
  }))
}

// The trim/null normalization applied on submit (drafts with no amount are
// dropped, blank VAT means 0).
export function linesToPayload(lines: LineDraft[]): FlowLineCreate[] {
  return lines
    .filter((l) => l.amount_net.trim() !== '')
    .map((l) => ({
      description: l.description.trim() || null,
      amount_net: l.amount_net,
      vat_rate: l.vat_rate.trim() === '' ? '0' : l.vat_rate,
    }))
}

interface LinesEditorProps {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
}

export function LinesEditor({ lines, onChange }: LinesEditorProps) {
  const totals = useMemo(() => linesTotals(lines), [lines])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  return (
    <div className="lines-editor">
      <div className="lines-editor-header">
        <span>Details</span>
        <button type="button" className="btn-link" onClick={() => onChange([...lines, emptyLine()])}>
          + Add line
        </button>
      </div>
      {lines.map((line, i) => (
        <div className="line-row" key={i}>
          <input
            type="text"
            className="line-desc"
            placeholder="Description"
            value={line.description}
            onChange={(e) => updateLine(i, { description: e.target.value })}
          />
          <span className="line-unit">
            <input
              type="number"
              step="0.01"
              className="line-amount"
              placeholder="0.00"
              value={line.amount_net}
              onChange={(e) =>
                updateLine(i, {
                  amount_net: e.target.value,
                  amount_gross: netToGross(e.target.value, line.vat_rate),
                  basis: 'net',
                })
              }
            />
            net
          </span>
          <span className="line-vat">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
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
            % VAT
          </span>
          <span className="line-unit">
            <input
              type="number"
              step="0.01"
              className="line-amount"
              placeholder="0.00"
              value={line.amount_gross}
              onChange={(e) =>
                updateLine(i, {
                  amount_gross: e.target.value,
                  amount_net: grossToNet(e.target.value, line.vat_rate),
                  basis: 'gross',
                })
              }
            />
            gross
          </span>
          <button
            type="button"
            className="line-remove"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            disabled={lines.length === 1}
            aria-label="Remove line"
          >
            ×
          </button>
        </div>
      ))}
      <div className="lines-totals">
        <span>Net {totals.net.toFixed(2)}</span>
        <span>VAT {totals.vat.toFixed(2)}</span>
        <span className="lines-total-gross">Gross {totals.gross.toFixed(2)}</span>
      </div>
    </div>
  )
}
