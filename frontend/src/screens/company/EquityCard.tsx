import { Info } from 'lucide-react'
import { Card, Icon } from '@qvanderlinden/ui'
import type { EquityLineRead } from '../../api/types'
import { eur } from '../../format'

/**
 * The equity at the start of the year, read only (`Societe` and `MobileSociete`
 * artboards): the partners' contributions, then the lines the opening inventory
 * carries for the current fiscal year. Without a year there is the contributions alone.
 */
export function EquityCard({
  title,
  contribution,
  lines,
  mobile,
}: {
  title: string
  /** The partners' total contribution. */
  contribution: number
  /** The current year's lines; undefined while there is no year or they are loading. */
  lines: EquityLineRead[] | undefined
  mobile: boolean
}) {
  const rows = [{ key: 'apport', label: 'Apport', amount: eur(contribution) }].concat(
    (lines ?? []).map((l) => ({ key: String(l.id), label: l.label, amount: eur(l.amount) })),
  )
  const note = (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <Icon icon={Info} size={14} />
      Repris de l’inventaire d’ouverture
    </span>
  )

  if (mobile) {
    return (
      <section className="flex flex-col gap-3">
        <span className="type-eyebrow text-fg-muted">{title.toLowerCase()} · lecture seule</span>
        <div className="flex flex-col rounded-lg border border-line-hairline bg-surface-card">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-line-hairline px-4 py-2 text-sm"
            >
              <span className="text-fg-body">{r.label}</span>
              <span className="numeric flex-none text-fg-strong">{r.amount}</span>
            </div>
          ))}
          <div className="px-4 py-2.5">{note}</div>
        </div>
      </section>
    )
  }

  return (
    <Card title={title} subtitle="Lecture seule">
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex justify-between gap-3 border-b border-line-hairline py-2.5 text-sm"
          >
            <span className="text-fg-body">{r.label}</span>
            <span className="numeric text-fg-strong">{r.amount}</span>
          </div>
        ))}
        <div className="pt-3">{note}</div>
      </div>
    </Card>
  )
}
