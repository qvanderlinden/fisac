import { Menu } from 'lucide-react'
import { IconButton } from '@qvanderlinden/ui'
import { fyLabel, useFiscalYear } from './FiscalYearContext'

/** Classes that turn a ghost IconButton into the 44 px cream glyph of the ink bars. */
export const INK_ICON_BUTTON = 'size-11 text-cream-50 hover:not-disabled:bg-cream-100/6 hover:not-disabled:text-cream-50'

/** The ink bar above a mobile screen (`MobileJournal` artboard): menu button, "fisac · FY2026", the screen's title. */
export function MobileHeader({ title, onOpenMenu }: { title: string; onOpenMenu(): void }) {
  const { current } = useFiscalYear()
  return (
    <header className="sticky top-0 z-10 flex items-center gap-1 bg-surface-inverse px-2 pt-2 pb-3">
      <IconButton icon={Menu} size="lg" label="Ouvrir le menu" onClick={onOpenMenu} className={INK_ICON_BUTTON} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-2xs text-ink-300">{current ? `fisac · ${fyLabel(current)}` : 'fisac'}</span>
        <span className="truncate font-display text-xl leading-tight text-cream-50">{title}</span>
      </div>
    </header>
  )
}
