import type { ApiError } from './api/types'
import { countLabel } from './format'

/** Anything with the `ApiError` shape, as `api/client.ts` throws it. */
export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ApiError).status === 'number' &&
    typeof (e as ApiError).fields === 'object'
  )
}

const RETRY = 'Réessayez dans un instant.'

/**
 * The French message a toast shows for a failure. The API's own details are
 * French (404, 409, the translated constraints); a 422 shows its first field
 * message, an in-use delete counts the pieces that block it.
 */
export function messageOf(e: unknown): string {
  // fetch() rejects with a TypeError when the server can't be reached at all
  // ("Failed to fetch" in Chrome, "NetworkError…" in Firefox, "Load failed" in Safari).
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) {
    return `Le serveur ne répond pas. ${RETRY}`
  }
  if (isApiError(e)) {
    if (e.status >= 500) return `Le serveur a rencontré une erreur. ${RETRY}`
    if (e.code === 'in_use' && e.uses) {
      return `Porté par ${countLabel(e.uses, 'pièce', 'pièces')} : impossible de le supprimer`
    }
    return Object.values(e.fields)[0] ?? e.message
  }
  if (e instanceof Error) return e.message
  return String(e)
}
