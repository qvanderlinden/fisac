import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast, Badge, Button, Field, IconButton, Input, Select } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import type { CategoryRead, IsocSchemeRead, LineRead, PurchaseLineRead, VatSchemeRead } from '../api/types'
import { amountInput, eur, isBadAmount, parseDecimal, parseQuantity, quantityInput } from '../format'
import { fullDeduction } from './nonDeductible'
import { reference } from './pieceStatus'
import type { PieceSide } from './usePieceRefs'
import { useSavedPick, useSavedText } from './useSavedField'

export type LineField = 'description' | 'unit_price' | 'quantity' | 'category_id' | 'vat_scheme_id' | 'isoc_scheme_id'
type AnyLine = LineRead | Partial<Pick<PurchaseLineRead, 'fixed_asset_id' | 'fixed_asset_number' | 'isoc_scheme_id'>>

const INVALID_AMOUNT = 'Montant invalide : il n’a pas été enregistré'

interface LineProps {
  side: PieceSide
  categories: CategoryRead[]
  vatSchemes: VatSchemeRead[]
  /** The ISOC schemes of a purchase line; a sale line has none. */
  isocSchemes?: IsocSchemeRead[]
  onPatch(lineId: number, field: LineField, value: string | number): Promise<boolean>
  onRemove(lineId: number): void
  /** Opens the fixed asset that takes a purchase line over. */
  onOpenAsset?(assetId: number): void
}

/** The options of a line's select: the usable ones, plus the line's own when it is archived or withdrawn. */
function options<T extends { id: number }>(rows: T[], current: number, label: (r: T) => string, usable: (r: T) => boolean) {
  return rows.filter((r) => usable(r) || r.id === current).map((r) => ({ value: String(r.id), label: label(r) }))
}

/** One line's fields, saving themselves; laid out as a table row (desktop) or a card (mobile). */
function Line({ line, n, mobile, ...p }: LineProps & { line: LineRead & AnyLine; n: number; mobile: boolean }) {
  const description = useSavedText(line.description, (text) => p.onPatch(line.id, 'description', text.trim()))
  const price = useSavedText(amountInput(line.unit_price), (text) => {
    const value = parseDecimal(text)
    return value === null || isBadAmount(text) ? Promise.resolve(true) : p.onPatch(line.id, 'unit_price', value)
  })
  const quantity = useSavedText(quantityInput(line.quantity), (text) => {
    const value = parseQuantity(text)
    return value === null ? Promise.resolve(true) : p.onPatch(line.id, 'quantity', value)
  })
  const [category, pickCategory] = useSavedPick(line.category_id, (v) => p.onPatch(line.id, 'category_id', v))
  const isocOf = (l: AnyLine) => ('isoc_scheme_id' in l ? l.isoc_scheme_id : null) ?? fullDeduction(p.isocSchemes ?? [])?.id ?? 0
  const [isoc, pickIsoc] = useSavedPick(isocOf(line), (v) => p.onPatch(line.id, 'isoc_scheme_id', v))
  const [vat, pickVat] = useSavedPick(line.vat_scheme_id, (v) => p.onPatch(line.id, 'vat_scheme_id', v))

  const placeholder = p.side === 'sale' ? 'Ce qui est facturé' : 'Ce qui a été acheté'
  const asset =
    'fixed_asset_id' in line && line.fixed_asset_id != null && line.fixed_asset_number != null ? (
      <AssetBadge id={line.fixed_asset_id} number={line.fixed_asset_number} onOpen={p.onOpenAsset} />
    ) : null
  const descriptionInput = <Input size="sm" aria-label="Description" placeholder={placeholder} maxLength={200} {...description} />
  const categorySelect = (
    <Select
      size="sm"
      aria-label="Catégorie"
      options={options(p.categories, line.category_id, (c) => c.label, (c) => !c.archived)}
      value={String(category)}
      onValueChange={(v) => pickCategory(Number(v))}
    />
  )
  const vatSelect = (
    <Select
      size="sm"
      aria-label="Régime de TVA"
      options={options(p.vatSchemes, line.vat_scheme_id, (v) => v.label, () => true)}
      value={String(vat)}
      onValueChange={(v) => pickVat(Number(v))}
    />
  )
  const isocSelect =
    p.side === 'purchase' ? (
      <Select
        size="sm"
        aria-label="Régime ISOC"
        options={options(p.isocSchemes ?? [], isocOf(line), (s) => s.label, () => true)}
        value={String(isoc)}
        onValueChange={(v) => pickIsoc(Number(v))}
      />
    ) : null
  // An unreadable value is refused on blur: the field says so, a toast too, and the stored value comes back.
  const priceBad = isBadAmount(price.value)
  const quantityBad = parseQuantity(quantity.value) === null
  const priceInput = (
    <Input
      size="sm"
      aria-label="Prix unitaire"
      numeric
      invalid={priceBad}
      {...price}
      onBlur={() => {
        price.onBlur()
        if (priceBad) toast(INVALID_AMOUNT, { tone: 'negative' })
      }}
    />
  )
  const quantityField = (
    <Input
      size="sm"
      aria-label="Quantité"
      numeric
      invalid={quantityBad}
      {...quantity}
      onBlur={() => {
        quantity.onBlur()
        if (quantityBad) toast(INVALID_AMOUNT, { tone: 'negative' })
      }}
    />
  )
  const remove = (
    <IconButton icon={Trash2} size="sm" label="Retirer la ligne" disabled={asset !== null} onClick={() => p.onRemove(line.id)} />
  )

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line-hairline bg-surface-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="type-eyebrow text-fg-muted">ligne {n}</span>
          {remove}
        </div>
        {asset}
        <Field label="Description">{descriptionInput}</Field>
        <Field label="Catégorie">{categorySelect}</Field>
        <Field label="TVA">{vatSelect}</Field>
        {isocSelect ? <Field label="Régime ISOC">{isocSelect}</Field> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix unitaire">{priceInput}</Field>
          <Field label="Quantité">{quantityField}</Field>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-fg-muted">HTVA</span>
          <span className="numeric text-fg-strong">{eur(line.net)}</span>
        </div>
      </div>
    )
  }

  return (
    <TableRow>
      <TableCell className="numeric align-top text-xs text-fg-subtle">{n}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {descriptionInput}
          {asset}
        </div>
      </TableCell>
      <TableCell>{categorySelect}</TableCell>
      <TableCell>{vatSelect}</TableCell>
      {p.side === 'purchase' ? <TableCell>{isocSelect}</TableCell> : null}
      <TableCell>{priceInput}</TableCell>
      <TableCell>{quantityField}</TableCell>
      <TableCell className="numeric text-right font-medium text-fg-strong">{eur(line.net)}</TableCell>
      <TableCell className="pl-0">{remove}</TableCell>
    </TableRow>
  )
}

