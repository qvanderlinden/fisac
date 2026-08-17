import { useEffect, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  createCategory,
  deleteCategory,
  listCategories,
  moveCategory,
  updateCategory,
} from '../api/client'
import type { CategoryCreate, CategoryRead, CategoryUpdate } from '../api/types'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface CategoriesViewProps {
  accountId: number
}

// grip + name + tax rate + vat rate + delete
const COLUMN_COUNT = 5

type DropPos = 'above' | 'below'

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// One inline-editable row. Local drafts seeded from the fetched category,
// committed on blur/Enter only when the value actually changed (a rejected
// commit reverts via the refresh that follows).
function CategoryRow({
  category,
  onCommit,
  onDelete,
  dragging,
  dropPos,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: {
  category: CategoryRead
  onCommit: (patch: CategoryUpdate) => Promise<void>
  onDelete: () => Promise<void>
  dragging: boolean
  // Where the drop indicator shows on this row (null = not a drop target now).
  dropPos: DropPos | null
  onDragStart: () => void
  onDragOverRow: (pos: DropPos) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [name, setName] = useState(category.name)
  const [tax, setTax] = useState(category.tax_deduction_rate)
  const [vat, setVat] = useState(category.vat_deduction_rate)

  useEffect(() => {
    setName(category.name)
    setTax(category.tax_deduction_rate)
    setVat(category.vat_deduction_rate)
  }, [category])

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === category.name) {
      setName(category.name)
      return
    }
    onCommit({ name: trimmed })
  }

  function commitRate(
    draft: string,
    current: string,
    reset: (v: string) => void,
    key: 'tax_deduction_rate' | 'vat_deduction_rate',
  ) {
    if (draft.trim() === '' || Number(draft) === Number(current)) {
      reset(current)
      return
    }
    onCommit({ [key]: draft })
  }

  const rowClass = [
    dragging ? 'is-dragging' : '',
    dropPos === 'above' ? 'drop-above' : '',
    dropPos === 'below' ? 'drop-below' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <TableRow
      className={rowClass || undefined}
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
      <TableCell className="drag-handle-cell">
        <button
          type="button"
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Reorder ${category.name}`}
        >
          <GripVertical />
        </button>
      </TableCell>
      <TableCell>
        <input
          type="text"
          className="cell-input cell-input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
          aria-label={`Name of ${category.name}`}
        />
      </TableCell>
      <TableCell>
        <span className="cell-rate">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="cell-input cell-input-rate"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            onBlur={() => commitRate(tax, category.tax_deduction_rate, setTax, 'tax_deduction_rate')}
            onKeyDown={blurOnEnter}
            aria-label={`Tax deduction rate of ${category.name}`}
          />
          %
        </span>
      </TableCell>
      <TableCell>
        <span className="cell-rate">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="cell-input cell-input-rate"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            onBlur={() => commitRate(vat, category.vat_deduction_rate, setVat, 'vat_deduction_rate')}
            onKeyDown={blurOnEnter}
            aria-label={`VAT deduction rate of ${category.name}`}
          />
          %
        </span>
      </TableCell>
      <TableCell>
        <div className="text-right">
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Delete ${category.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Unsaved draft row appended at the bottom (from the "New entry" button).
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
    if (name.trim() === '') {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        tax_deduction_rate: tax.trim() === '' ? '100' : tax,
        vat_deduction_rate: vat.trim() === '' ? '100' : vat,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <TableRow className="flow-draft-row hover:bg-transparent" onKeyDown={onKeyDown}>
      <TableCell className="drag-handle-cell" />
      <TableCell>
        <input
          type="text"
          className="cell-input cell-input-name"
          placeholder="New category…"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
        />
      </TableCell>
      <TableCell>
        <span className="cell-rate">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="cell-input cell-input-rate"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            aria-label="Tax deduction rate"
          />
          %
        </span>
      </TableCell>
      <TableCell>
        <span className="cell-rate">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="cell-input cell-input-rate"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            aria-label="VAT deduction rate"
          />
          %
        </span>
      </TableCell>
      <TableCell>
        <div className="flow-draft-actions">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} aria-label="Cancel">
            ✕
          </Button>
        </div>
        {error && <p className="flow-draft-error">{error}</p>}
      </TableCell>
    </TableRow>
  )
}

export function CategoriesView({ accountId }: CategoriesViewProps) {
  const [categories, setCategories] = useState<CategoryRead[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Drag-to-reorder state: the row being dragged and where it would drop.
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null)

  async function refresh() {
    setCategories(await listCategories(accountId))
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    setAdding(false)
    setDraggingId(null)
    setDropTarget(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Wraps a mutation so failures (e.g. duplicate name -> 4xx) surface in one
  // shared error line and the table re-syncs with the server either way.
  async function run(mutation: () => Promise<unknown>) {
    setError(null)
    try {
      await mutation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    }
    await refresh()
  }

  async function createDraft(payload: CategoryCreate) {
    setError(null)
    // Rethrows on failure so NewCategoryRow keeps the draft open with its error.
    await createCategory(accountId, payload)
    setAdding(false)
    await refresh()
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
    // Order of ids without the dragged one; insert it at the target slot and
    // hand its two new neighbors to the fractional-index move endpoint.
    const ids = categories.map((c) => c.id).filter((id) => id !== dragId)
    let pos = ids.indexOf(target.id)
    if (target.pos === 'below') pos += 1
    const afterId = ids[pos - 1] ?? null
    const beforeId = ids[pos] ?? null
    run(() => moveCategory(accountId, dragId, { after_id: afterId, before_id: beforeId }))
  }

  return (
    <div className="flows-view">
      {loading && categories.length === 0 && <p className="empty-state">Loading…</p>}

      {(categories.length > 0 || adding || !loading) && (
        <div className="flows-table-region">
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="drag-handle-cell" />
                  <TableHead>Name</TableHead>
                  <TableHead>Tax deduction rate</TableHead>
                  <TableHead>VAT deduction rate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    onCommit={(patch) => run(() => updateCategory(accountId, category.id, patch))}
                    onDelete={() => run(() => deleteCategory(accountId, category.id))}
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
                  <TableRow className="hover:bg-transparent">
                    <td colSpan={COLUMN_COUNT} className="text-muted-foreground h-16 text-center">
                      No categories yet.
                    </td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <button type="button" className="flow-newentry" onClick={() => setAdding(true)}>
            <Plus className="flow-newentry-icon" aria-hidden /> New entry
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
