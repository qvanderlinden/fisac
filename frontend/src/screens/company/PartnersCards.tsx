import { ChevronRight, Plus } from 'lucide-react'
import { Button, Icon } from '@qvanderlinden/ui'
import type { PartnerRead } from '../../api/types'
import { countLabel, eur } from '../../format'
import { sharePercent } from './fiscalYearHint'
import { displayName, totalsOf } from './partners'

/** The partners of the mobile page (`MobileSociete` artboard): one row each, the totals, and the button that adds one. */
export function PartnersCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: PartnerRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const totals = totalsOf(rows)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="type-eyebrow text-fg-muted">associés</span>
        <span className="text-sm text-fg-muted">Qui détient les parts, et ce que chacun a apporté</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line-hairline bg-surface-card">
        {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            title={`Modifier ${displayName(p)}`}
            onClick={() => onOpen(p.id)}
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
          >
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-sm font-medium text-fg-strong">{displayName(p)}</span>
              <span className="font-mono text-2xs text-fg-muted">
                {countLabel(p.shares, 'part', 'parts')} · {sharePercent(p.shares, totals.shares)}
              </span>
            </span>
            <span className="numeric flex-none text-sm font-medium text-fg-strong">{eur(p.contribution)}</span>
            <Icon icon={ChevronRight} size={14} />
          </button>
        ))}
        <div className="flex flex-col gap-1.5 bg-surface-sunken px-4 py-3 text-sm">
          <div className="flex justify-between gap-2 font-semibold text-fg-strong">
            <span>{`Total · ${countLabel(rows.length, 'associé', 'associés')}`}</span>
            <span className="numeric">{eur(totals.contribution)}</span>
          </div>
          <div className="flex justify-between gap-2 text-fg-muted">
            <span>{countLabel(totals.shares, 'part', 'parts')}</span>
            <span className="numeric">{sharePercent(totals.shares, totals.shares)}</span>
          </div>
        </div>
      </div>
      <Button
        iconLeft={Plus}
        aria-label="Nouvel associé"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </section>
  )
}
