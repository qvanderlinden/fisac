import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { X } from 'lucide-react'
import { Callout, IconButton, Logo, SidebarNav, cn, type SidebarItem } from '@qvanderlinden/ui'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { FiscalYearSwitcher } from './FiscalYearSwitcher'
import { useFiscalYear } from './FiscalYearContext'
import { INK_ICON_BUTTON, MobileHeader } from './MobileHeader'
import { CONFIGURATION_PATHS, NAV, navItemOf } from './nav'
import { OpenFirstYear } from './OpenFirstYear'

// SidebarNav has no disabled item: an entry of a later slice gets this
// placeholder href, which NavLink renders as an inert, muted span.
const SOON = '#bientot'

const ITEMS: SidebarItem[] = NAV.flatMap((g) => [
  { group: g.group },
  ...g.items.map((i) =>
    i.path
      ? { value: i.path, label: i.label, icon: i.icon, href: i.path }
      : { label: i.label, icon: i.icon, href: SOON, badge: 'bientôt' },
  ),
])

type NavLinkProps = { href: string; className?: string; children?: ReactNode; onClick?: () => void }

/** SidebarNav's `linkAs`: a router link, or the disabled "bientôt" entry. */
function NavLink({ href, className, children, onClick, ...rest }: NavLinkProps) {
  if (href === SOON) {
    return (
      <span
        aria-disabled="true"
        className={cn(className, 'cursor-default text-ink-400 hover:bg-transparent hover:text-ink-400')}
      >
        {children}
      </span>
    )
  }
  return (
    <Link to={href} className={className} onClick={onClick} {...rest}>
      {children}
    </Link>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Logo variant="mark" tone="cream" cell={5} />
      <div className="flex flex-col gap-0.5">
        <span className="font-brand text-md text-cream-50">fisac</span>
        <FiscalYearSwitcher />
      </div>
    </div>
  )
}

function isConfiguration(pathname: string): boolean {
  return CONFIGURATION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** The main area: the route's screen, or the first-year empty state where a year is needed. */
function Main() {
  const { pathname } = useLocation()
  const { current, loading, error } = useFiscalYear()
  if (isConfiguration(pathname) || current) return <Outlet />
  if (loading) return <p className="type-body-sm text-fg-muted">Chargement…</p>
  if (error) {
    return (
      <Callout tone="negative" title="Les exercices n’ont pas pu être chargés.">
        {error.message}
      </Callout>
    )
  }
  return <OpenFirstYear />
}

/** Sidebar (desktop) or header and drawer (mobile) around the route's screen. */
export function AppShell() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const value = navItemOf(pathname)?.path ?? undefined

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  if (!mobile) {
    return (
      <div className="flex min-h-screen bg-surface-page">
        <aside className="sticky top-0 h-screen shrink-0">
          <SidebarNav
            aria-label="Navigation principale"
            tone="ink"
            className="overflow-y-auto"
            header={<Brand />}
            items={ITEMS}
            value={value}
            linkAs={NavLink}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col p-8">
          <Main />
        </main>
      </div>
    )
  }

  const label = navItemOf(pathname)?.label ?? 'fisac'
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <MobileHeader title={label.charAt(0).toUpperCase() + label.slice(1)} onOpenMenu={() => setMenuOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col p-4">
        <Main />
      </main>
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex h-full w-75 flex-col overflow-y-auto bg-surface-inverse shadow-overlay">
            <div className="flex items-center gap-3 pt-4 pr-2 pb-2 pl-6">
              <div className="flex-1">
                <Brand />
              </div>
              <IconButton
                icon={X}
                size="lg"
                label="Fermer le menu"
                onClick={() => setMenuOpen(false)}
                className={INK_ICON_BUTTON}
              />
            </div>
            <SidebarNav
              aria-label="Navigation principale"
              tone="ink"
              className="h-auto w-full flex-1"
              items={ITEMS}
              value={value}
              onChange={() => setMenuOpen(false)}
              linkAs={NavLink}
            />
          </div>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
            className="flex-1 cursor-pointer border-0 bg-scrim"
          />
        </div>
      )}
    </div>
  )
}
