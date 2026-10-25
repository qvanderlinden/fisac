import { UsersAdmin } from '@qvanderlinden/auth-ui'

export function UsersScreen() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-title text-4xl text-fg-strong">Utilisateurs</h1>
      <UsersAdmin apiBase="/api/auth" />
    </div>
  )
}
