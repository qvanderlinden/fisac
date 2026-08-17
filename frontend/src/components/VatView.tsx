import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fetchVat } from '../api/client'
import type { AccountRead, AccountVat } from '../api/types'
import { formatDate, formatMoney } from '../accountingDisplay'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface VatViewProps {
  account: AccountRead
}

const now = new Date()
const CURRENT_YEAR = now.getFullYear()
const CURRENT_QUARTER = Math.floor(now.getMonth() / 3) + 1
// Year options: current + next, back a few years.
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 1 - i)
const QUARTERS = [1, 2, 3, 4]

// Net VAT you owe (>0) reads as an outflow (red); a credit (<0) as positive.
function netClass(net: string): string {
  const n = Number(net)
  if (n > 0) return 'amount-negative'
  if (n < 0) return 'amount-positive'
  return ''
}

export function VatView({ account }: VatViewProps) {
  const [vat, setVat] = useState<AccountVat | null>(null)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [quarter, setQuarter] = useState(CURRENT_QUARTER)

  useEffect(() => {
    setVat(null)
    fetchVat(account.id, year).then(setVat)
  }, [account.id, year])

  const selected = vat?.quarters.find((q) => q.quarter === quarter) ?? null

  return (
    <div className="vat-view">
      <div className="vat-header">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {year}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              {YEARS.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)}>
                  {y}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="button-group">
          {QUARTERS.map((q) => (
            <Button
              key={q}
              size="sm"
              variant={quarter === q ? 'default' : 'outline'}
              onClick={() => setQuarter(q)}
            >
              Q{q}
            </Button>
          ))}
        </div>
      </div>

      {!vat && <p className="empty-state">Loading…</p>}

      {vat && selected && (
        <div className="vat-body">
          {!vat.vat_applicable && (
            <p className="vat-notice">
              This account isn’t marked VAT-registered — figures below are indicative.
            </p>
          )}

          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">VAT collected</span>
              <span className="stat-value">{formatMoney(selected.output_vat)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">VAT deductible</span>
              <span className="stat-value">{formatMoney(selected.deductible_vat)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Net VAT to pay</span>
              <span className={`stat-value ${netClass(selected.net_due)}`}>
                {formatMoney(selected.net_due)}
              </span>
            </div>
          </div>

          <div className="table-wrap vat-table">
            <div className="table-wrap-header">
              <h2>{selected.label} — flows</h2>
            </div>
            <div className="vat-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Flow</th>
                    <th>Invoice date</th>
                    <th className="amount-col">VAT collected</th>
                    <th className="amount-col">VAT deductible</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.flows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        No flows in this quarter.
                      </td>
                    </tr>
                  )}
                  {selected.flows.map((f) => (
                    <tr key={f.id}>
                      <td className="cell-title">
                        {f.name}
                        <span className="vat-drill-meta">
                          {`${formatMoney(f.gross_vat)} VAT`}
                          {f.vat_rate != null ? ` @ ${Number(f.vat_rate)}%` : ' (mixed)'}
                          {f.reverse_charge && ' · reverse charge'}
                          {f.kind === 'expense' && ` · ${Number(f.deduction_rate)}% deductible`}
                        </span>
                      </td>
                      <td className="text-secondary">{formatDate(f.invoice_date)}</td>
                      <td className="amount-cell">
                        {Number(f.output_vat) !== 0 ? (
                          formatMoney(f.output_vat)
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td className="amount-cell">
                        {Number(f.deductible_vat) !== 0 ? (
                          formatMoney(f.deductible_vat)
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
