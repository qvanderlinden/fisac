import { useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Select, StatCard } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { JournalRead, MovementRead } from '../../api/types'
import { eur, formatDate } from '../../format'
import { Pager } from '../../lists/Pager'
import { listView } from '../../lists/listView'
import { MOVEMENT_FILTERS, filterMovements, paymentOf, receiptOf, type MovementFilter } from './journalsView'

export interface JournalListProps {
  journal: JournalRead
  year: string
  onOpen(movement: MovementRead): void
}

/** The four tiles over a journal: opening balance, receipts, payments, closing balance (the server's figures). */
export function JournalTiles({ journal, year }: { journal: JournalRead; year: string }) {
  const planned = journal.movements.filter((m) => m.planned)
  const plannedCount = (sign: 1 | -1) => planned.filter((m) => Math.sign(Number(m.amount)) === sign).length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="solde au début" value={Number(journal.opening)} format="eur" footnote="les journaux partent de zéro" />
      <StatCard
        label="recettes"
        value={Number(journal.receipts)}
        format="eur"
        footnote={plannedCount(1) ? `dont ${plannedCount(1)} prévues` : 'toutes réalisées'}
      />
      <StatCard
        label="dépenses"
        value={Number(journal.payments)}
        format="eur"
        footnote={plannedCount(-1) ? `dont ${plannedCount(-1)} prévues` : 'toutes réalisées'}
      />
      <StatCard label={`solde à la fin ${year}`} value={Number(journal.closing)} format="eur" footnote="projection" />
    </div>
  )
}

/** The réalisés / prévus select. */
export function MovementFilterSelect({
  value,
  onChange,
  size,
  className,
}: {
  value: MovementFilter
  onChange(value: MovementFilter): void
  size: 'sm' | 'md'
  className?: string
}) {
  return (
    <Select
      size={size}
      aria-label="Réalisés et prévus"
      className={className}
      options={MOVEMENT_FILTERS}
      value={value}
      onValueChange={(v) => onChange(v as MovementFilter)}
    />
  )
}

/** The movement's own label and, under it, where it comes from. */
function Source({ m, onOpen }: { m: MovementRead; onOpen(m: MovementRead): void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(m)}
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-fg-strong hover:text-fg-link hover:underline focus-visible:rounded-sm"
        >
          {m.label}
        </button>
        {m.planned ? <Badge tone="warning">prévu</Badge> : null}
      </span>
      <span className="font-mono text-2xs text-fg-muted">{m.reference}</span>
    </div>
  )
}

/**
 * The desktop journal (`Main` artboard): the tiles, search and réalisés / prévus filter, the
 * movements with their running balance in pages of 25. Read only: a movement opens its piece.
 */
export function JournalTable({ journal, year, onOpen }: JournalListProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MovementFilter>('all')
  const [page, setPage] = useState(1)

  const shown = filterMovements(journal.movements, filter)
  const view = listView(shown, {
    query,
    matches: (m, q) => m.label.toLowerCase().includes(q) || m.reference.toLowerCase().includes(q),
    sort: { key: 'date', dir: 'asc' },
    compare: {},
    page,
  })
  const filtered = query !== '' || filter !== 'all'

  return (
    <div className="flex flex-col gap-6">
      <JournalTiles journal={journal} year={year} />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          icon={Search}
          aria-label="Chercher un libellé"
          placeholder="Chercher un libellé"
          className="w-80"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
        <MovementFilterSelect
          size="sm"
          className="w-48"
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setPage(1)
          }}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={X}
            onClick={() => {
              setQuery('')
              setFilter('all')
              setPage(1)
            }}
          >
            Effacer les filtres
          </Button>
        ) : null}
      </div>

      <Card padding={false}>
        <Table className="min-w-200">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Date</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead className="w-32 text-right">Recette</TableHead>
              <TableHead className="w-32 text-right">Dépense</TableHead>
              <TableHead className="w-36 text-right">Solde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((m, i) => {
              const receipt = receiptOf(m)
              const payment = paymentOf(m)
              return (
                <TableRow key={`${m.kind}-${m.piece_id ?? m.reference}-${m.date}-${i}`} className="hover:bg-surface-hover">
                  <TableCell className="numeric text-sm whitespace-nowrap text-fg-muted">{formatDate(m.date, 'full')}</TableCell>
                  <TableCell>
                    <Source m={m} onOpen={onOpen} />
                  </TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap text-positive-fg">{receipt ? eur(receipt) : ''}</TableCell>
                  <TableCell className="numeric text-right whitespace-nowrap">{payment ? eur(payment) : ''}</TableCell>
                  <TableCell
                    className={`numeric text-right whitespace-nowrap ${m.planned ? 'text-fg-muted' : 'text-fg-strong'}`}
                  >
                    {eur(m.balance)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {view.total === 0 ? (
          <EmptyState icon={BookOpen} title={filtered ? 'Aucun mouvement ne correspond à ces filtres' : 'Aucun mouvement'} />
        ) : null}
        <Pager
          label={view.label}
          page={view.page}
          pages={view.pages}
          onPrev={() => setPage(view.page - 1)}
          onNext={() => setPage(view.page + 1)}
        />
      </Card>
    </div>
  )
}
