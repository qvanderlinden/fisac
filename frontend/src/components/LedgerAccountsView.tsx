import { useEffect, useState } from 'react'
import {
  createLedgerAccount,
  deleteLedgerAccount,
  listLedgerAccounts,
  updateLedgerAccount,
} from '../api/client'
import type { LedgerAccountRead } from '../api/types'

interface LedgerAccountsViewProps {
  accountId: number
}

// Belgian PCMN. Only 6 and 7 are meaningful for flow lines, but the whole
// chart is definable - see the schema design doc.
const CLASS_LABELS: Record<number, string> = {
  1: 'Capitaux propres',
  2: 'Immobilisés',
  3: 'Stocks',
  4: 'Créances et dettes',
  5: 'Trésorerie',
  6: 'Charges',
  7: 'Produits',
}

// Mirrors the backend's _LEDGER_CODE and the database's two check
// constraints, so a bad code is caught before a round trip.
const CODE_PATTERN = /^[1-7][0-9]*$/

// One row's name is inline-editable. Local draft is seeded from the fetched
// ledger account and committed on blur only when it actually changed (a
// rejected commit reverts via the refresh that follows) - mirrors
// CategoriesView's CategoryRow/commitName.
function LedgerRow({
  row,
  onRename,
  onDelete,
}: {
  row: LedgerAccountRead
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [name, setName] = useState(row.name)

  useEffect(() => {
    setName(row.name)
  }, [row])

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === row.name) {
      setName(row.name)
      return
    }
    onRename(trimmed)
  }

  return (
    <div className="ledger-row">
      <span className="ledger-code">{row.code}</span>
      <span className="ledger-class-badge">
        {row.pcmn_class} {CLASS_LABELS[row.pcmn_class]}
      </span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        aria-label={`Name of ${row.code}`}
      />
      <button type="button" className="line-remove" onClick={onDelete} aria-label={`Delete ${row.code}`}>
        ×
      </button>
    </div>
  )
}

export function LedgerAccountsView({ accountId }: LedgerAccountsViewProps) {
  const [rows, setRows] = useState<LedgerAccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  async function refresh() {
    // Caught here (not left to the caller) so a failed list call always
    // clears loading instead of leaving the tab stuck on "Loading…" forever,
    // and so run()'s post-mutation `await refresh()` can never reject with an
    // unhandled rejection.
    try {
      setRows(await listLedgerAccounts(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Wraps a mutation so failures (e.g. a name cleared to empty -> 422, or a
  // delete that no longer applies) surface in the shared error line, and the
  // list re-syncs with the server either way - mirrors CategoriesView's run().
  async function run(mutation: () => Promise<unknown>) {
    setError(null)
    try {
      await mutation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    }
    await refresh()
  }

  const codeValid = CODE_PATTERN.test(newCode)
  const canAdd = codeValid && newName.trim() !== ''

  async function add() {
    setError(null)
    try {
      const created = await createLedgerAccount(accountId, {
        code: newCode,
        name: newName.trim(),
      })
      // Re-sort locally rather than refetching: the list is ordered by code.
      setRows((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
      setNewCode('')
      setNewName('')
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('409') ? 'That code already exists.' : String(e))
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>

  return (
    <div className="ledger-accounts-view">
      <h2>Ledger accounts</h2>
      <p className="view-hint">
        Your chart of accounts. The class is the code's first digit and is set for you.
      </p>

      <div className="ledger-add-row">
        <input
          type="text"
          placeholder="610000"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          aria-label="Code"
        />
        <span className="ledger-class-badge">
          {codeValid ? `${newCode[0]} ${CLASS_LABELS[Number(newCode[0])]}` : '—'}
        </span>
        <input
          type="text"
          placeholder="Fournitures"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Name"
        />
        <button type="button" disabled={!canAdd} onClick={add}>
          Add
        </button>
      </div>
      {newCode !== '' && !codeValid && (
        <p className="form-error">A code is digits only and starts with a class, 1 to 7.</p>
      )}
      {error && <p className="form-error">{error}</p>}

      {rows.length === 0 && <p className="empty-state">No ledger accounts yet.</p>}

      {rows.map((row) => (
        <LedgerRow
          key={row.id}
          row={row}
          onRename={(name) => run(() => updateLedgerAccount(accountId, row.id, { name }))}
          onDelete={() => run(() => deleteLedgerAccount(accountId, row.id))}
        />
      ))}
    </div>
  )
}
