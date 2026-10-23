import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Callout, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { DepreciationModelRead, RegisterRow } from '../../api/types'
import { messageOf } from '../../errors'
import { eur } from '../../format'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { reference } from '../../pieces/pieceStatus'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { FixedAssetPanel, NewFixedAsset, REMOVE_NOTE } from './FixedAssetForm'
import { FixedAssetsCards } from './FixedAssetsCards'
import { FixedAssetsTable } from './FixedAssetsTable'

type Open = { kind: 'new' } | { kind: 'asset'; id: number }

/**
 * The Immobilisations screen: the register of the current fiscal year (table on desktop,
 * cards on mobile), "Nouvelle immobilisation" (pick a purchase line first), the asset's
 * form, the deletion with its confirmation and the linked purchase opened in place.
 * `?asset=<id>` opens that asset's form on load (a purchase line links there); closing
 * the form clears it.
 */
export function FixedAssetsScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { current } = useFiscalYear()
  const register = useResource<RegisterRow[]>(current ? `/fiscal-years/${current.id}/fixed-assets` : null)
  const models = useResource<DepreciationModelRead[]>('/depreciation-models')
  const [params, setParams] = useSearchParams()
  const [opened, setOpened] = useState<Open | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [purchase, setPurchase] = useState<number | null>(null)

  const failure = register.error ?? models.error
  if (failure) {
    return (
      <Callout tone="negative" title="Le registre n’a pas pu être chargé.">
        {messageOf(failure)}
      </Callout>
    )
  }
  if (!register.data || !models.data || !current) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const rows = register.data
  const fromQuery = Number(params.get('asset')) || null
  const open: Open | null = opened ?? (fromQuery ? { kind: 'asset', id: fromQuery } : null)

  function close() {
    setOpened(null)
    if (params.has('asset')) {
      const next = new URLSearchParams(params)
      next.delete('asset')
      setParams(next, { replace: true })
    }
  }
  // The register's figures follow each save of the form.
  const refresh = () => void register.reload()
  const drop = (id: number) => {
    register.setData((r) => r.filter((x) => x.id !== id))
    refresh()
  }

  const doomed = deleting !== null ? rows.find((r) => r.id === deleting) : undefined
  const deleteConfirm: DeleteConfirmProps | undefined = doomed
    ? {
        title: `Supprimer ${reference('I', doomed.number)} ?`,
        description: REMOVE_NOTE,
        rows: [{ label: doomed.description || 'Immobilisation sans description', detail: eur(doomed.value) }],
        action: 'Supprimer l’immobilisation',
        onConfirm: () => {
          const id = doomed.id
          setDeleting(null)
          api.del(`/fixed-assets/${id}`).then(
            () => drop(id),
            (e) => toast(messageOf(e), { tone: 'negative' }),
          )
        },
        onCancel: () => setDeleting(null),
      }
    : undefined

  const list = {
    rows,
    models: models.data,
    fiscalYear: current,
    onAdd: () => setOpened({ kind: 'new' }),
    onOpen: (id: number) => setOpened({ kind: 'asset', id }),
  }

  const panel =
    open?.kind === 'new' ? (
      <NewFixedAsset
        models={models.data}
        mobile={mobile}
        onClose={close}
        onCreated={(asset) => {
          refresh()
          setOpened({ kind: 'asset', id: asset.id })
        }}
      />
    ) : open ? (
      <FixedAssetPanel
        key={open.id}
        id={open.id}
        row={rows.find((r) => r.id === open.id)}
        models={models.data}
        mobile={mobile}
        onClose={close}
        onChange={refresh}
        onDeleted={drop}
      />
    ) : null

  return (
    <>
      {mobile ? (
        <FixedAssetsCards {...list} />
      ) : (
        <FixedAssetsTable {...list} onOpenPurchase={setPurchase} onDelete={setDeleting} />
      )}
      {deleteConfirm ? <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} /> : panel}
      {purchase !== null ? (
        <PurchasePanel
          id={purchase}
          onClose={() => {
            setPurchase(null)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}
