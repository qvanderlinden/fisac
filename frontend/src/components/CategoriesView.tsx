import { useEffect, useRef, useState } from 'react'
import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Button, Callout, Card, Icon, IconButton, Input, cn, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { createCategory, deleteCategory, listCategories, moveCategory, updateCategory } from '../api/client'
import type { CategoryCreate, CategoryRead, CategoryUpdate } from '../api/types'
import { RELOAD_LEAD, frameError } from '../errors'
import { parseRate, rateInput } from '../format'
import { ConfirmDialog } from './ConfirmDialog'
import { CELL, CELL_CONTROL, HEAD, ROW } from './editableTable'
import { PageHeader } from './PageHeader'

interface CategoriesViewProps {
  accountId: number
}

// grip + name + tax rate + vat rate + delete
const COLUMN_COUNT = 5

type DropPos = 'above' | 'below'

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// A rate field is fine blank (the saved value, or the default for a new
// category) or a number from 0 to 100 with at most two decimals: the same
// reading that is sent, so nothing red is ever sent and nothing sent is red.
function rateInvalid(text: string): boolean {
  return parseRate(text, '0') === null
}

// One inline-editable row. Local drafts are seeded from the fetched category
// and committed on blur or Enter, only when the value actually changed. A
// rejected commit puts the saved value back.
function CategoryRow({
  category,
  onCommit,
  onDelete,
  onMoveBy,
  dragging,
  dropPos,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: {
  category: CategoryRead
  // Resolves to whether the server accepted the change.
  onCommit: (patch: CategoryUpdate) => Promise<boolean>
  onDelete: () => void
  // Keyboard reordering from the grip: -1 moves up, +1 down.
  onMoveBy: (delta: -1 | 1) => void
  dragging: boolean
  // Where the drop line shows on this row (null = not a drop target now).
  dropPos: DropPos | null
  onDragStart: () => void
  onDragOverRow: (pos: DropPos) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [name, setName] = useState(category.name)
  const [tax, setTax] = useState(rateInput(category.tax_deduction_rate))
  const [vat, setVat] = useState(rateInput(category.vat_deduction_rate))

  // One effect per field, keyed on that field's saved value: a refresh after
  // another row's edit (or a sibling field's) hands this row the same values
  // again, and must not wipe what is being typed here.
  useEffect(() => setName(category.name), [category.name])
  useEffect(() => setTax(rateInput(category.tax_deduction_rate)), [category.tax_deduction_rate])
  useEffect(() => setVat(rateInput(category.vat_deduction_rate)), [category.vat_deduction_rate])

  async function commit(patch: CategoryUpdate, revert: () => void) {
    if (!(await onCommit(patch))) revert()
  }

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === category.name) {
      setName(category.name)
      return
    }
    commit({ name: trimmed }, () => setName(category.name))
  }

  function commitRate(
    draft: string,
    current: string,
    reset: (v: string) => void,
    key: 'tax_deduction_rate' | 'vat_deduction_rate',
  ) {
    // Unreadable or out-of-range text is marked red while typed; nothing is
    // sent, and the saved value comes back on blur. A blank field also reads
    // as the saved value.
    const value = parseRate(draft, current)
    if (value === null || Number(value) === Number(current)) {
      reset(rateInput(current))
      return
    }
    commit({ [key]: value }, () => reset(rateInput(current)))
  }

  return (
    <TableRow
      className={cn(
        ROW,
        dragging && 'opacity-50',
        // The terracotta drop line, drawn on the cells' top or bottom edge.
        dropPos === 'above' && '[&>td]:shadow-[inset_0_2px_0_var(--clay-500)]',
        dropPos === 'below' && '[&>td]:shadow-[inset_0_-2px_0_var(--clay-500)]',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        onDragOverRow(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below')
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <TableCell className={cn(CELL, 'w-8')}>
        <button
          type="button"
          draggable
          data-grip={category.id}
          onDragStart={(e) => {
            // Firefox only starts a drag that carries data.
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(category.id))
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              onMoveBy(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          aria-label={`Déplacer ${category.name} (flèches haut et bas)`}
          className="inline-flex cursor-grab items-center rounded-xs p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-strong active:cursor-grabbing"
        >
          <Icon icon={GripVertical} size={14} />
        </button>
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          aria-label={`Nom de ${category.name}`}
          className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          numeric
          suffix="%"
          aria-label={`Déduction fiscale de ${category.name}`}
          className={cn(CELL_CONTROL, 'w-28')}
          invalid={rateInvalid(tax)}
          value={tax}
          onChange={(e) => setTax(e.target.value)}
          onBlur={() => commitRate(tax, category.tax_deduction_rate, setTax, 'tax_deduction_rate')}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          numeric
          suffix="%"
          aria-label={`Déduction TVA de ${category.name}`}
          className={cn(CELL_CONTROL, 'w-28')}
          invalid={rateInvalid(vat)}
          value={vat}
          onChange={(e) => setVat(e.target.value)}
          onBlur={() => commitRate(vat, category.vat_deduction_rate, setVat, 'vat_deduction_rate')}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={cn(CELL, 'text-right')}>
        <IconButton size="sm" icon={Trash2} label={`Supprimer ${category.name}`} onClick={onDelete} />
      </TableCell>
    </TableRow>
  )
}

// The quick-add row at the bottom. Enter in a field saves, Escape cancels.
function NewCategoryRow({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (payload: CategoryCreate) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [tax, setTax] = useState('100')
  const [vat, setVat] = useState('100')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (saving) return
    if (name.trim() === '') {
      setError('Le nom est obligatoire.')
      return
    }
    // Blank means the full 100; anything unreadable blocks the save.
    const taxRate = parseRate(tax, '100')
    const vatRate = parseRate(vat, '100')
    if (taxRate === null || vatRate === null) {
      setError('Un taux doit être un nombre de 0 à 100 avec deux décimales au plus, par exemple 50 ou 12,5.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), tax_deduction_rate: taxRate, vat_deduction_rate: vatRate })
    } catch (err) {
      setError(`La catégorie n’a pas été ajoutée. ${frameError(err)}`)
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (e.key === 'Enter' && target.tagName === 'INPUT') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <>
      <TableRow className="bg-surface-selected hover:bg-surface-selected" onKeyDown={onKeyDown}>
        <TableCell className={CELL} />
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            placeholder="Nouvelle catégorie…"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            numeric
            suffix="%"
            aria-label="Déduction fiscale"
            className={cn(CELL_CONTROL, 'w-28')}
            invalid={rateInvalid(tax)}
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            numeric
            suffix="%"
            aria-label="Déduction TVA"
            className={cn(CELL_CONTROL, 'w-28')}
            invalid={rateInvalid(vat)}
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <div className="flex justify-end gap-1">
            <IconButton size="sm" icon={Check} label="Enregistrer la catégorie" onClick={save} disabled={saving} />
            <IconButton size="sm" icon={X} label="Annuler" onClick={onCancel} disabled={saving} />
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="px-4 py-2">
            <p role="alert" className="type-body-sm text-negative-fg">
              {error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function CategoriesView({ accountId }: CategoriesViewProps) {
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  // The last mutation that failed, and the last load that failed.
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CategoryRead | null>(null)
  // Drag-to-reorder state: the row being dragged and where it would drop.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null)
  // Only the latest load may land (switching account quickly).
  const requestSeq = useRef(0)
  // What is shown right now. Mutations and refresh() outlive the render that
  // made them, so a late response or error is checked against this and never
  // lands on another account.
  const currentAccount = useRef(accountId)
  useEffect(() => {
    currentAccount.current = accountId
  })

  async function refresh() {
    const seq = ++requestSeq.current
    const id = currentAccount.current
    try {
      const fetched = await listCategories(id)
      if (seq !== requestSeq.current) return
      setCategories(fetched)
      setLoaded(true)
      setLoadError(null)
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(frameError(err, { client: RELOAD_LEAD }))
    }
  }

  function reportError(id: number, message: string) {
    if (currentAccount.current === id) setError(message)
  }

  useEffect(() => {
    setCategories([])
    setLoaded(false)
    setAdding(false)
    setError(null)
    setLoadError(null)
    setDeleting(null)
    setDraggingId(null)
    setDropTarget(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Runs a mutation so a failure (e.g. a duplicate name) surfaces in the
  // shared error line and the table re-syncs with the server either way.
  // `failure` says what did not happen; the framed error follows it. Resolves
  // to whether the mutation succeeded.
  async function run(failure: string, mutation: () => Promise<unknown>): Promise<boolean> {
    const id = accountId
    setError(null)
    let ok = true
    try {
      await mutation()
    } catch (err) {
      ok = false
      reportError(id, `${failure} ${frameError(err)}`)
    }
    await refresh()
    return ok
  }

  async function createDraft(payload: CategoryCreate) {
    const id = accountId
    setError(null)
    // Rethrows on failure so NewCategoryRow keeps the draft open with its error.
    await createCategory(id, payload)
    toast('Catégorie ajoutée.', { tone: 'positive' })
    if (currentAccount.current === id) setAdding(false)
    await refresh()
  }

  // Hands the dragged (or arrow-moved) row's two new neighbours to the
  // fractional-index move endpoint, then gives the grip its focus back.
  async function moveTo(dragId: number, afterId: number | null, beforeId: number | null) {
    await run('La catégorie n’a pas été déplacée.', () =>
      moveCategory(accountId, dragId, { after_id: afterId, before_id: beforeId }),
    )
    document.querySelector<HTMLButtonElement>(`[data-grip="${dragId}"]`)?.focus()
  }

  function endDrag() {
    setDraggingId(null)
    setDropTarget(null)
  }

  function commitReorder() {
    const dragId = draggingId
    const target = dropTarget
    endDrag()
    if (dragId == null || target == null || target.id === dragId) return
    // Order of ids without the dragged one; insert it at the target slot.
    const ids = categories.map((c) => c.id).filter((id) => id !== dragId)
    let pos = ids.indexOf(target.id)
    if (target.pos === 'below') pos += 1
    moveTo(dragId, ids[pos - 1] ?? null, ids[pos] ?? null)
  }

  function moveBy(id: number, delta: -1 | 1) {
    const index = categories.findIndex((c) => c.id === id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= categories.length) return
    const rest = categories.map((c) => c.id).filter((x) => x !== id)
    moveTo(id, rest[target - 1] ?? null, rest[target] ?? null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catégories"
        actions={
          <Button iconLeft={Plus} onClick={() => setAdding(true)} disabled={!loaded}>
            Ajouter une catégorie
          </Button>
        }
      />

      {loadError && (
        <Callout tone="negative" title="Les catégories n’ont pas pu être chargées.">
          {loadError}{' '}
          <Button type="button" variant="link" onClick={refresh}>
            Réessayer
          </Button>
        </Callout>
      )}

      {error && (
        <Callout tone="negative" title="Action impossible.">
          {error}
        </Callout>
      )}

      {!loaded && !loadError && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {loaded && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD, 'w-8')}>
                  <span className="sr-only">Ordre</span>
                </TableHead>
                <TableHead className={HEAD}>nom</TableHead>
                <TableHead className={HEAD}>déduction fiscale</TableHead>
                <TableHead className={HEAD}>déduction tva</TableHead>
                <TableHead className={HEAD}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onCommit={(patch) =>
                    run(`La catégorie « ${category.name} » n’a pas été modifiée.`, () =>
                      updateCategory(accountId, category.id, patch),
                    )
                  }
                  onDelete={() => setDeleting(category)}
                  onMoveBy={(delta) => moveBy(category.id, delta)}
                  dragging={draggingId === category.id}
                  dropPos={dropTarget?.id === category.id ? dropTarget.pos : null}
                  onDragStart={() => setDraggingId(category.id)}
                  onDragOverRow={(pos) => {
                    if (draggingId != null && draggingId !== category.id) {
                      setDropTarget({ id: category.id, pos })
                    }
                  }}
                  onDrop={commitReorder}
                  onDragEnd={endDrag}
                />
              ))}
              {adding && <NewCategoryRow onCancel={() => setAdding(false)} onCreate={createDraft} />}
              {categories.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className={cn(CELL, 'py-10 text-center text-fg-muted')}>
                    Aucune catégorie pour l’instant.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {deleting && (
        <ConfirmDialog
          title="Supprimer cette catégorie ?"
          description={`« ${deleting.name} » sera supprimée définitivement. Les flux qui l’utilisent restent en place, mais sans catégorie.`}
          confirmLabel="Supprimer la catégorie"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const id = accountId
            setError(null)
            await deleteCategory(id, deleting.id)
            toast('Catégorie supprimée.', { tone: 'positive' })
            await refresh()
          }}
        />
      )}
    </div>
  )
}
