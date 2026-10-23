import { useState } from 'react'
import { BookOpen, Lock } from 'lucide-react'
import { Badge, Callout, EmptyState, Select, Tabs } from '@qvanderlinden/ui'
import type { JournalRead, MovementRead, PaymentMethodRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { SalePanel } from '../sales/SalesForm'
import { JournalCards } from './JournalCards'
import { JournalTable } from './JournalTable'
import { MovementDetail } from './MovementDetail'

/**
 * The Journaux screen: one tab per financial account (the journal computed from the pieces'
 * payments, read only). A sale or purchase movement opens its piece in its panel and the
 * journals reload when it closes; a card statement opens the purchases it settles.
 */
export function JournalsScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { current } = useFiscalYear()
  const journals = useResource<JournalRead[]>(current ? `/fiscal-years/${current.id}/journals` : null)
  const methods = useResource<PaymentMethodRead[]>('/payment-methods')
  const [account, setAccount] = useState<number | null>(null)
  const [open, setOpen] = useState<MovementRead | null>(null)

  const failure = journals.error ?? methods.error
  if (failure) {
    return (
      <Callout tone="negative" title="Les journaux n’ont pas pu être chargés.">
        {messageOf(failure)}
      </Callout>
    )
  }
  if (!journals.data || !methods.data || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const all = journals.data
  const journal = all.find((j) => j.account.id === account) ?? all[0]
  const year = current.end_date.slice(0, 4)

  function closePiece() {
    setOpen(null)
    void journals.reload()
  }

  const list = { journal, year, onOpen: setOpen }
  const piece = open?.piece_id != null ? open : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-3">
          <h1 className="type-title text-4xl text-fg-strong">Journaux</h1>
          <Badge tone="info">projection</Badge>
        </span>
        <span className="text-sm text-fg-muted">
          Chaque recette et chaque dépense, dans l’ordre des dates, compte financier par compte financier
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Lock className="size-3.5" aria-hidden />
          Lecture seule · les mouvements s’encodent dans leurs pièces
        </span>
      </div>

      {journal ? (
        <>
          {mobile ? (
            <Select
              size="md"
              aria-label="Compte financier"
              className="w-full min-w-0"
              options={all.map((j) => ({ value: String(j.account.id), label: j.account.name }))}
              value={String(journal.account.id)}
              onValueChange={(v) => setAccount(Number(v))}
            />
          ) : (
            <Tabs
              tabs={all.map((j) => ({ value: String(j.account.id), label: j.account.name, count: j.movements.length }))}
              value={String(journal.account.id)}
              onChange={(v) => setAccount(Number(v))}
            />
          )}
          {mobile ? <JournalCards key={journal.account.id} {...list} /> : <JournalTable key={journal.account.id} {...list} />}
        </>
      ) : (
        <EmptyState icon={BookOpen} title="Aucun journal" />
      )}

      {piece?.kind === 'sale' ? <SalePanel id={piece.piece_id!} onClose={closePiece} /> : null}
      {piece?.kind === 'purchase' ? <PurchasePanel id={piece.piece_id!} onClose={closePiece} /> : null}
      {open?.kind === 'card_statement' ? (
        <MovementDetail movement={open} journals={all} methods={methods.data} mobile={mobile} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  )
}
