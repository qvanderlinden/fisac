import { Search, X } from 'lucide-react'
import { Button, Input, Select, StatCard } from '@qvanderlinden/ui'
import type { DepreciationModelRead, RegisterRow } from '../../api/types'
import { countLabel } from '../../format'
import { NO_FILTER, STATUS_FILTERS, isFiltered, totals, type AssetFilter } from './fixedAssetsList'

/** The four tiles over the register (unfiltered): value, depreciated before, the year's depreciation, what is left. */
export function AssetTiles({ rows, year }: { rows: RegisterRow[]; year: string }) {
  const sums = totals(rows)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="valeur d’acquisition totale"
        value={sums.value}
        format="eur"
        footnote={`${countLabel(rows.length, 'immobilisation', 'immobilisations')} au registre`}
      />
      <StatCard label="amorti au début" value={sums.before} format="eur" footnote="amortissements des exercices passés" />
      <StatCard label={`amortissement ${year}`} value={sums.depreciation} format="eur" footnote="dans le résultat" />
      <StatCard label="valeur à la fin" value={sums.remaining} format="eur" footnote="à l’inventaire" />
    </div>
  )
}

/** The search, the model and the status filters, with "Effacer les filtres" on desktop. */
export function AssetFilters({
  models,
  filter,
  onChange,
  mobile,
}: {
  models: DepreciationModelRead[]
  filter: AssetFilter
  onChange(filter: AssetFilter): void
  mobile: boolean
}) {
  const size = mobile ? 'md' : 'sm'
  const search = (
    <Input
      size={size}
      icon={Search}
      aria-label="Chercher une description ou une réf."
      placeholder="Chercher une description ou une réf."
      className={mobile ? undefined : 'w-80'}
      value={filter.query}
      onChange={(e) => onChange({ ...filter, query: e.target.value })}
    />
  )
  const model = (
    <Select
      size={size}
      aria-label="Modèle d’amortissement"
      className={mobile ? 'w-full min-w-0' : 'w-56'}
      options={[{ value: 'all', label: 'Tous les modèles' }, ...models.map((m) => ({ value: String(m.id), label: m.label }))]}
      value={String(filter.model)}
      onValueChange={(v) => onChange({ ...filter, model: v === 'all' ? 'all' : Number(v) })}
    />
  )
  const status = (
    <Select
      size={size}
      aria-label="Statut"
      className={mobile ? 'w-full min-w-0' : 'w-44'}
      options={STATUS_FILTERS}
      value={filter.status}
      onValueChange={(v) => onChange({ ...filter, status: v as AssetFilter['status'] })}
    />
  )
  if (mobile) {
    return (
      <>
        {search}
        <div className="grid grid-cols-2 gap-2">
          {model}
          {status}
        </div>
      </>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {search}
      {model}
      {status}
      {isFiltered(filter) ? (
        <Button variant="ghost" size="sm" iconLeft={X} onClick={() => onChange(NO_FILTER)}>
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  )
}
