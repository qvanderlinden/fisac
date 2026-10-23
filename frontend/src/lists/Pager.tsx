import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@qvanderlinden/ui'

/** The foot of a list card (`Tiers` artboard): "lignes 1–25 sur 30" and the page arrows. */
export function Pager({
  label,
  page,
  pages,
  onPrev,
  onNext,
}: {
  label: string
  page: number
  pages: number
  onPrev(): void
  onNext(): void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-hairline px-4 py-2.5">
      <span className="font-mono text-xs text-fg-muted">{label}</span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} size="sm" label="Page précédente" disabled={page <= 1} onClick={onPrev} />
        <span className="numeric min-w-16 text-center text-xs text-fg-body">
          {page} / {pages}
        </span>
        <IconButton icon={ChevronRight} size="sm" label="Page suivante" disabled={page >= pages} onClick={onNext} />
      </div>
    </div>
  )
}
