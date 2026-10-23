import { Badge, Card } from '@qvanderlinden/ui'
import type { PaymentMethodRead } from '../../api/types'
import type { Statement } from '../../statements'
import { displayName, statementName, statementPay, statementPeriod } from './paymentMethodsList'

/** The statement tiles: the open one ("en cours") then the next ones ("à venir"). */
function Tiles({ statements, mobile }: { statements: Statement[]; mobile: boolean }) {
  return (
    <div className={mobile ? 'flex flex-col gap-3' : 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'}>
      {statements.map((s, i) => (
        <div
          key={s.month}
          className={`flex flex-col gap-1.5 rounded-lg border border-line-hairline px-4 py-3.5 ${i === 0 ? 'bg-surface-card' : ''}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-fg-strong">{statementName(s)}</span>
            <Badge tone={i === 0 ? 'warning' : 'neutral'}>{i === 0 ? 'en cours' : 'à venir'}</Badge>
          </div>
          <span className="font-mono text-xs text-fg-muted">{statementPeriod(s)}</span>
          <span className="text-sm text-fg-body">{statementPay(s)}</span>
        </div>
      ))}
    </div>
  )
}

/** One card per payment card: its next three statements (`MoyensPaiement` and `MobileMoyensPaiement` artboards). */
export function StatementCards({
  cards,
  mobile = false,
}: {
  cards: { row: PaymentMethodRead; statements: Statement[] }[]
  mobile?: boolean
}) {
  return (
    <>
      {cards.map(({ row, statements }) => {
        const subtitle = `Chaque décompte devient un paiement de la banque vers ${row.financial_account_name} dans le journal financier`
        return mobile ? (
          <section key={row.id} className="flex flex-col gap-3 px-4 pt-6">
            <div className="flex flex-col gap-1">
              <span className="type-eyebrow text-fg-muted">{displayName(row).toLowerCase()} · prochains décomptes</span>
              <span className="text-sm text-fg-muted">{subtitle}</span>
            </div>
            <Tiles statements={statements} mobile />
          </section>
        ) : (
          <Card key={row.id} title={`${displayName(row)} · prochains décomptes`} subtitle={subtitle}>
            <Tiles statements={statements} mobile={false} />
          </Card>
        )
      })}
    </>
  )
}
