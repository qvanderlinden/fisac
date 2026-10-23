import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, Field, Input } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { AvailableLine } from '../../api/types'
import { messageOf } from '../../errors'
import { eur, formatDate } from '../../format'
import { reference } from '../../pieces/pieceStatus'
import { availableQuery } from './fixedAssetsList'

/** "A-0003 · Écran 27 pouces". */
export function lineLabel(l: Pick<AvailableLine, 'purchase_number' | 'description'>): string {
  return `${reference('A', l.purchase_number)} · ${l.description || 'Ligne sans description'}`
}

/** "Magasin informatique · 28 mars 2026 · €289,26". */
export function lineMeta(l: AvailableLine): string {
  return [l.third_party_name, formatDate(l.booking_date, 'full'), eur(l.charge)].filter(Boolean).join(' · ')
}

/**
 * The searchable select of the purchase lines a fixed asset can take over (invoice lines
 * not yet in the register, newest first): searches the piece, the tiers, the description
 * or an amount (typed the French way, sent the API's way). The line picked stands in the
 * field until "Changer".
 */
export function PurchaseLinePicker({
  line,
  onPick,
  onClear,
}: {
  line: AvailableLine | null
  onPick(line: AvailableLine): void
  onClear(): void
}) {
  const [text, setText] = useState('')
  const [options, setOptions] = useState<AvailableLine[] | null>(null)
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    if (line) return
    let live = true
    // Typing pauses for a moment before the search goes out.
    const timer = setTimeout(
      () => {
        const q = availableQuery(text)
        api.get<AvailableLine[]>(`/purchase-lines/available${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(
          (rows) => {
            if (!live) return
            setError(undefined)
            setOptions(rows)
          },
          (e) => live && setError(e),
        )
      },
      text === '' ? 0 : 250,
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [text, line])

  if (line) {
    return (
      <Field label="Ligne d’achat">
        <div className="flex items-center justify-between gap-3 rounded-md border border-line-default bg-surface-sunken px-3 py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-fg-strong">{lineLabel(line)}</span>
            <span className="truncate text-2xs text-fg-muted">{lineMeta(line)}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Changer
          </Button>
        </div>
      </Field>
    )
  }

  return (
    <Field label="Ligne d’achat" error={error ? messageOf(error) : undefined}>
      <div className="flex flex-col gap-2">
        <Input
          icon={Search}
          aria-label="Rechercher une ligne d’achat"
          placeholder="Réf., description, fournisseur ou montant"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <ul
          aria-label="Lignes d’achat disponibles"
          className="m-0 flex max-h-64 list-none flex-col overflow-y-auto rounded-md border border-line-hairline bg-surface-card p-0"
        >
          {(options ?? []).map((l) => (
            <li key={l.id} className="border-b border-line-hairline last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(l)}
                className="flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent px-3 py-2 text-left hover:bg-surface-hover focus-visible:-outline-offset-2"
              >
                <span className="truncate text-sm font-medium text-fg-strong">{lineLabel(l)}</span>
                <span className="truncate text-2xs text-fg-muted">{lineMeta(l)}</span>
              </button>
            </li>
          ))}
          {options === null ? <li className="px-3 py-2 text-sm text-fg-muted">Chargement…</li> : null}
          {options?.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">
              {text.trim() === '' ? 'Aucune ligne d’achat n’attend d’être reprise.' : 'Aucune ligne ne correspond.'}
            </li>
          ) : null}
        </ul>
      </div>
    </Field>
  )
}
