import { useRef, useState } from 'react'
import { Check, Loader } from 'lucide-react'
import { Callout, Icon, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { CompanyRead, EquityLineRead, PartnerRead } from '../../api/types'
import { messageOf } from '../../errors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useResource } from '../../hooks/useResource'
import type { DeleteConfirmProps } from '../../lists/DeleteConfirm'
import { EditDialog } from '../../lists/EditDialog'
import { FullScreenForm } from '../../lists/FullScreenForm'
import { useEditSession, type EditRules } from '../../lists/useEditSession'
import { createSerialQueue } from '../../serialQueue'
import { useFiscalYear } from '../../shell/FiscalYearContext'
import { amountInput } from '../../format'
import { type CompanySave } from './companyFields'
import { CompanyIdentity } from './CompanyIdentity'
import { EquityCard } from './EquityCard'
import { MONTHS } from './fiscalYearHint'
import { ManagerCard } from './ManagerCard'
import { PartnerForm, type PartnerFields } from './PartnerForm'
import { PartnersCards } from './PartnersCards'
import { PartnersTable } from './PartnersTable'
import { displayName, parseContribution, parseShares, totalsOf } from './partners'

/**
 * A partner in the form. The API needs a name: a new partner is POSTed with the first
 * name typed (parts and contribution typed before it go with it, none counting as zero),
 * a blank name is never sent, and a new partner whose name is erased again is deleted
 * when the form closes. A parts or contribution text that cannot be sent is left out.
 */
const RULES: EditRules<PartnerRead, PartnerFields> = {
  fields: (row) => ({
    name: row?.name ?? '',
    parts: row ? String(row.shares) : '',
    apport: row ? amountInput(row.contribution) : '',
  }),
  patchBody: (patch) => {
    if (patch.name !== undefined && patch.name.trim() === '') return null
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name.trim()
    if (patch.parts !== undefined) {
      const shares = parseShares(patch.parts)
      if (shares === null) return null
      body.shares = shares
    }
    if (patch.apport !== undefined) {
      const contribution = parseContribution(patch.apport)
      if (contribution === null) return null
      body.contribution = contribution
    }
    return body
  },
  createBody: (local) =>
    local.name.trim()
      ? {
          name: local.name.trim(),
          shares: parseShares(local.parts) ?? 0,
          contribution: parseContribution(local.apport) ?? '0',
        }
      : null,
  discard: (local) => local.name.trim() === '',
}

/**
 * The Structure société page (`Societe` and `MobileSociete` artboards): the company's
 * identity and settings and the manager, each field saving itself with a PATCH of that
 * field alone; the read-only equity; and the partners with their edit form
 * (`useEditSession`) and deletion.
 */
export function CompanyScreen() {
  const mobile = useMediaQuery('(max-width: 640px)')
  const company = useResource<CompanyRead>('/company')
  const partners = useResource<PartnerRead[]>('/partners')
  const { current } = useFiscalYear()
  const equity = useResource<EquityLineRead[]>(current ? `/fiscal-years/${current.id}/equity-lines` : null)
  const { setData: setPartners } = partners
  const { editing, open, close, remove } = useEditSession('/partners', setPartners, RULES)
  const [deleting, setDeleting] = useState<number | null>(null)

  // The company as the server last confirmed it, and the saves in flight.
  const confirmed = useRef<CompanyRead | undefined>(undefined)
  confirmed.current = company.data
  const queue = useRef(createSerialQueue())
  const [saving, setSaving] = useState(0)
  const { setData: setCompany } = company

  const save: CompanySave = async (patch) => {
    setSaving((n) => n + 1)
    try {
      const saved = await queue.current(() => api.patch<CompanyRead>('/company', patch))
      confirmed.current = saved
      setCompany(() => saved)
      return { ok: true }
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
      return { ok: false, server: confirmed.current as CompanyRead }
    } finally {
      setSaving((n) => n - 1)
    }
  }

  const failed = company.error ?? partners.error
  if (failed) {
    return (
      <Callout tone="negative" title="La structure de la société n’a pas pu être chargée.">
        {messageOf(failed)}
      </Callout>
    )
  }
  if (!company.data || !partners.data) return <p className="type-body-sm text-fg-muted">Chargement…</p>

  const rows = partners.data
  const openId = (id: number) => {
    const p = rows.find((r) => r.id === id)
    if (p) {
      setDeleting(null)
      open(p)
    }
  }
  const add = () => {
    setDeleting(null)
    open(null)
  }
  const askDelete = (id: number) => {
    // The desktop dialog swaps the form for the confirmation; the mobile form shows it under its fields.
    if (!mobile) close()
    setDeleting(id)
  }

  const row = editing && editing.id !== null ? rows.find((r) => r.id === editing.id) : undefined
  const title = editing?.isNew ? 'Nouvel associé' : displayName(row)
  const doomed = deleting === null ? undefined : rows.find((r) => r.id === deleting)
  const deleteConfirm: DeleteConfirmProps | undefined = doomed
    ? {
        title: `Retirer « ${displayName(doomed)} » ?`,
        description: 'Ses parts et son apport disparaissent des totaux. C’est définitif.',
        // The mobile form confirms under its own fields, without the list.
        rows: mobile ? [] : [{ label: displayName(doomed), detail: `${doomed.shares} parts` }],
        action: mobile ? 'Retirer' : 'Retirer l’associé',
        onConfirm: () => {
          setDeleting(null)
          void remove([doomed.id])
        },
        onCancel: () => setDeleting(null),
      }
    : undefined
  // The last partner stays: the company always has one.
  const removeAction =
    row && rows.length > 1 ? { label: 'Retirer l’associé', run: () => askDelete(row.id) } : undefined

  const form = editing ? (
    <PartnerForm
      key={editing.key}
      row={row}
      isNew={editing.isNew}
      mobile={mobile}
      otherShares={totalsOf(rows.filter((r) => r.id !== editing.id)).shares}
      onSave={editing.save}
    />
  ) : null

  const status = (
    <span role="status" className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-muted">
      <Icon icon={saving > 0 ? Loader : Check} size={14} />
      {saving > 0 ? 'enregistrement…' : 'tout est enregistré'}
    </span>
  )
  const intro = 'Les paramètres de la société, son gérant et ses associés'
  const equityTitle = `Capitaux propres au 1er ${MONTHS[company.data.fiscal_year_start_month - 1]}`
  const equityCard = (
    <EquityCard
      title={equityTitle}
      contribution={totalsOf(rows).contribution}
      lines={equity.data}
      mobile={mobile}
    />
  )

  if (mobile) {
    return (
      <>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{intro}</span>
            {status}
          </div>
          <CompanyIdentity company={company.data} save={save} mobile />
          <ManagerCard company={company.data} save={save} mobile />
          {equityCard}
          <PartnersCards rows={rows} onAdd={add} onOpen={openId} />
          <div className="pb-16" />
        </div>
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="type-title text-4xl text-fg-strong">Structure société</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-fg-muted">{intro}</span>
            {status}
          </div>
        </div>
        <CompanyIdentity company={company.data} save={save} mobile={false} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-start gap-6">
          <ManagerCard company={company.data} save={save} mobile={false} />
          {equityCard}
        </div>
        <PartnersTable rows={rows} onAdd={add} onOpen={openId} />
      </div>
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
