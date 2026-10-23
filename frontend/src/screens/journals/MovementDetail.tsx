import { Callout } from '@qvanderlinden/ui'
import type { JournalRead, MovementRead, PaymentMethodRead } from '../../api/types'
import { eur, formatDate } from '../../format'
import { ListDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { statementPurchases } from './journalsView'

function Purchases({ journals, methods, movement }: { journals: JournalRead[]; methods: PaymentMethodRead[]; movement: MovementRead }) {
  const found = statementPurchases(journals, methods, movement)
  const total = Math.abs(Number(movement.amount))
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info" title={`${movement.reference}, payé le ${formatDate(movement.date, 'full')}`}>
        Le décompte regroupe les achats payés par cette carte pendant sa période ; il sort du compte de règlement et entre
        dans le journal de la carte.
      </Callout>
      {found && found.purchases.length > 0 ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-line-hairline rounded-lg border border-line-hairline p-0">
          {found.purchases.map((m) => (
            <li key={`${m.kind}-${m.piece_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg-strong">{m.label}</span>
                <span className="font-mono text-2xs text-fg-muted">
                  {m.reference} · {formatDate(m.date, 'full')}
                </span>
              </span>
              <span className="numeric text-sm whitespace-nowrap text-fg-strong">{eur(m.amount.replace('-', ''))}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5">
            <span className="text-sm font-semibold text-fg-strong">Décompte</span>
            <span className="numeric text-sm font-semibold whitespace-nowrap text-fg-strong">{eur(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="m-0 text-sm text-fg-muted">Aucun achat de l’exercice n’est lié à ce décompte.</p>
      )}
      {found && !found.complete ? (
        <p className="m-0 text-xs text-fg-muted">
          Ces achats n’atteignent pas le montant du décompte : les autres ont été payés à la fin de l’exercice précédent.
        </p>
      ) : null}
      {found ? null : (
        <p className="m-0 text-xs text-fg-muted">Les achats de la carte ne peuvent pas être retrouvés : son jour de clôture manque.</p>
      )}
    </div>
  )
}

/**
 * A card statement movement, which has no piece of its own: the card purchases it settles
 * (dialog on desktop, full screen on mobile).
 */
export function MovementDetail({
  movement,
  journals,
  methods,
  mobile,
  onClose,
}: {
  movement: MovementRead
  journals: JournalRead[]
  methods: PaymentMethodRead[]
  mobile: boolean
  onClose(): void
}) {
  const body = <Purchases journals={journals} methods={methods} movement={movement} />
  const title = `Décompte ${movement.label}`
  return mobile ? (
    <FullScreenForm title={title} onClose={onClose}>
      {body}
    </FullScreenForm>
  ) : (
    <ListDialog title={title} description={eur(movement.amount.replace('-', ''))} size="lg" onClose={onClose}>
      {body}
    </ListDialog>
  )
}
