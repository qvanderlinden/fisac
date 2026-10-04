// Shared look of fisac's editable tables (flux, catégories, plan comptable):
// the kit's DataTable - mono uppercase headers, hairlines, 4% row hover -
// built from the primitives, with dense cells and controls that read as plain
// text until hovered or focused.

/** Header cell padding, matching CELL. */
export const HEAD = 'px-1.5'
/** Body cell padding: denser than DataTable, since cells hold controls. */
export const CELL = 'px-1.5 py-1.5'
/** Row hover wash. */
export const ROW = 'hover:bg-surface-hover'
/** Input / Select trigger inside a cell: borderless until hovered, focus ring kept. */
export const CELL_CONTROL = 'border-transparent bg-transparent shadow-none hover:not-disabled:border-line-default'