/** "au registre · I-004" on a purchase line a fixed asset takes over; it cannot be removed. */
function AssetBadge({ id, number, onOpen }: { id: number; number: number; onOpen?(id: number): void }) {
  const label = `au registre · ${reference('I', number)}`
  if (!onOpen) return <Badge tone="info">{label}</Badge>
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="flex cursor-pointer self-start border-0 bg-transparent p-0 focus-visible:rounded-xs"
    >
      <Badge tone="info">{label}</Badge>
    </button>
  )
}

/**
 * The lines of a sale or a purchase (`Ventes` and `Achats` artboards): description,
 * category of the side's direction, VAT scheme, unit price, quantity and line total,
 * each field saving itself; "Ajouter une ligne" and "Retirer la ligne". `totals` sits
 * beside the add button.
 */
export function LineEditor({
  lines,
  mobile,
  onAdd,
  totals,
  ...p
}: LineProps & {
  lines: (LineRead & AnyLine)[]
  mobile: boolean
  onAdd(): void
  totals?: ReactNode
}) {
  const add = (
    <Button variant={mobile ? 'secondary' : 'ghost'} size="sm" iconLeft={Plus} onClick={onAdd}>
      Ajouter une ligne
    </Button>
  )

  if (mobile) {
    return (
      <section className="flex flex-col gap-3">
        <span className="type-eyebrow text-fg-muted">lignes</span>
        {lines.map((line, i) => (
          <Line key={line.id} line={line} n={i + 1} mobile {...p} />
        ))}
        {add}
        {totals}
      </section>
    )
  }

  return (
    <div className="rounded-md border border-line-hairline">
      <div className="overflow-x-auto p-1">
        <Table className={p.side === 'purchase' ? 'min-w-222 table-fixed' : 'min-w-190 table-fixed'}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Catégorie</TableHead>
              <TableHead className="w-32">TVA</TableHead>
              {p.side === 'purchase' ? <TableHead className="w-32">Régime ISOC</TableHead> : null}
              <TableHead className="w-28 text-right">Prix unitaire</TableHead>
              <TableHead className="w-20 text-right">Qté</TableHead>
              <TableHead className="w-28 text-right">HTVA</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, i) => (
              <Line key={line.id} line={line} n={i + 1} mobile={false} {...p} />
            ))}
          </TableBody>
        </Table>
        {lines.length === 0 ? <p className="px-3 py-4 text-sm text-fg-muted">Aucune ligne pour l’instant.</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-default px-3 py-2.5">
        {add}
        {totals}
      </div>
    </div>
  )
}
