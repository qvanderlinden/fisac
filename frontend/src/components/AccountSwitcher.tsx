import { Plus, Settings } from 'lucide-react'
import { IconButton, Select, Tooltip } from '@qvanderlinden/ui'
import type { AccountRead } from '../api/types'
import { eur } from '../format'

interface AccountSwitcherProps {
  accounts: AccountRead[]
  selectedAccountId: number | null
  onSelect: (accountId: number) => void
  /** Opens the account dialog on the selected account. */
  onEdit: () => void
  /** Opens the account dialog on a new account. */
  onCreate: () => void
}

// The account selector at the top of the sidebar (and of the narrow top bar):
// a Select listing every account with its balance, plus edit and create.
export function AccountSwitcher({
  accounts,
  selectedAccountId,
  onSelect,
  onEdit,
  onCreate,
}: AccountSwitcherProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="type-eyebrow text-fg-subtle">compte</span>
        <div className="flex items-center gap-1">
          {selectedAccountId !== null && (
            <Tooltip label="Modifier le compte">
              <IconButton icon={Settings} label="Modifier le compte" size="sm" onClick={onEdit} />
            </Tooltip>
          )}
          <Tooltip label="Nouveau compte">
            <IconButton icon={Plus} label="Nouveau compte" size="sm" onClick={onCreate} />
          </Tooltip>
        </div>
      </div>
      {accounts.length > 0 && (
        <Select
          aria-label="Compte"
          // '' shows the placeholder; Radix Select needs a string either way.
          value={selectedAccountId === null ? '' : String(selectedAccountId)}
          onValueChange={(value) => onSelect(Number(value))}
          placeholder="Choisir un compte"
          options={accounts.map((account) => ({
            value: String(account.id),
            label: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{account.name}</span>
                <span className="numeric text-xs text-fg-muted">{eur(account.current_balance)}</span>
              </span>
            ),
          }))}
        />
      )}
    </div>
  )
}
