import { useState, type ReactNode } from 'react'
import { Badge, Button, Callout, Field, Input, Select, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { AvailableLine, DepreciationModelRead, FixedAssetRead, RegisterRow } from '../../api/types'
import { messageOf } from '../../errors'
import { eur, formatDate } from '../../format'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { reference } from '../../pieces/pieceStatus'
import { useSavedPick, useSavedText } from '../../pieces/useSavedField'
import { PurchasePanel } from '../purchases/PurchasesForm'
import { statusOf } from './fixedAssetsList'
import { PurchaseLinePicker } from './PurchaseLinePicker'
import { ScheduleTable } from './ScheduleTable'
import { useFixedAsset } from './useFixedAsset'

/** The words of a deletion, shared by the register's rows and the form. */
export const REMOVE_NOTE =
  'L’immobilisation et son tableau d’amortissement sont supprimés ; la ligne d’achat redevient disponible. C’est définitif.'

/** The desktop dialog or the mobile full-screen form around an asset's fields. */
function Shell({
  title,
  description,
  mobile,
  onClose,
  remove,
  confirm,
  children,
}: {
  title: string
  description?: ReactNode
  mobile: boolean
  onClose(): void
  remove?: { label: string; run(): void }
  confirm?: DeleteConfirmProps
  children: ReactNode
}) {
  if (mobile) {
    return (
      <FullScreenForm title={title} onClose={onClose} remove={remove} confirm={confirm}>
        {children}
      </FullScreenForm>
    )
  }
  if (confirm) return <EditDialog confirm={confirm} onClose={confirm.onCancel} />
  return (
    <EditDialog title={title} description={description} size="xl" onClose={onClose} remove={remove}>
      {children}
    </EditDialog>
  )
}

function modelOptions(models: DepreciationModelRead[], current?: number) {
  return models.map((m) => ({ value: String(m.id), label: m.label })).concat(
    current !== undefined && !models.some((m) => m.id === current) ? [{ value: String(current), label: 'Modèle supprimé' }] : [],
  )
}

/** Value and date as the purchase line gives them: read only. */
function Derived({ value, date, children }: { value: string; date: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-4">
      <Field label="Valeur d’acquisition">
        <Input readOnly numeric aria-label="Valeur d’acquisition" value={eur(value)} />
      </Field>
      <Field label="Date d’acquisition">
        <Input readOnly aria-label="Date d’acquisition" value={formatDate(date, 'full')} />
      </Field>
      {children}
    </div>
  )
}

/**
 * "Nouvelle immobilisation": the register's way in starts by picking the purchase line
 * the asset takes over; then its value and date show read only, the description is
 * prefilled from the line, and the depreciation model is chosen. "Ajouter au registre"
 * creates the asset, which then opens in its own form.
 */
export function NewFixedAsset({
  models,
  mobile,
  onClose,
  onCreated,
}: {
  models: DepreciationModelRead[]
  mobile: boolean
  onClose(): void
  onCreated(asset: FixedAssetRead): void
}) {
  const [line, setLine] = useState<AvailableLine | null>(null)
  const [description, setDescription] = useState('')
  const [model, setModel] = useState<string>(models[0] ? String(models[0].id) : '')
  const [busy, setBusy] = useState(false)

  function pick(l: AvailableLine | null) {
    setLine(l)
    setDescription(l?.description ?? '')
  }

  function create() {
    if (!line || !model || busy) return
    setBusy(true)
    api
      .post<FixedAssetRead>('/fixed-assets', {
        purchase_line_id: line.id,
        description: description.trim(),
        depreciation_model_id: Number(model),
      })
      .then(onCreated, (e) => {
        setBusy(false)
        toast(messageOf(e), { tone: 'negative' })
      })
  }

  return (
    <Shell
      title="Nouvelle immobilisation"
      description="Choisissez d’abord la ligne d’achat que le bien reprend"
      mobile={mobile}
      onClose={onClose}
    >
      <PurchaseLinePicker line={line} onPick={pick} onClear={() => pick(null)} />
      {line ? (
        <>
          <Derived value={line.charge} date={line.booking_date}>
            <Field label="Pièce liée">
              <Input readOnly aria-label="Pièce liée" value={reference('A', line.purchase_number)} />
            </Field>
          </Derived>
          <Field label="Description">
            <Input
              placeholder="Le bien, tel qu’on le reconnaît"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Modèle d’amortissement">
            <Select options={modelOptions(models)} value={model} onValueChange={setModel} />
          </Field>
          {models.length === 0 ? (
            <Callout tone="warning" title="Aucun modèle d’amortissement">
              Ajoutez d’abord un modèle dans « modèles d’amortissement ».
            </Callout>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={busy || !model} onClick={create}>
              Ajouter au registre
            </Button>
          </div>
        </>
      ) : null}
    </Shell>
  )
}

function AssetFields({
  asset,
  row,
  models,
  mobile,
  editor,
}: {
  asset: FixedAssetRead
  row: RegisterRow | undefined
  models: DepreciationModelRead[]
  mobile: boolean
  editor: ReturnType<typeof useFixedAsset>
}) {
  const [purchase, setPurchase] = useState(false)
  const description = useSavedText(asset.description, (text) => editor.patch({ description: text.trim() }))
  const [model, pickModel] = useSavedPick(asset.depreciation_model_id, (id) =>
    editor.patch({ depreciation_model_id: id }),
  )
  const status = row ? statusOf(row.status) : null

  return (
    <>
      {status ? (
        <div className="flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      ) : null}
      <Field label="Description">
        <Input placeholder="Le bien, tel qu’on le reconnaît" maxLength={200} {...description} />
      </Field>
      <Derived value={asset.value} date={asset.acquired_on}>
        <Field label="Pièce liée">
          <Button variant="secondary" onClick={() => setPurchase(true)}>
            {reference('A', asset.purchase_number)} · ouvrir l’achat
          </Button>
        </Field>
      </Derived>
      <Field label="Modèle d’amortissement">
        <Select
          options={modelOptions(models, model)}
          value={String(model)}
          onValueChange={(v) => pickModel(Number(v))}
        />
      </Field>
      <ScheduleTable asset={asset} mobile={mobile} onType={editor.typeYear} onRecompute={editor.recompute} />
      {purchase ? (
        <PurchasePanel
          id={asset.purchase_id}
          onClose={() => {
            setPurchase(false)
            // The line's amount, VAT scheme or the booking date may have moved the value and the schedule.
            void editor.reload()
          }}
        />
      ) : null}
    </>
  )
}

/**
 * A fixed asset open in its form (`Immobilisations` artboards): description, value and
 * date read only beside the linked purchase, the model, the schedule, and the delete with
 * its confirmation. Every field saves itself; usable by id with only a way to close it.
 */
export function FixedAssetPanel({
  id,
  row,
  models,
  mobile,
  onClose,
  onChange,
  onDeleted,
}: {
  id: number
  /** The register's row of the asset, for its status. */
  row?: RegisterRow
  models: DepreciationModelRead[]
  mobile: boolean
  onClose(): void
  onChange?(asset: FixedAssetRead): void
  onDeleted?(id: number): void
}) {
  const editor = useFixedAsset(id, { onChange, onDeleted })
  const [confirming, setConfirming] = useState(false)
  const asset = editor.asset

  if (editor.error) {
    return (
      <EditDialog title="Immobilisation" onClose={onClose}>
        <Callout tone="negative" title="L’immobilisation n’a pas pu être chargée.">
          {messageOf(editor.error)}
        </Callout>
      </EditDialog>
    )
  }
  if (!asset) return null

  const ref = reference('I', asset.number)
  const confirm: DeleteConfirmProps | undefined = confirming
    ? {
        title: `Supprimer ${ref} ?`,
        description: REMOVE_NOTE,
        rows: mobile ? [] : [{ label: asset.description || 'Immobilisation sans description', detail: eur(asset.value) }],
        action: mobile ? 'Supprimer' : 'Supprimer l’immobilisation',
        onConfirm: () => {
          editor.remove()
          onClose()
        },
        onCancel: () => setConfirming(false),
      }
    : undefined

  return (
    <Shell
      title={`Immobilisation ${ref}`}
      description={asset.description || 'Immobilisation sans description'}
      mobile={mobile}
      onClose={onClose}
      remove={{ label: 'Supprimer l’immobilisation', run: () => setConfirming(true) }}
      confirm={confirm}
    >
      <AssetFields asset={asset} row={row} models={models} mobile={mobile} editor={editor} />
    </Shell>
  )
}
