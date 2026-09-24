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

export function LedgerAccountsView({ accountId }: LedgerAccountsViewProps) {
  const [rows, setRows] = useState<LedgerAccountRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    setLoading(true)
    listLedgerAccounts(accountId).then((fetched) => {
      setRows(fetched)
      setLoading(false)
    })
  }, [accountId])

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

  async function rename(row: LedgerAccountRead, name: string) {
    const updated = await updateLedgerAccount(accountId, row.id, { name })
    setRows((current) => current.map((r) => (r.id === updated.id ? updated : r)))
  }

  async function remove(row: LedgerAccountRead) {
    await deleteLedgerAccount(accountId, row.id)
    setRows((current) => current.filter((r) => r.id !== row.id))
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
        <div className="ledger-row" key={row.id}>
          <span className="ledger-code">{row.code}</span>
          <span className="ledger-class-badge">
            {row.pcmn_class} {CLASS_LABELS[row.pcmn_class]}
          </span>
          <input
            type="text"
            value={row.name}
            onChange={(e) =>
              setRows((current) =>
                current.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
              )
            }
            onBlur={(e) => rename(row, e.target.value.trim())}
            aria-label={`Name of ${row.code}`}
          />
          <button type="button" className="line-remove" onClick={() => remove(row)} aria-label={`Delete ${row.code}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
