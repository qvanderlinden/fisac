/** How long Clerk may take to load before the gate says it isn't reachable. */
export const LOAD_TIMEOUT_MS = 10_000

export type GateView = 'loading' | 'unreachable' | 'signed-out' | 'signed-in'

/** What the gate shows: once Clerk has loaded its answer stands, however late it came. */
export function gateView(isLoaded: boolean, isSignedIn: boolean | undefined, timedOut: boolean): GateView {
  if (!isLoaded) return timedOut ? 'unreachable' : 'loading'
  return isSignedIn ? 'signed-in' : 'signed-out'
}
