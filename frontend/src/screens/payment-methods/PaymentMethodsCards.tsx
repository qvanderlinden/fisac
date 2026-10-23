import { CreditCard, Plus } from 'lucide-react'
import { Badge, Button, EmptyState } from '@qvanderlinden/ui'
import type { PaymentMethodRead } from '../../api/types'
import { countLabel } from '../../format'
import { usesLabel } from '../../lists/inUse'
import { StatementCards } from './StatementCards'
import { cardsWithStatements, displayName, metaLabel, paramsLabel } from './paymentMethodsList'

/**
 * The mobile list (`MobileMoyensPaiement` artboard): one row per method (a card shows its
 * statement days), the next statements of each card, and the button that adds a method.
 */
export function PaymentMethodsCards({
  rows,
  onAdd,
  onOpen,
}: {
  rows: PaymentMethodRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  return (
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="text-sm text-fg-muted">
          Comment la société paie et encaisse ; une carte a un décompte mensuel à régler
        </span>
        <span className="text-sm text-fg-muted">{countLabel(rows.length, 'moyen de paiement', 'moyens de paiement')}</span>
      </div>

      <div className="border-t border-line-hairline bg-surface-card">
        {rows.map((m) => {
          const incomplete = m.type === 'card' && !(m.statement_closing_day && m.statement_payment_day)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-b border-line-hairline bg-transparent px-4 py-2.5 text-left active:bg-surface-active focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="truncate text-sm font-medium text-fg-strong">{displayName(m)}</span>
                <span className="truncate font-mono text-2xs text-fg-muted">{metaLabel(m)}</span>
                {m.type === 'card' ? (
                  <span className="flex items-center gap-1.5">
                    <Badge tone={incomplete ? 'warning' : 'neutral'}>{paramsLabel(m)}</Badge>
                  </span>
                ) : null}
              </span>
              <span className="numeric flex-none text-sm text-fg-muted">{usesLabel(m.uses)}</span>
            </button>
          )
        })}
        {rows.length === 0 ? <EmptyState icon={CreditCard} title="Aucun moyen de paiement pour l’instant" /> : null}
      </div>

      <StatementCards cards={cardsWithStatements(rows)} mobile />

      <div className="px-4 pt-4 pb-24" />

      <Button
        iconLeft={Plus}
        aria-label="Nouveau moyen de paiement"
        onClick={onAdd}
        className="fixed right-4 bottom-5 z-20 size-14 rounded-pill px-0 shadow-lg"
      />
    </div>
  )
}
