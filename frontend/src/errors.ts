// One readable line for a failed request. api/client.ts throws
// Error(`${status} ${statusText}: ${body}`) on a non-2xx response, and FastAPI
// bodies carry a `detail` (a string, or a list of validation errors).
const API_ERROR = /^(\d{3}) [^:]*: ([\s\S]*)$/

export function httpStatus(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const m = API_ERROR.exec(err.message)
  return m ? Number(m[1]) : null
}

export function describeError(err: unknown): string {
  // fetch() rejects with a TypeError when the server can't be reached at all
  // ("Failed to fetch" in Chrome, "NetworkError…" in Firefox, "Load failed" in Safari).
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return 'Le serveur ne répond pas.'
  }
  if (!(err instanceof Error)) return String(err)
  const m = API_ERROR.exec(err.message)
  if (!m) return err.message
  const [, status, body] = m
  try {
    const detail: unknown = (JSON.parse(body) as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : ''))
        .filter((msg) => msg !== '')
      if (messages.length > 0) return messages.join(' ; ')
    }
  } catch {
    // Not JSON: fall back to the raw body below.
  }
  return body.trim() || `Erreur ${status}`
}

export interface ErrorLeads {
  /** What to do after a 4xx (the request itself was refused). */
  client?: string
  /** What to do after a network failure, a 5xx or anything else. */
  other?: string
}

/** The lead for a refused load or reload: nothing to fix in a field, so reload the page. */
export const RELOAD_LEAD = 'Rechargez la page, puis réessayez.'

const CLIENT_LEAD = 'Vérifiez les champs, puis réessayez.'
const OTHER_LEAD = 'Réessayez dans un instant.'

/**
 * A failure as one French message that says what to do, then quotes the
 * server's own (English) wording: "Réessayez dans un instant. (détail : …)."
 * The lead depends on the HTTP status: a refused request (4xx) asks to check
 * the input, anything else (network, 5xx) asks to retry. The detail loses its
 * trailing stops and spaces so the message ends with exactly one full stop.
 */
export function frameError(err: unknown, leads: ErrorLeads = {}): string {
  const status = httpStatus(err)
  const refused = status !== null && status >= 400 && status < 500
  const lead = refused ? (leads.client ?? CLIENT_LEAD) : (leads.other ?? OTHER_LEAD)
  const detail = describeError(err).replace(/[.\s]+$/, '')
  return detail === '' ? lead : `${lead} (détail : ${detail}).`
}
