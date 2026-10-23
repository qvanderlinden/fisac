import { useState } from 'react'
import { CreditCard, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, EmptyState, IconButton } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { PaymentMethodRead } from '../../api/types'
import { countLabel } from '../../format'
import { BulkBar, type BulkAction } from '../../lists/BulkBar'
import { deleteItem, inUseLabel, usesLabel } from '../../lists/inUse'
import { RowMenu } from '../../lists/RowMenu'
import { useSelection } from '../../lists/useSelection'
import { StatementCards } from './StatementCards'
import { TYPE_LABELS, cardsWithStatements, displayName, paramsLabel } from './paymentMethodsList'

/**
 * The desktop list (`MoyensPaiement` artboard): title and "Nouveau moyen de paiement", the
 * methods by name (a handful: no search, no pages), selection with the bulk bar, row
 * actions, and under the table the next statements of each card.
 */
export function PaymentMethodsTable({
  rows,
  onAdd,
  onOpen,
  onDelete,
}: {
  rows: PaymentMethodRead[]
  onAdd(): void
  onOpen(id: number): void
  /** Asks to delete these unused methods; the screen confirms first. */
  onDelete(ids: number[]): void
}) {
  const selection = useSelection<number>()
  const ids = rows.map((m) => m.id)
  const allSelected = ids.length > 0 && ids.every((id) => selection.selected.has(id))
  const someSelected = ids.some((id) => selection.selected.has(id))
  // Ticked ids of deleted rows are left in the set: they match no row, so nothing counts them.
  const picked = rows.filter((m) => selection.selected.has(m.id))
  const free = picked.filter((m) => m.uses === 0)
  const kept = picked.length - free.length

  const bulk: BulkAction[] = [
    { label: 'Exporter', icon: Download, disabled: true, title: 'bientôt', run: () => {} },
    ...(free.length
      ? [{ label: 'Supprimer', icon: Trash2, variant: 'danger' as const, run: () => onDelete(free.map((m) => m.id)) }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Moyens de paiement</h1>
          <span className="text-sm text-fg-muted">
            Comment la société paie et encaisse ; une carte a un décompte mensuel à régler
          </span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouveau moyen de paiement
        </Button>
      </div>

      <Card padding={false}>
        {picked.length > 0 ? (
          <BulkBar
            label={countLabel(picked.length, 'moyen sélectionné', 'moyens sélectionnés')}
            note={
              kept === 0
                ? undefined
                : kept === 1
                  ? '1 porté par des pièces : il reste'
                  : `${kept} portés par des pièces : ils restent`
            }
            actions={bulk}
            onClear={selection.clear}
          />
        ) : null}
        <Table className="min-w-225">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Sélectionner les moyens de paiement"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => selection.toggleAll(ids)}
                />
              </TableHead>
              <TableHead>Moyen de paiement</TableHead>
              <TableHead className="w-48">Type</TableHead>
              <TableHead className="w-48">Compte financier</TableHead>
              <TableHead className="w-64">Décompte</TableHead>
              <TableHead className="w-28 text-right">Utilisé</TableHead>
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const name = displayName(m)
              const selected = selection.selected.has(m.id)
              const incomplete = m.type === 'card' && !(m.statement_closing_day && m.statement_payment_day)
              return (
                <TableRow key={m.id} data-state={selected ? 'selected' : undefined} className="hover:bg-surface-hover">
                  <TableCell>
                    <Checkbox
                      aria-label={`Sélectionner ${name}`}
                      checked={selected}
                      onCheckedChange={() => selection.toggle(m.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpen(m.id)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                    >
                      {name}
                    </button>
                  </TableCell>
                  <TableCell>{TYPE_LABELS[m.type]}</TableCell>
                  <TableCell>{m.financial_account_name}</TableCell>
                  <TableCell className={incomplete ? 'text-status-warning-text' : m.type === 'card' ? '' : 'text-fg-muted'}>
                    {paramsLabel(m)}
                  </TableCell>
                  <TableCell className="numeric text-right text-fg-muted">{usesLabel(m.uses)}</TableCell>
                  <TableCell className="pr-2 pl-0">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} size="sm" label={`Modifier ${name}`} onClick={() => onOpen(m.id)} />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={m.uses > 0 ? inUseLabel(m.uses) : `Supprimer ${name}`}
                        disabled={m.uses > 0}
                        onClick={() => onDelete([m.id])}
                      />
                      <RowMenu
                        items={[deleteItem('Supprimer le moyen de paiement', m.uses, () => onDelete([m.id]))]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {rows.length === 0 ? <EmptyState icon={CreditCard} title="Aucun moyen de paiement pour l’instant" /> : null}
      </Card>

      <StatementCards cards={cardsWithStatements(rows)} />
    </div>
  )
}
