import { useState } from 'react'
import { Callout, toast } from '@qvanderlinden/ui'
import type { SaleRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { copyPiece, createPiece, deletePiece, setPaid } from '../../pieces/pieceActions'
import { reference } from '../../pieces/pieceStatus'
import { usePieceRefs } from '../../pieces/usePieceRefs'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { SalesCards } from './SalesCards'
import { SALE_COPY, SalePanel } from './SalesForm'
import { SalesTable } from './SalesTable'
import { rowAmount } from './salesList'

/** Runs one request per id; resolves the answers that came, toasting the first failure. */
async function each<R>(ids: number[], request: (id: number) => Promise<R>): Promise<{ id: number; value: R }[]> {
  const results = await Promise.allSettled(ids.map((id) => request(id).then((value) => ({ id, value }))))
  const refused = results.find((r) => r.status === 'rejected')
  if (refused) toast(messageOf(refused.reason), { tone: 'negative' })
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

/**
 * The Ventes screen: the current fiscal year's sales as a table (desktop) or cards
 * (mobile), the sale open in its form, and the list's own actions: new, duplicate,
 * credit note, mark paid, delete.
 */
export function SalesScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { current } = useFiscalYear()
  const { data, error, setData } = useResource<SaleRead[]>(current ? `/fiscal-years/${current.id}/sales` : null)
  const { refs, error: refsError } = usePieceRefs('sale')
  const [open, setOpen] = useState<{ id: number; isNew: boolean } | null>(null)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  const failure = error ?? refsError
  if (failure) {
    return (
      <Callout tone="negative" title="Les ventes n’ont pas pu être chargées.">
        {messageOf(failure)}
      </Callout>
    )
  }
  if (!data || !refs || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  /** A sale as the server answered it: in the list, or out of it when it moved to another year. */
  const put = (sale: SaleRead) =>
    setData((rows) => {
      if (sale.fiscal_year_id !== current.id) return rows.filter((r) => r.id !== sale.id)
      return rows.some((r) => r.id === sale.id) ? rows.map((r) => (r.id === sale.id ? sale : r)) : [...rows, sale]
    })
  const drop = (ids: number[]) => setData((rows) => rows.filter((r) => !ids.includes(r.id)))

  function add() {
    const created = createPiece<SaleRead>('sale', refs!.paymentMethods)
    if (!created) {
      toast('Ajoutez d’abord un moyen de paiement qui n’est pas une carte.', { tone: 'negative' })
      return
    }
    created.then(
      (sale) => {
        put(sale)
        setOpen({ id: sale.id, isNew: true })
      },
      (e) => toast(messageOf(e), { tone: 'negative' }),
    )
  }

  function copy(sale: SaleRead, credit: boolean) {
    const description = credit ? `Note de crédit · ${sale.description}` : `${sale.description} (copie)`.trim()
    copyPiece('sale', sale, { kind: credit ? 'credit_note' : sale.kind, description }).then(
      (made) => {
        put(made)
        if (credit) setOpen({ id: made.id, isNew: false })
        else toast(`Copiée en ${reference('S', made.number)}.`, { tone: 'positive' })
      },
      (e) => toast(messageOf(e), { tone: 'negative' }),
    )
  }

  const markPaid = (ids: number[], paid: boolean) =>
    void each(ids, (id) => setPaid<SaleRead>('sale', id, paid)).then((done) => done.forEach((d) => put(d.value)))

  const doomed = deleting ? data.filter((s) => deleting.includes(s.id)) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer ${reference('S', doomed[0].number)} ?` : `Supprimer ${doomed.length} ventes ?`,
        description: one
          ? SALE_COPY.removeNote
          : 'Ces ventes, leurs lignes et leurs paiements au journal financier sont supprimés. C’est définitif.',
        rows: doomed.map((s) => ({
          label: `${reference('S', s.number)} · ${SALE_COPY.describe(s)}`,
          detail: rowAmount(s, s.total),
        })),
        action: one ? SALE_COPY.remove : `Supprimer ${doomed.length} ventes`,
        onConfirm: () => {
          const ids = doomed.map((s) => s.id)
          setDeleting(null)
          void each(ids, (id) => deletePiece('sale', id)).then((done) => drop(done.map((d) => d.id)))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined

  const panel = open ? (
    <SalePanel
      key={open.id}
      id={open.id}
      isNew={open.isNew}
      initial={data.find((s) => s.id === open.id)}
      refs={refs}
      onClose={() => setOpen(null)}
      onChange={put}
      onDeleted={(id) => {
        drop([id])
        setOpen((o) => (o?.id === id ? null : o))
      }}
    />
  ) : null
  const openId = (id: number) => setOpen({ id, isNew: false })

  if (mobile) {
    return (
      <>
        <SalesCards rows={data} fiscalYear={current} onAdd={add} onOpen={openId} />
        {panel}
      </>
    )
  }

  return (
    <>
      <SalesTable
        rows={data}
        fiscalYear={current}
        onAdd={add}
        onOpen={openId}
        onDuplicate={(s) => copy(s, false)}
        onCreditNote={(s) => copy(s, true)}
        onSetPaid={markPaid}
        onDelete={setDeleting}
      />
      {deleteConfirm ? <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} /> : panel}
    </>
  )
}
