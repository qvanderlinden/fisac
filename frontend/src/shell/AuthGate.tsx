import { useEffect, useState, type ReactNode } from 'react'
import { RedirectToSignIn, useAuth } from '@clerk/react'
import { Callout } from '@qvanderlinden/ui'
import { setTokenGetter } from '../api/client'
import { gateView, LOAD_TIMEOUT_MS } from './gateView'

/** Renders the app for a signed-in person only: nothing calls the API before the session is known. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (isLoaded) return
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isLoaded])

  // During render, not in an effect: child effects run before a parent's, so the
  // first screen's fetch would go out without a token.
  setTokenGetter(isSignedIn ? () => getToken() : null)

  switch (gateView(isLoaded, isSignedIn, timedOut)) {
    case 'loading':
      return (
        <main className="min-h-screen bg-surface-page p-8">
          <p className="type-body-sm text-fg-muted">Chargement…</p>
        </main>
      )
    case 'unreachable':
      return (
        <main className="min-h-screen bg-surface-page p-8">
          <Callout tone="negative" title="Le service de connexion ne répond pas.">
            Réessayez dans un instant.
          </Callout>
        </main>
      )
    case 'signed-out':
      return <RedirectToSignIn />
    case 'signed-in':
      return children
  }
}
