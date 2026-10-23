import { CONFIGURATION_PATHS } from './nav'

export type MainView = 'outlet' | 'loading' | 'error' | 'open-first-year'

/**
 * What the shell's main area shows. Configuration screens work without a
 * fiscal year; every other route, `/` included (the app opens on it), waits
 * for the years and, while none exists, shows the step that opens the first.
 * Once one exists the route renders (`/` then redirects to /societe).
 */
export function mainView(
  pathname: string,
  years: { hasYear: boolean; loading: boolean; failed: boolean },
): MainView {
  if (CONFIGURATION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'outlet'
  if (years.hasYear) return 'outlet'
  if (years.loading) return 'loading'
  if (years.failed) return 'error'
  return 'open-first-year'
}
