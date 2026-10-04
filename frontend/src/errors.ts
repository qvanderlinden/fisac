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
