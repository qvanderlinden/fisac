import { useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { Card, Field, Select } from '@qvanderlinden/ui'
import type { CompanyRead, LegalForm, VatRegime } from '../../api/types'
import { checkIban, groupIban, normalizeIban } from '../../iban'
import { InfoLabel } from '../../lists/InfoLabel'
import { SavedText, type CompanySave } from './companyFields'
import { MONTHS, fiscalYearHint } from './fiscalYearHint'

const LEGAL_FORMS: { value: LegalForm; label: string }[] = [
  { value: 'srl', label: 'SRL' },
  { value: 'sa', label: 'SA' },
  { value: 'sc', label: 'SC' },
  { value: 'natural_person', label: 'Personne physique' },
]

const VAT_REGIMES: { value: VatRegime; label: string; hint: string }[] = [
  { value: 'quarterly', label: 'Déclaration trimestrielle', hint: 'Une déclaration par trimestre sur l’écran TVA' },
  { value: 'monthly', label: 'Déclaration mensuelle', hint: 'Une déclaration par mois sur l’écran TVA' },
  { value: 'franchise', label: 'Franchise', hint: 'Pas de TVA facturée ni récupérée' },
  { value: 'none', label: 'Non assujetti', hint: 'Pas de TVA facturée ni récupérée' },
]

const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: `1er ${m}` }))

/**
 * A select that saves its pick at once; a failed save puts the server's value back,
 * unless another was picked since.
 */
function SavedSelect<K extends 'legal_form' | 'vat_regime' | 'fiscal_year_start_month'>({
  label,
  field,
  company,
  save,
  options,
  toValue,
  fromValue,
}: {
  label: React.ReactNode
  field: K
  company: CompanyRead
  save: CompanySave
  options: { value: string; label: string }[]
  toValue(stored: CompanyRead[K]): string
  fromValue(value: string): CompanyRead[K]
}) {
  const [value, setValue] = useState(toValue(company[field]))
  const picked = useRef(value)

  async function pick(next: string) {
    picked.current = next
    setValue(next)
    const result = await save({ [field]: fromValue(next) })
    if (!result.ok && picked.current === next) {
      picked.current = toValue(result.server[field])
      setValue(picked.current)
    }
  }

  return (
    <Field label={label}>
      <Select options={options} value={value} onValueChange={(v) => void pick(v)} />
    </Field>
  )
}

/**
 * The company's identity and settings (`Societe` and `MobileSociete` artboards): the
 * name, form, BCE number, VAT regime and registered office, then the bank account and the
 * month the fiscal year starts on. Each field saves itself. Desktop shows two cards,
 * mobile two sections under their eyebrows.
 */
export function CompanyIdentity({
  company,
  save,
  mobile,
}: {
  company: CompanyRead
  save: CompanySave
  mobile: boolean
}) {
  // The hints follow the pick as soon as it is made; a failed save puts it back.
  const [regime, setRegime] = useState(company.vat_regime)
  const [startMonth, setStartMonth] = useState(company.fiscal_year_start_month)
  const following: CompanySave = async (patch) => {
    if (patch.vat_regime) setRegime(patch.vat_regime)
    if (patch.fiscal_year_start_month) setStartMonth(patch.fiscal_year_start_month)
    const result = await save(patch)
    if (!result.ok) {
      setRegime(result.server.vat_regime)
      setStartMonth(result.server.fiscal_year_start_month)
    }
    return result
  }

  const identity = (
    <>
      <SavedText
        label="Dénomination"
        field="name"
        company={company}
        save={save}
        parse={(text) => text.trim()}
        ready={(text) => text.trim() !== ''}
        error={(text) => (text.trim() === '' ? 'Donnez un nom : sans nom, le précédent est gardé.' : undefined)}
      />
      <SavedSelect
        label="Forme juridique"
        field="legal_form"
        company={company}
        save={save}
        options={LEGAL_FORMS}
        toValue={(v) => v}
        fromValue={(v) => v as LegalForm}
      />
      <SavedText label="Numéro BCE" field="bce_number" company={company} save={save} placeholder="0000.000.000" />
      <SavedSelect
        label={<InfoLabel info={VAT_REGIMES.find((r) => r.value === regime)?.hint ?? ''}>Régime TVA</InfoLabel>}
        field="vat_regime"
        company={company}
        save={following}
        options={VAT_REGIMES}
        toValue={(v) => v}
        fromValue={(v) => v as VatRegime}
      />
      <SavedText label="Siège social" field="registered_office" company={company} save={save} />
      <SavedText
        label={<InfoLabel info="Une petite société n’a pas de majoration pour absence de versements anticipés pendant ses trois premiers exercices">Date de constitution</InfoLabel>}
        field="incorporated_on"
        company={company}
        save={save}
        type="date"
        delay={null}
      />
    </>
  )

  const settings = (
    <>
      <SavedText
        label={<InfoLabel info="Le compte du journal financier">Compte bancaire</InfoLabel>}
        field="iban"
        company={company}
        save={save}
        read={(stored) => groupIban(stored ?? '')}
        parse={normalizeIban}
        ready={(text) => checkIban(text).state !== 'invalid'}
        error={(text) => {
          const check = checkIban(text)
          return check.state === 'invalid'
            ? `IBAN invalide : vérifiez les chiffres${check.country ? ` (${check.country})` : ''}`
            : undefined
        }}
        placeholder="BE00 0000 0000 0000"
        className="font-mono tracking-wide"
        autoComplete="off"
        spellCheck={false}
      />
      <SavedSelect
        label={<InfoLabel info={fiscalYearHint(startMonth)}>Début de l’exercice</InfoLabel>}
        field="fiscal_year_start_month"
        company={company}
        save={following}
        options={MONTH_OPTIONS}
        toValue={String}
        fromValue={Number}
      />
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <span className="text-sm font-medium text-fg-strong">Comptabilité</span>
        <div className="flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2.5 text-sm text-fg-body">
          <Lock size={14} className="mt-0.5 flex-none" aria-hidden />
          <span>simplifiée · livres des achats, des ventes et journal financier</span>
        </div>
      </div>
    </>
  )

  if (mobile) {
    return (
      <>
        <section className="flex flex-col gap-4">
          <span className="type-eyebrow text-fg-muted">société</span>
          {identity}
        </section>
        <section className="flex flex-col gap-4">
          <span className="type-eyebrow text-fg-muted">paramètres</span>
          {settings}
        </section>
      </>
    )
  }

  const grid = 'grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-x-6 gap-y-4'
  return (
    <>
      <Card title="Société" subtitle="Son nom, sa forme et son régime de TVA">
        <div className={grid}>{identity}</div>
      </Card>
      <Card title="Paramètres" subtitle="Le compte bancaire, l’exercice et la comptabilité">
        <div className={grid}>{settings}</div>
      </Card>
    </>
  )
}
