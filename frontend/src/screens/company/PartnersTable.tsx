import { Pencil, Plus } from 'lucide-react'
import { Button, Card, IconButton } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { PartnerRead } from '../../api/types'
import { countLabel, eur } from '../../format'
import { sharePercent } from './fiscalYearHint'
import { displayName, totalsOf } from './partners'

/** The partners card of the desktop page (`Societe` artboard): who holds the parts, with the totals. */
export function PartnersTable({
  rows,
  onAdd,
  onOpen,
}: {
  rows: PartnerRead[]
  onAdd(): void
  onOpen(id: number): void
}) {
  const totals = totalsOf(rows)
  const foot = 'border-t border-line-default bg-surface-sunken font-semibold'
  return (
    <Card padding={false}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pt-4 pb-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-semibold text-fg-strong">Associés</span>
          <span className="text-sm text-fg-muted">Qui détient les parts, et ce que chacun a apporté</span>
        </div>
        <Button iconLeft={Plus} onClick={onAdd}>
          Nouvel associé
        </Button>
      </div>
      <Table className="min-w-140">
        <TableHeader>
          <TableRow>
            <TableHead>Associé</TableHead>
            <TableHead className="w-30 text-right">Parts</TableHead>
            <TableHead className="w-25 text-right">%</TableHead>
            <TableHead className="w-40 text-right">Apport</TableHead>
            <TableHead className="w-14">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const name = displayName(p)
            return (
              <TableRow key={p.id} className="hover:bg-surface-hover">
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
                  >
                    {name}
                  </button>
                </TableCell>
                <TableCell className="numeric text-right">{countLabel(p.shares, 'part', 'parts')}</TableCell>
                <TableCell className="numeric text-right text-fg-muted">{sharePercent(p.shares, totals.shares)}</TableCell>
                <TableCell className="numeric text-right text-fg-strong">{eur(p.contribution)}</TableCell>
                <TableCell className="pr-2 pl-0">
                  <div className="flex justify-end">
                    <IconButton icon={Pencil} size="sm" label={`Modifier ${name}`} onClick={() => onOpen(p.id)} />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow className="hover:bg-transparent">
            <TableCell className={`${foot} text-sm text-fg-strong`}>
              {`Total · ${countLabel(rows.length, 'associé', 'associés')}`}
            </TableCell>
            <TableCell className={`${foot} numeric text-right`}>{countLabel(totals.shares, 'part', 'parts')}</TableCell>
            <TableCell className={`${foot} numeric text-right`}>{sharePercent(totals.shares, totals.shares)}</TableCell>
            <TableCell className={`${foot} numeric text-right text-fg-strong`}>{eur(totals.contribution)}</TableCell>
            <TableCell className={foot} />
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  )
}
