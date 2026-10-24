import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { Icon } from '@qvanderlinden/ui'
import { api } from '../api/client'
import type { Me } from '../api/types'
import { signOutUrl } from '../auth'
import { displayName, initials } from './displayName'

/** The signed-in account at the foot of the ink sidebar, with the sign-out link. */
export function UserCard() {
  const [me, setMe] = useState<Me>()

  useEffect(() => {
    let live = true
    // A failure leaves the card out: the shell works without it.
    api
      .get<Me>('/me')
      .then((m) => live && setMe(m))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (me === undefined) return null
  const signOut = signOutUrl(location.origin)
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-clay-600 font-mono text-2xs text-cream-50"
      >
        {initials(me)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate type-body-sm text-cream-50" title={me.email}>
          {displayName(me)}
        </span>
        {signOut && (
          <a
            href={signOut}
            className="inline-flex items-center gap-1.5 font-mono text-2xs text-ink-300 hover:text-cream-100"
          >
            <Icon icon={LogOut} size={12} />
            se déconnecter
          </a>
        )}
      </div>
    </div>
  )
}
