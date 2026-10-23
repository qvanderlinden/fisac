import { Construction } from 'lucide-react'
import { EmptyState } from '@qvanderlinden/ui'

/** Stands in for a configuration screen until its task lands. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-title text-fg-strong">{title}</h1>
      <EmptyState icon={Construction} title="Cet écran arrive bientôt." />
    </div>
  )
}
