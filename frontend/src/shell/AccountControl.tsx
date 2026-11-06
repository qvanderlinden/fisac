import { useClerk, useUser } from '@clerk/react'
import { LogOut, UserRound } from 'lucide-react'
import { IconButton } from '@qvanderlinden/ui'
import { INK_ICON_BUTTON } from './MobileHeader'

/** The sidebar's footer: who is signed in, their Clerk account page, and signing out. */
export function AccountControl() {
  const { user } = useUser()
  const clerk = useClerk()
  return (
    <div className="flex items-center gap-1">
      <span className="type-body-sm min-w-0 flex-1 truncate text-cream-50">
        {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
      </span>
      <IconButton
        icon={UserRound}
        size="lg"
        label="Mon compte"
        onClick={() => void clerk.redirectToUserProfile()}
        className={INK_ICON_BUTTON}
      />
      <IconButton
        icon={LogOut}
        size="lg"
        label="Se déconnecter"
        onClick={() => void clerk.signOut()}
        className={INK_ICON_BUTTON}
      />
    </div>
  )
}
