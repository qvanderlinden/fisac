import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Sentence case, e.g. "Comptes annuels". */
  title: string
  /** The view's controls, right-aligned. At most one primary Button per view. */
  actions?: ReactNode
}

// The Ledger page header: serif title on the left, the view's actions on the right.
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="type-title text-fg-strong">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
