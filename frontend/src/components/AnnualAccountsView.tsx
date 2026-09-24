import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fetchAnnualAccounts } from '../api/client'
import type { AccountRead, AnnualAccounts } from '../api/types'
import { formatMoney } from '../accountingDisplay'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AnnualAccountsViewProps {
  account: AccountRead
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 1 - i)

// Figures are signed - revenue positive, expense negative - so colour follows
// the sign itself, not the account's class.
function signClass(value: string): string {
  const n = Number(value)
  if (n > 0) return 'amount-positive'
  if (n < 0) return 'amount-negative'
  return ''
}

function hasActivity(current: string, prior: string): boolean {
  return Number(current) !== 0 || Number(prior) !== 0
}

export function AnnualAccountsView({ account }: AnnualAccountsViewProps) {
  const [data, setData] = useState<AnnualAccounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setData(null)
    setError(null)
    fetchAnnualAccounts(account.id, year)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [account.id, year])

  // The header (year picker, show-all toggle) always renders, like VatView's
  // shell - so a failed fetch still leaves the year control usable instead of
  // stranding the tab on "Loading…" forever with no way to retry.
  return (
    <div className="annual-view">
      <div className="annual-header">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {year} <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              {YEARS.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)}>
                  {y}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="annual-show-all">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all accounts
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {!error && data === null && <p className="empty-state">Loading…</p>}

      {data && (
        <div className="annual-table">
          <div className="annual-row annual-head">
            <span>Account</span>
            <span>{year}</span>
            <span>{year - 1}</span>
            <span>Δ</span>
          </div>

          {data.classes.map((cls) => {
            // Off by default: an account with no activity in either year is
            // noise. One used last year but not this one still shows, because an
            // account going to zero is exactly what the comparison is for.
            const rows = showAll
              ? cls.accounts
              : cls.accounts.filter((a) => hasActivity(a.current, a.prior))
            if (rows.length === 0) return null
            return (
              <div className="annual-class" key={cls.pcmn_class}>
                <div className="annual-class-head">
                  {cls.pcmn_class} {cls.label}
                </div>
                {rows.map((a) => (
                  <div className="annual-row" key={a.id}>
                    <span>
                      <span className="ledger-code">{a.code}</span> {a.name}
                    </span>
                    <span className={signClass(a.current)}>{formatMoney(a.current)}</span>
                    <span className={signClass(a.prior)}>{formatMoney(a.prior)}</span>
                    <span className={signClass(a.delta)}>{formatMoney(a.delta)}</span>
                  </div>
                ))}
                <div className="annual-row annual-subtotal">
                  <span>Subtotal</span>
                  <span className={signClass(cls.current_total)}>{formatMoney(cls.current_total)}</span>
                  <span className={signClass(cls.prior_total)}>{formatMoney(cls.prior_total)}</span>
                  <span className={signClass(cls.delta)}>{formatMoney(cls.delta)}</span>
                </div>
              </div>
            )
          })}

          {/* Shown whatever the toggle says: lines booked nowhere must stay
              visible, or the result looks unexplained. Also shown whenever
              there are unbooked lines even if their amounts happen to net to
              zero (a zero-amount line, or equal-and-opposite unbooked revenue
              and expense) - otherwise the "N lines still unbooked" signal could
              hide behind a coincidental zero total. */}
          {(hasActivity(data.unassigned.current, data.unassigned.prior) ||
            data.unassigned.line_count > 0) && (
            <div className="annual-row annual-unassigned">
              <span>
                Unassigned ({data.unassigned.line_count}{' '}
                {data.unassigned.line_count === 1 ? 'line' : 'lines'})
              </span>
              <span className={signClass(data.unassigned.current)}>{formatMoney(data.unassigned.current)}</span>
              <span className={signClass(data.unassigned.prior)}>{formatMoney(data.unassigned.prior)}</span>
              <span className={signClass(data.unassigned.delta)}>{formatMoney(data.unassigned.delta)}</span>
            </div>
          )}

          <div className="annual-row annual-result">
            <span>Result</span>
            <span className={signClass(data.result.current)}>{formatMoney(data.result.current)}</span>
            <span className={signClass(data.result.prior)}>{formatMoney(data.result.prior)}</span>
            <span className={signClass(data.result.delta)}>{formatMoney(data.result.delta)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
