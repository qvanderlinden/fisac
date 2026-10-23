import { useState } from 'react'
import { Plus, Search, Tags } from 'lucide-react'
import { Badge, Button, Checkbox, EmptyState, Input, Segment } from '@qvanderlinden/ui'
import type { CategoryRead } from '../../api/types'
import { countLabel } from '../../format'
import { listView } from '../../lists/listView'
import { usesLabel } from '../../lists/inUse'
import {
  KIND_TABS,
  LEGEND_KINDS,
  categoryCompare,
  displayName,
  isTaxed,
  isocCell,
  matchesCategory,
  tabCount,
  vatCell,
  visible,
  type KindTab,
  type SchemeLabels,
} from './categoriesList'
import { KINDS, ROLE_SCREENS, kindTone } from './kinds'

/**
 * The mobile list (`MobileCategories` artboard): the kind segments with counts, search,
 * "Montrer les archivées" and the count, one card per category by name down to the legend
 * of the types, and the button that adds one.
 */
export function CategoriesCards({
  rows,
  labels,
  onAdd,
  onOpen,
}: {
  rows: CategoryRead[]
  labels: SchemeLabels
  onAdd(): void
  onOpen(id: number): void
}) {
  const [tab, setTab] = useState<KindTab>('all')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // The whole list on one page: the cards scroll to its end.
  const view = listView(visible(rows, tab, showArchived), {
    query,
    matches: matchesCategory,
    sort: { key: 'label', dir: 'asc' },
    compare: categoryCompare(labels),
    page: 1,
    per: Math.max(1, rows.length),
  })

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">
          Elles remplacent le plan comptable : chaque pièce et chaque mouvement en porte une, qui dit où il va dans le
          résultat
        </span>
        <Segment
          aria-label="Type"
          options={KIND_TABS.map((t) => ({ value: t.value, label: `${t.label} ${tabCount(rows, t.value)}` }))}
          value={tab}
          onChange={(value) => setTab(value as KindTab)}
        />
        <Input
          icon={Search}
          aria-label="Chercher une catégorie"
          placeholder="Chercher une catégorie"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex min-h-11 items-center justify-between gap-2">
          <Checkbox
            label="Montrer les archivées"
            checked={showArchived}
            onCheckedChange={(checked) => setShowArchived(checked === true)}
          />
          <span className="flex-none font-mono text-xs text-fg-muted">
            {countLabel(view.total, 'catégorie', 'catégories')}
          </span>
        </div>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {view.rows.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpen(c.id)}
            className={`flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2${c.archived ? ' opacity-60' : ''}`}
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{displayName(c)}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={kindTone(c.kind)}>{KINDS[c.kind].label}</Badge>
                {c.role ? <Badge tone="neutral">{ROLE_SCREENS[c.role]}</Badge> : null}
                {c.archived ? <Badge tone="neutral">archivée</Badge> : null}
              </span>
              {isTaxed(c.kind) ? (
                <span className="truncate font-mono text-2xs text-fg-muted">
                  TVA {vatCell(c, labels)} · ISOC {isocCell(c, labels)}
                </span>
              ) : null}
            </span>
            <span className="numeric flex-none text-sm text-fg-muted">{usesLabel(c.uses)}</span>
          </button>
        ))}
        {view.total === 0 ? <EmptyState icon={Tags} title="Aucune catégorie ne correspond" /> : null}
      </div>

      <section className="flex flex-col gap-2 px-4 pt-6 pb-24">
        <span className="type-eyebrow text-fg-muted">les types</span>
        {LEGEND_KINDS.map((k) => (
          <div key={k} className="flex flex-col gap-1.5 rounded-lg border border-line-hairline bg-surface-card px-3.5 py-3">
            <div>
              <Badge tone={kindTone(k)}>{KINDS[k].label}</Badge>
            </div>
            <span className="text-sm text-fg-muted">{KINDS[k].hint}</span>
          </div>
        ))}
      </section>

      <Button
        iconLeft={Plus}
        aria-label="Nouvelle catégorie"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
