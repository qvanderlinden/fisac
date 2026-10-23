import { useRef, useState } from 'react'
import { Card, Switch } from '@qvanderlinden/ui'
import type { CompanyRead } from '../../api/types'
import { SavedText, type CompanySave } from './companyFields'

/**
 * The manager (`Societe` and `MobileSociete` artboards): name, the date the mandate
 * started, and whether the manager is paid, which decides if the pay is computed each
 * month. Each field saves itself; a failed save puts the server's value back.
 */
export function ManagerCard({ company, save, mobile }: { company: CompanyRead; save: CompanySave; mobile: boolean }) {
  const [paid, setPaid] = useState(company.manager_paid)
  const picked = useRef(paid)

  async function togglePaid(next: boolean) {
    picked.current = next
    setPaid(next)
    const result = await save({ manager_paid: next })
    if (!result.ok && picked.current === next) {
      picked.current = result.server.manager_paid
      setPaid(result.server.manager_paid)
    }
  }

  const fields = (
    <>
      <SavedText label="Nom" field="manager_name" company={company} save={save} />
      <SavedText label="Mandat depuis" field="manager_since" company={company} save={save} type="date" />
    </>
  )
  const pay = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <Switch label="Rémunéré" checked={paid} onCheckedChange={(v) => void togglePaid(v)} />
      <span className="text-sm text-fg-muted">
        {paid ? 'Sa rémunération est calculée chaque mois.' : 'Aucune rémunération n’est calculée.'}
      </span>
    </div>
  )

  if (mobile) {
    return (
      <section className="flex flex-col gap-4">
        <span className="type-eyebrow text-fg-muted">gérant</span>
        {fields}
        <div className="rounded-lg border border-line-hairline bg-surface-card px-4 py-3.5">{pay}</div>
      </section>
    )
  }

  return (
    <Card title="Gérant" subtitle="Le mandataire de la société">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-4">{fields}</div>
        <div className="border-t border-line-hairline pt-3">{pay}</div>
      </div>
    </Card>
  )
}
