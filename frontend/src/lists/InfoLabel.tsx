import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Icon, Tooltip } from '@qvanderlinden/ui'

/** A field label followed by the info dot whose tooltip says what the field means. */
export function InfoLabel({ children, info }: { children: ReactNode; info: string }) {
  return (
    <>
      {children}
      <Tooltip label={info} side="bottom">
        <span
          tabIndex={0}
          role="img"
          aria-label={info}
          // Inside the label: a click on the dot must not move focus to the input.
          onClick={(e) => e.preventDefault()}
          className="inline-flex cursor-help rounded-pill text-fg-muted"
        >
          <Icon icon={Info} size={14} />
        </span>
      </Tooltip>
    </>
  )
}
