/**
 * The shared sign-in service (oauth2-proxy) lives at `auth.` on the app's
 * parent domain: fisac.quentinvanderlinden.dev signs in at
 * auth.quentinvanderlinden.dev. Undefined where there is no such parent
 * (localhost, an IP), which is local development with auth disabled.
 */
export function authOrigin(hostname: string): string | undefined {
  const labels = hostname.split('.')
  if (labels.length < 3 || /^[\d.]+$/.test(hostname)) return undefined
  return `https://auth.${labels.slice(1).join('.')}`
}

/** Where to send the browser to sign in, then back to `href`. */
export function signInUrl(href: string): string | undefined {
  const origin = authOrigin(new URL(href).hostname)
  return origin && `${origin}/oauth2/start?rd=${encodeURIComponent(href)}`
}

/** Signs out of every app on the domain, then back to `origin`. */
export function signOutUrl(origin: string): string | undefined {
  const auth = authOrigin(new URL(origin).hostname)
  return auth && `${auth}/oauth2/sign_out?rd=${encodeURIComponent(origin)}`
}
