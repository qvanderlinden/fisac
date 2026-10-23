import { useState } from 'react'
import { Plus, Search, Tags } from 'lucide-react'
import { Badge, Button, Checkbox, EmptyState, Input, Segment } from '@qvanderlinden/ui'
import type { CategoryDirection, CategoryRead } from '../../api/types'
import { countLabel } from '../../format'
import { listView } from '../../lists/listView'
import { usesLabel } from '../../lists/inUse'
import {
  CATEGORY_COMPARE,
  DIRECTION_TABS,
  displayName,
  matchesCategory,
  tabCount,
  visible,
} from './categoriesList'

/**
 * The mobile list (`MobileCategories` artboard): the direction segments with counts, search,
 * "Montrer les archivées" and the count, one card per category by name and the button that adds one.
 */
export function CategoriesCards({
  rows,
  tab,
  onTab,
  onAdd,
  onOpen,
}: {
  rows: CategoryRead[]
  /** The active tab: a new category is created in its direction. */
  tab: CategoryDirection
  onTab(tab: CategoryDirection): void
  onAdd(): void
  onOpen(id: number): void
}) {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // The whole list on one page: the cards scroll to its end.
  const view = listView(visible(rows, tab, showArchived), {
    query,
    matches: matchesCategory,
    sort: { key: 'label', dir: 'asc' },
    compare: CATEGORY_COMPARE,
    page: 1,
    per: Math.max(1, rows.length),
  })

  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">
          Chaque ligne de vente ou d’achat en porte une : elle dit où elle va dans le résultat
        </span>
        <Segment
          aria-label="Sens"
          options={DIRECTION_TABS.map((t) => ({ value: t.value, label: `${t.label} ${tabCount(rows, t.value)}` }))}
          value={tab}
          onChange={(value) => onTab(value as CategoryDirection)}
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
                {c.archived ? <Badge tone="neutral">archivée</Badge> : null}
              </span>
            </span>
            <span className="numeric flex-none text-sm text-fg-muted">{usesLabel(c.uses)}</span>
          </button>
        ))}
        {view.total === 0 ? <EmptyState icon={Tags} title="Aucune catégorie ne correspond" /> : null}
      </div>

      <Button
        iconLeft={Plus}
        aria-label="Nouvelle catégorie"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
