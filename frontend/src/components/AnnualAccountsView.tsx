import { useEffect, useState } from 'react'
import { Button, Callout, Card, Select, Switch, cn } from '@qvanderlinden/ui'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@qvanderlinden/ui/primitives'
import { fetchAnnualAccounts } from '../api/client'
import type { AccountRead, AnnualAccounts } from '../api/types'
import { frameError } from '../errors'
import { eur, signedEur } from '../format'
import { hasActivity, signTone } from '../reportFigures'
import { CountFigure } from './CountFigure'
import { PageHeader } from './PageHeader'

interface AnnualAccountsViewProps {
  account: AccountRead
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => String(CURRENT_YEAR + 1 - i))

const RELOAD_LEAD = 'Rechargez la page, puis réessayez.'

// The three figure cells of a row: N, N-1 and the signed change. Figures are
// signed (revenue positive, expense negative), so the tone follows the sign
// itself, not the account's class.
function Figures({ current, prior, delta }: { current: string; prior: string; delta: string }) {
  return (
    <>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(current))}>{eur(current)}</TableCell>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(prior))}>{eur(prior)}</TableCell>
      <TableCell className={cn('numeric text-right whitespace-nowrap', signTone(delta))}>{signedEur(delta)}</TableCell>
    </>
  )
}

export function AnnualAccountsView({ account }: AnnualAccountsViewProps) {
  const [data, setData] = useState<AnnualAccounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [showAll, setShowAll] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetchAnnualAccounts(account.id, Number(year))
      .then((fetched) => {
        if (!cancelled) setData(fetched)
      })
      .catch((err) => {
        if (!cancelled) setError(frameError(err, { client: RELOAD_LEAD }))
      })
    return () => {
      cancelled = true
    }
  }, [account.id, year, reloadKey])

  // The header (year, show-all switch) always renders, so a failed fetch
  // still leaves the year control usable.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comptes annuels"
        actions={
          <>
            <Select
              size="sm"
              aria-label="Année"
              className="w-28"
              value={year}
              onValueChange={setYear}
              options={YEARS}
            />
            <Switch label="tous les comptes" checked={showAll} onCheckedChange={setShowAll} />
          </>
        }
      />

      {error && (
        <Callout tone="negative" title="Les comptes annuels n’ont pas pu être chargés.">
          {error}{' '}
          <Button type="button" variant="link" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </Callout>
      )}
      {!error && data === null && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {data && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>compte</TableHead>
                <TableHead className="text-right">{data.year}</TableHead>
                <TableHead className="text-right">{data.year - 1}</TableHead>
                <TableHead className="text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.classes.map((cls) => {
                // Off by default: an account with no activity in either year is
                // noise. One used last year but not this one still shows -
                // an account going to zero is what the comparison is for.
                const rows = showAll ? cls.accounts : cls.accounts.filter((a) => hasActivity(a.current, a.prior))
                if (rows.length === 0) return null
                return [
                  <TableRow key={`class-${cls.pcmn_class}`} className="bg-surface-sunken">
                    <TableCell colSpan={4} className="type-subheading text-fg-strong">
                      <span className="numeric">{cls.pcmn_class}</span> {cls.label}
                    </TableCell>
                  </TableRow>,
                  ...rows.map((a) => (
                    <TableRow key={a.id} className="hover:bg-surface-hover">
                      <TableCell>
                        <span className="numeric text-fg-muted">{a.code}</span>{' '}
                        <span className="text-fg-body">{a.name}</span>
                      </TableCell>
                      <Figures current={a.current} prior={a.prior} delta={a.delta} />
                    </TableRow>
                  )),
                  <TableRow key={`subtotal-${cls.pcmn_class}`}>
                    <TableCell className="type-label text-fg-strong">sous-total</TableCell>
                    <Figures current={cls.current_total} prior={cls.prior_total} delta={cls.delta} />
                  </TableRow>,
                ]
              })}

              {/* Shown whatever the switch says: lines booked nowhere must stay
                  visible, or the result looks unexplained. Also shown when
                  unbooked lines net to zero, so the "N lines still unbooked"
                  signal can't hide behind a coincidental zero total. */}
              {(hasActivity(data.unassigned.current, data.unassigned.prior) || data.unassigned.line_count > 0) && (
                <TableRow className="hover:bg-surface-hover">
                  <TableCell className="text-fg-body">
                    non affecté (<CountFigure n={data.unassigned.line_count} singular="ligne" plural="lignes" />)
                  </TableCell>
                  <Figures
                    current={data.unassigned.current}
                    prior={data.unassigned.prior}
                    delta={data.unassigned.delta}
                  />
                </TableRow>
              )}
            </TableBody>
            {/* The footer carries the 1px rule above the result. */}
            <TableFooter className="font-semibold">
              <TableRow>
                <TableCell className="type-subheading text-fg-strong">résultat</TableCell>
                <Figures current={data.result.current} prior={data.result.prior} delta={data.result.delta} />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
    </div>
  )
}
