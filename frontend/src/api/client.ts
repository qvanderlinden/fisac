import { signInUrl } from '../auth'
import type { ApiError } from './types'

/** A non-2xx response, as an Error (so it keeps a stack) carrying the `ApiError` shape. */
export class HttpError extends Error implements ApiError {
  status: number
  code?: ApiError['code']
  uses?: number
  fields: Record<string, string>

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'HttpError'
    this.status = error.status
    this.code = error.code
    this.uses = error.uses
    this.fields = error.fields
  }
}

type ValidationItem = { loc?: unknown[]; msg?: unknown }

/**
 * The `ApiError` for a response body: 404 and 409 carry a `detail` string
 * (409 adds `code`, and `uses` for in_use), a 422 carries FastAPI's
 * `detail: [{loc, msg, type}]`, read into `fields[loc.at(-1)] = msg`.
 */
export function toApiError(status: number, statusText: string, body: string): ApiError {
  let parsed: { detail?: unknown; code?: unknown; uses?: unknown } = {}
  try {
    const json: unknown = JSON.parse(body)
    if (json && typeof json === 'object') parsed = json
  } catch {
    // Not JSON (a proxy's error page): the status text stands in.
  }
  const fields: Record<string, string> = {}
  let message = typeof parsed.detail === 'string' ? parsed.detail : ''
  if (Array.isArray(parsed.detail)) {
    for (const item of parsed.detail as ValidationItem[]) {
      const key = Array.isArray(item?.loc) ? item.loc.at(-1) : undefined
      if (key === undefined || typeof item.msg !== 'string') continue
      fields[String(key)] = item.msg
      if (message === '') message = item.msg
    }
  }
  const code =
    parsed.code === 'in_use' || parsed.code === 'system' || parsed.code === 'last_partner' ? parsed.code : undefined
  return {
    status,
    ...(code ? { code } : {}),
    ...(typeof parsed.uses === 'number' ? { uses: parsed.uses } : {}),
    message: message || statusText || `Erreur ${status}`,
    fields,
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 401) {
    // The session is gone: sign in again, then come back here. The
    // navigation must leave this origin, since the service worker answers a
    // reload from its cache without asking the server.
    const url = signInUrl(location.href)
    if (url) {
      location.assign(url)
      return new Promise<never>(() => {})
    }
  }
  if (!response.ok) {
    throw new HttpError(toApiError(response.status, response.statusText, await response.text()))
  }
  // A DELETE answers 204 with no body.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  /** A DELETE answers 204, or the parent row (a piece's line). */
  del: <T = void>(path: string) => request<T>('DELETE', path),
}
