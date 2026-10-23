import { useState, type ComponentType } from 'react'
import { Callout, toast } from '@qvanderlinden/ui'
import type { PurchaseRead, SaleRead } from '../api/types'
import { messageOf } from '../errors'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useResource } from '../hooks/useResource'
import type { DeleteConfirmProps } from '../lists/DeleteConfirm'
import { EditDialog } from '../lists/EditDialog'
import { useFiscalYear } from '../shell/FiscalYearContext'
import { rowAmount } from './listLabels'
import { PiecesCards } from './PiecesCards'
import { PiecesTable } from './PiecesTable'
import { copyPiece, createPiece, deletePiece, setPaid } from './pieceActions'
import { reference } from './pieceStatus'
import { SIDE_COPY } from './sideCopy'
import type { SidePanelProps } from './SidePanel'
import { piecesPath } from './usePiece'
import { usePieceRefs, type PieceSide } from './usePieceRefs'

/** Runs one request per id; resolves the answers that came, toasting the first failure. */
async function each<R>(ids: number[], request: (id: number) => Promise<R>): Promise<{ id: number; value: R }[]> {
  const results = await Promise.allSettled(ids.map((id) => request(id).then((value) => ({ id, value }))))
  const refused = results.find((r) => r.status === 'rejected')
  if (refused) toast(messageOf(refused.reason), { tone: 'negative' })
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

/**
 * The Ventes or Achats screen: the current fiscal year's pieces of the side as a table
 * (desktop) or cards (mobile), the piece open in its `Panel` (`SalePanel` /
 * `PurchasePanel`), and the list's own actions: new, duplicate, credit note, mark paid,
 * delete.
 */
export function PiecesScreen<T extends SaleRead | PurchaseRead>({
  side,
  Panel,
}: {
  side: PieceSide
  Panel: ComponentType<SidePanelProps<T>>
}) {
  const copy = SIDE_COPY[side]
  const mobile = useMediaQuery('(max-width: 640px)')
  const { current } = useFiscalYear()
  const { data, error, setData } = useResource<T[]>(current ? `/fiscal-years/${current.id}${piecesPath(side)}` : null)
  const { refs, error: refsError } = usePieceRefs(side)
  const [open, setOpen] = useState<{ id: number; isNew: boolean } | null>(null)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  const failure = error ?? refsError
  if (failure) {
    return (
      <Callout tone="negative" title={copy.loadError}>
        {messageOf(failure)}
      </Callout>
    )
  }
  if (!data || !refs || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const monthly = refs.vatRegime === 'monthly'
  /** A piece as the server answered it: in the list, or out of it when it moved to another year. */
  const put = (piece: T) =>
    setData((rows) => {
      if (piece.fiscal_year_id !== current.id) return rows.filter((r) => r.id !== piece.id)
      return rows.some((r) => r.id === piece.id) ? rows.map((r) => (r.id === piece.id ? piece : r)) : [...rows, piece]
    })
  const drop = (ids: number[]) => setData((rows) => rows.filter((r) => !ids.includes(r.id)))

  function add() {
    const created = createPiece<T>(side, refs!.paymentMethods)
    if (!created) {
      const missing = side === 'sale' ? 'un moyen de paiement qui n’est pas une carte' : 'un moyen de paiement'
      toast(`Ajoutez d’abord ${missing}.`, { tone: 'negative' })
      return
    }
    created.then(
      (piece) => {
        put(piece)
        setOpen({ id: piece.id, isNew: true })
      },
      (e) => toast(messageOf(e), { tone: 'negative' }),
    )
  }

  function duplicate(piece: T, credit: boolean) {
    const description = credit ? `Note de crédit · ${piece.description}` : `${piece.description} (copie)`.trim()
    copyPiece(side, piece, { kind: credit ? 'credit_note' : piece.kind, description }).then(
      (made) => {
        put(made)
        if (credit) setOpen({ id: made.id, isNew: false })
        else toast(`${copy.copiedTo} ${reference(copy.prefix, made.number)}.`, { tone: 'positive' })
      },
      (e) => toast(messageOf(e), { tone: 'negative' }),
    )
  }

  const markPaid = (ids: number[], paid: boolean) =>
    void each(ids, (id) => setPaid<T>(side, id, paid)).then((done) => done.forEach((d) => put(d.value)))

  const doomed = deleting ? data.filter((p) => deleting.includes(p.id)) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer ${reference(copy.prefix, doomed[0].number)} ?` : `Supprimer ${doomed.length} ${copy.many} ?`,
        description: one ? copy.removeNote : copy.removeManyNote,
        rows: doomed.map((p) => ({
          label: `${reference(copy.prefix, p.number)} · ${copy.describe(p)}`,
          detail: rowAmount(p, p.total),
        })),
        action: one ? copy.remove : `Supprimer ${doomed.length} ${copy.many}`,
        onConfirm: () => {
          const ids = doomed.map((p) => p.id)
          setDeleting(null)
          void each(ids, (id) => deletePiece(side, id)).then((done) => drop(done.map((d) => d.id)))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined

  const panel = open ? (
    <Panel
      key={open.id}
      id={open.id}
      isNew={open.isNew}
      initial={data.find((p) => p.id === open.id)}
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
        <PiecesCards side={side} rows={data} fiscalYear={current} monthly={monthly} onAdd={add} onOpen={openId} />
        {panel}
      </>
    )
  }

  return (
    <>
      <PiecesTable
        side={side}
        rows={data}
        fiscalYear={current}
        monthly={monthly}
        onAdd={add}
        onOpen={openId}
        onDuplicate={(p) => duplicate(p, false)}
        onCreditNote={(p) => duplicate(p, true)}
        onSetPaid={markPaid}
        onDelete={setDeleting}
      />
      {deleteConfirm ? <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} /> : panel}
    </>
  )
}
