import { useState } from 'react'
import { Percent, Plus, Search, X } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Segment } from '@qvanderlinden/ui'
import type { VatSchemeRead } from '../../api/types'
import { countLabel, formatRate } from '../../format'
import { usesLabel } from '../../lists/inUse'
import { listView } from '../../lists/listView'
import {
  SENS_TABS,
  VAT_COMPARE,
  displayName,
  matchesScheme,
  recoverableCell,
  sensRows,
  sensText,
  sensTone,
  type SensTab,
} from './vatSchemesList'

/**
 * The mobile list (`MobileRegimesTva` artboard): the sens segments with counts, search and
 * the count, one card per scheme down to "fin de la liste", and the button that adds one.
 */
export function VatSchemesCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: VatSchemeRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const [tab, setTab] = useState<SensTab>('all')
  const [query, setQuery] = useState('')
  const filtered = query.trim() !== '' || tab !== 'all'

  // The whole list on one page: the cards scroll to its end.
  const view = listView(sensRows(rows, tab), {
    query,
    matches: matchesScheme,
    sort: { key: 'label', dir: 'asc' },
    compare: VAT_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">Le taux d’une ligne et la part de TVA récupérée</span>
        <Segment
          aria-label="Sens"
          options={SENS_TABS.map((t) => ({ value: t.value, label: `${t.label} ${sensRows(rows, t.value).length}` }))}
          value={tab}
          onChange={(value) => setTab(value as SensTab)}
        />
        <Input
          icon={Search}
          aria-label="Chercher un régime"
          placeholder="Chercher un régime"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="font-mono text-xs text-fg-muted">{countLabel(view.total, 'régime', 'régimes')}</span>
          {filtered ? (
            <Button
              variant="ghost"
              iconLeft={X}
              onClick={() => {
                setQuery('')
                setTab('all')
              }}
            >
              Effacer les filtres
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{displayName(s)}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={sensTone(s)}>{sensText(s)}</Badge>
                <span className="numeric text-xs text-fg-muted">{usesLabel(s.uses)}</span>
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-0.5">
              <span className="numeric text-sm font-medium text-fg-strong">{formatRate(s.rate)}</span>
              {s.for_purchases ? (
                <span className="numeric text-2xs text-fg-muted">récup. {recoverableCell(s)}</span>
              ) : null}
            </span>
          </button>
        ))}
        {view.total === 0 ? (
          <EmptyState icon={Percent} title={filtered ? 'Aucun régime ne correspond' : 'Aucun régime pour l’instant'} />
        ) : null}
      </div>

      <div className="px-4 pt-4 pb-24 text-center font-mono text-xs text-fg-muted">
        {view.total ? `fin de la liste · ${countLabel(view.total, 'régime', 'régimes')}` : ''}
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouveau régime"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
