import { useState } from 'react'
import { createAccount, deleteAccount, updateAccount } from '../api/client'
import type { AccountRead } from '../api/types'
import { formatAmount } from '../accountingDisplay'
import { AccountForm } from './AccountForm'

interface AccountSwitcherProps {
  accounts: AccountRead[]
  selectedAccountId: number | null
  onSelect: (id: number | null) => void
  onAccountsChange: (accounts: AccountRead[]) => void
}

type ModalState = { kind: 'create' } | { kind: 'edit'; account: AccountRead } | null

export function AccountSwitcher({
  accounts,
  selectedAccountId,
  onSelect,
  onAccountsChange,
}: AccountSwitcherProps) {
  // A dropdown rather than an always-visible list - scales to many accounts
  // without growing the sidebar. Closes on selecting an account, opening the
  // edit/create form, or clicking the backdrop.
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const selected = accounts.find((a) => a.id === selectedAccountId) ?? null

  return (
    <div className="account-dropdown-wrap">
      <div className="account-trigger-row">
        <button className="account-trigger" onClick={() => setOpen((v) => !v)}>
          <span className="account-trigger-info">
            <span className="sidebar-account-name">{selected ? selected.name : 'No account'}</span>
            {selected && (
              <span className="sidebar-account-balance">{formatAmount(selected.current_balance)}</span>
            )}
          </span>
          <span className="account-trigger-chevron">▾</span>
        </button>
        {selected && (
          <button
            type="button"
            className="account-settings-button"
            onClick={() => setModal({ kind: 'edit', account: selected })}
            aria-label={`Settings for ${selected.name}`}
            title={`Settings for ${selected.name}`}
          >
            ⚙
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="account-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="account-dropdown">
            {accounts.length === 0 && <p className="sidebar-empty-state">No accounts yet.</p>}
            <ul className="sidebar-account-list">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    className={
                      account.id === selectedAccountId ? 'sidebar-account-row selected' : 'sidebar-account-row'
                    }
                    onClick={() => {
                      onSelect(account.id)
                      setOpen(false)
                    }}
                  >
                    <span className="sidebar-account-name">{account.name}</span>
                    <span className="sidebar-account-balance">{formatAmount(account.current_balance)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="sidebar-add-account"
              onClick={() => {
                setModal({ kind: 'create' })
                setOpen(false)
              }}
            >
              + Add account
            </button>
          </div>
        </>
      )}

      {(modal?.kind === 'create' || modal?.kind === 'edit') && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <AccountForm
              initialAccount={modal.kind === 'edit' ? modal.account : undefined}
              onCancel={() => setModal(null)}
              onSubmit={async (payload) => {
                if (modal.kind === 'edit') {
                  const updated = await updateAccount(modal.account.id, payload)
                  onAccountsChange(accounts.map((a) => (a.id === updated.id ? updated : a)))
                } else {
                  const created = await createAccount(payload)
                  onAccountsChange([...accounts, created])
                  onSelect(created.id)
                }
                setModal(null)
              }}
              onDelete={
                modal.kind === 'edit'
                  ? async () => {
                      const deletedId = modal.account.id
                      await deleteAccount(deletedId)
                      const remaining = accounts.filter((a) => a.id !== deletedId)
                      onAccountsChange(remaining)
                      if (selectedAccountId === deletedId) {
                        onSelect(remaining[0]?.id ?? null)
                      }
                      setModal(null)
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
