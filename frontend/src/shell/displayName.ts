import type { Me } from '../api/types'

/** The name to show for the signed-in account; Google may leave any of its names out. */
export function displayName(me: Me): string {
  if (me.name) return me.name
  const parts = [me.given_name, me.family_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : me.email
}

/** One or two letters standing in for the account (the brand has no photographs). */
export function initials(me: Me): string {
  const parts = [me.given_name, me.family_name].filter((p): p is string => Boolean(p))
  const letters = parts.length > 0 ? parts.map((p) => p.charAt(0)) : [me.email.charAt(0)]
  return letters.join('').toUpperCase()
}
