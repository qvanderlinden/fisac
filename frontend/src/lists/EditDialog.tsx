import { useRef, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@qvanderlinden/ui'
import {
  Dialog as DialogRoot,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@qvanderlinden/ui/primitives'
import { DeleteActions, DeleteRows, type DeleteConfirmProps } from './DeleteConfirm'

const FOCUSABLE =
  'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The package `Dialog`, composed from its primitives so the close button reads "Fermer"
 * (the component's is labelled in English). Always open: a screen mounts it to show it.
 */
export function ListDialog({
  title,
  description,
  size = 'md',
  onClose,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** `lg` for a wider form; `xl` for a form with a table (a piece and its lines). */
  size?: 'md' | 'lg' | 'xl'
  onClose(): void
  children: ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)
  return (
    <DialogRoot open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={size === 'xl' ? 'sm:max-w-240' : size === 'lg' ? 'sm:max-w-dialog-lg' : undefined}
        {...(description ? {} : { 'aria-describedby': undefined })}
        // Focus the first field of the body, not the close button.
        onOpenAutoFocus={(event) => {
          const first = body.current?.querySelector<HTMLElement>(FOCUSABLE)
          if (first) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
          <div>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription className="mt-1">{description}</DialogDescription> : null}
          </div>
          <DialogClose asChild>
            <IconButton icon={X} label="Fermer" />
          </DialogClose>
        </header>
        <div ref={body} className="px-6 pt-3 pb-6">
          {children}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

/** The delete button of an edit form, left out while the row is carried by pieces. */
export interface RemoveAction {
  label: string
  run(): void
}

/**
 * Desktop edit dialog of a configuration list (`Tiers` artboard): the screen's form,
 * then a row with the optional delete button and "Fermer". Every field saves itself.
 *
 * With `confirm` the same dialog shows the deletion to confirm instead: its title and
 * description in the header, the rows, "Annuler" and the danger action; closing it
 * cancels. A bulk delete from the list mounts it with `confirm` alone.
 */
export function EditDialog({
  title,
  description = 'Enregistré automatiquement',
  size,
  onClose,
  remove,
  confirm,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  onClose(): void
  remove?: RemoveAction
  confirm?: DeleteConfirmProps
  children?: ReactNode
}) {
  if (confirm) {
    return (
      <ListDialog title={confirm.title} description={confirm.description} onClose={confirm.onCancel}>
        <div className="flex flex-col gap-5">
          <DeleteRows rows={confirm.rows} />
          <DeleteActions action={confirm.action} onConfirm={confirm.onConfirm} onCancel={confirm.onCancel} />
        </div>
      </ListDialog>
    )
  }
  return (
    <ListDialog title={title} description={description} size={size} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {children}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line-hairline pt-1">
          {remove ? (
            <Button variant="ghost" iconLeft={Trash2} onClick={remove.run}>
              {remove.label}
            </Button>
          ) : null}
          <span className="flex-auto" />
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </ListDialog>
  )
}
