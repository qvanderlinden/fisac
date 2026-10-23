import { useState } from 'react'
import { Callout } from '@qvanderlinden/ui'
import type { FinancialAccountRead, PaymentMethodRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { METHOD_DEFAULTS, PaymentMethodsForm, type MethodFields } from './PaymentMethodsForm'
import { PaymentMethodsCards } from './PaymentMethodsCards'
import { PaymentMethodsTable } from './PaymentMethodsTable'
import { displayName, parseDay } from './paymentMethodsList'

/**
 * A payment method in the form. The API needs a name, a type and, for a card, both
 * statement days, for the others a financial account: a new method is POSTed by the first
 * save that completes them (the form says so), a blank name is never sent, and a new
 * method whose name is erased again is deleted when the form closes. The type and the
 * account are fixed once created: only the name and the days are PATCHed.
 */
const RULES: EditRules<PaymentMethodRead, MethodFields> = {
  fields: (row) =>
    row
      ? {
          name: row.name,
          type: row.type,
          accountId: String(row.financial_account_id),
          closing: row.statement_closing_day?.toString() ?? '',
          payment: row.statement_payment_day?.toString() ?? '',
        }
      : METHOD_DEFAULTS,
  // A type or account picked on a new method sends `{}`: no field to PATCH, but the save
  // reaches the session, which POSTs the method if it is complete. A created method's form
  // never picks them.
  patchBody: (patch) => {
    if (patch.name !== undefined && patch.name.trim() === '') return null
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name.trim()
    if (patch.closing !== undefined) body.statement_closing_day = Number(patch.closing)
    if (patch.payment !== undefined) body.statement_payment_day = Number(patch.payment)
    return body
  },
  createBody: (local) => {
    const name = local.name.trim()
    if (!name) return null
    if (local.type === 'card') {
      const closing = parseDay(local.closing)
      const payment = parseDay(local.payment)
      return closing === null || payment === null
        ? null
        : { name, type: 'card', statement_closing_day: closing, statement_payment_day: payment }
    }
    return local.accountId ? { name, type: local.type, financial_account_id: Number(local.accountId) } : null
  },
  discard: (local) => local.name.trim() === '',
}

/**
 * The Moyens de paiement screen: loads the methods and the financial accounts, shows the
 * table (desktop) or the cards (mobile), and owns the edit form, its saves
 * (`useEditSession`) and the deletions.
 */
export function PaymentMethodsScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const { data, error, setData } = useResource<PaymentMethodRead[]>('/payment-methods')
  const accountsResource = useResource<FinancialAccountRead[]>('/financial-accounts')
  const { editing, open, close, remove } = useEditSession('/payment-methods', setData, RULES)
  const [deleting, setDeleting] = useState<number[] | null>(null)

  const failure = error ?? accountsResource.error
  if (failure) {
    return (
      <Callout tone="negative" title="Les moyens de paiement n’ont pas pu être chargés.">
        {messageOf(failure)}
      </Callout>
    )
  }
  const accounts = accountsResource.data
  if (!data || !accounts) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const openRow = (row: PaymentMethodRead | null) => {
    setDeleting(null)
    open(row)
  }
  const openId = (id: number) => {
    const m = data.find((r) => r.id === id)
    if (m) openRow(m)
  }
  const askDelete = (ids: number[]) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting(ids)
  }

  const row = editing && editing.id !== null ? data.find((r) => r.id === editing.id) : undefined
  const title = editing && row === undefined ? 'Nouveau moyen de paiement' : displayName(row)
  const doomed = deleting ? data.filter((r) => deleting.includes(r.id) && r.uses === 0) : []
  const one = doomed.length === 1
  const deleteConfirm: DeleteConfirmProps | undefined = doomed.length
    ? {
        title: one ? `Supprimer « ${doomed[0].name || 'le moyen'} » ?` : `Supprimer ${doomed.length} moyens de paiement ?`,
        description: one ? 'Aucune pièce ne le porte. C’est définitif.' : 'Aucune pièce ne les porte. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : doomed.map((m) => ({ label: displayName(m), detail: m.financial_account_name })),
        action: mobile ? 'Supprimer' : one ? 'Supprimer le moyen de paiement' : `Supprimer ${doomed.length} moyens`,
        onConfirm: () => {
          setDeleting(null)
          void remove(doomed.map((m) => m.id))
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  const removeAction =
    row && row.uses === 0 ? { label: 'Supprimer le moyen de paiement', run: () => askDelete([row.id]) } : undefined

  const form = editing ? (
    <PaymentMethodsForm key={editing.key} row={row} mobile={mobile} accounts={accounts} onSave={editing.save} />
  ) : null

  if (mobile) {
    return (
      <>
        <PaymentMethodsCards rows={data} onAdd={() => openRow(null)} onOpen={openId} />
        {editing ? (
          <FullScreenForm title={title} onClose={close} remove={removeAction} confirm={deleteConfirm}>
            {form}
          </FullScreenForm>
        ) : null}
      </>
    )
  }

  return (
    <>
      <PaymentMethodsTable rows={data} onAdd={() => openRow(null)} onOpen={openId} onDelete={askDelete} />
      {deleteConfirm ? (
        <EditDialog confirm={deleteConfirm} onClose={deleteConfirm.onCancel} />
      ) : editing ? (
        <EditDialog title={title} onClose={close} remove={removeAction}>
          {form}
        </EditDialog>
      ) : null}
    </>
  )
}
