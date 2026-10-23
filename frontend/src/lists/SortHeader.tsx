import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Icon, cn } from '@qvanderlinden/ui'
import { TableHead } from '@qvanderlinden/ui/primitives'
import type { SortDir } from './listView'

/**
 * A sortable column head (`Tiers` artboard): the label and an arrow, dimmed while
 * another column sorts. The screen decides which direction a first click picks.
 */
export function SortHeader({
  label,
  active,
  dir,
  onToggle,
  className,
}: {
  label: string
  active: boolean
  dir: SortDir
  onToggle(): void
  /** Width or alignment of the column, e.g. `w-30 text-right`. */
  className?: string
}) {
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 [font:inherit] tracking-[inherit] text-inherit uppercase hover:text-fg-strong focus-visible:rounded-xs"
      >
        {label}
        <span className={cn('inline-flex', !active && 'opacity-40')}>
          <Icon icon={active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown} size={12} />
        </span>
      </button>
    </TableHead>
  )
}
