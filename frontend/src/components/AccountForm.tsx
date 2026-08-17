import { useState } from 'react'
import type { AccountCreate, AccountRead } from '../api/types'

interface AccountFormProps {
  initialAccount?: AccountRead
  // Always submits every field, in create and edit mode alike - AccountCreate
  // is structurally assignable to AccountUpdate (whose fields are optional),
  // so this one type covers both call sites in AccountSwitcher.
  onSubmit: (payload: AccountCreate) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
}

export function AccountForm({ initialAccount, onSubmit, onCancel, onDelete }: AccountFormProps) {
  const [name, setName] = useState(initialAccount?.name ?? '')
  const [currentBalance, setCurrentBalance] = useState(initialAccount?.current_balance ?? '0.00')
  const [isCompany, setIsCompany] = useState(initialAccount?.is_company ?? false)
  const [vatApplicable, setVatApplicable] = useState(initialAccount?.vat_applicable ?? false)
  const [visaPaymentDay, setVisaPaymentDay] = useState(
    initialAccount?.visa_payment_day != null ? String(initialAccount.visa_payment_day) : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name,
        current_balance: currentBalance,
        is_company: isCompany,
        // Not shown/editable unless isCompany is checked, so it can't drift
        // out of sync with is_company client-side either (mirrors the
        // backend's own normalization).
        vat_applicable: isCompany && vatApplicable,
        visa_payment_day: visaPaymentDay.trim() === '' ? null : Number(visaPaymentDay),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setSaving(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setSaving(false)
    }
  }

  return (
    <form className="flow-form" onSubmit={handleSubmit}>
      <h2>{initialAccount ? 'Edit account' : 'New account'}</h2>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>

      <label className="field">
        <span>Current balance</span>
        <input
          type="number"
          step="0.01"
          value={currentBalance}
          onChange={(e) => setCurrentBalance(e.target.value)}
          required
        />
      </label>

      <label className="field field-row">
        <span>Company</span>
        <input
          type="checkbox"
          checked={isCompany}
          onChange={(e) => setIsCompany(e.target.checked)}
        />
      </label>

      {isCompany && (
        <label className="field field-row">
          <span>VAT applicable</span>
          <input
            type="checkbox"
            checked={vatApplicable}
            onChange={(e) => setVatApplicable(e.target.checked)}
          />
        </label>
      )}

      <label className="field">
        <span>Visa payment day</span>
        <input
          type="number"
          min="1"
          max="31"
          placeholder="Day of month Visa is charged"
          value={visaPaymentDay}
          onChange={(e) => setVisaPaymentDay(e.target.value)}
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        {onDelete && (
          <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
            Delete
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
