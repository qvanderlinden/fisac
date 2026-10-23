import { Trash2, type LucideIcon } from 'lucide-react'
import { countLabel } from '../format'

export interface RowMenuAction {
  label: string
  icon: LucideIcon
  danger?: boolean
  disabled?: boolean
  run(): void
}

export type RowMenuItem = RowMenuAction | 'separator'

/** "12 pièces", or a dash when no piece carries the row. */
export function usesLabel(uses: number): string {
  return uses ? countLabel(uses, 'pièce', 'pièces') : '—'
}

/** What replaces delete on a row that pieces carry: "Porté par 3 pièces : impossible de le supprimer". */
export function inUseLabel(uses: number): string {
  return `Porté par ${uses} ${uses === 1 ? 'pièce' : 'pièces'} : impossible de le supprimer`
}

/** The menu's last item: the danger "Supprimer …", or the disabled in-use line when `uses > 0`. */
export function deleteItem(label: string, uses: number, run: () => void): RowMenuAction {
  return uses > 0
    ? { label: inUseLabel(uses), icon: Trash2, disabled: true, run }
    : { label, icon: Trash2, danger: true, run }
}
