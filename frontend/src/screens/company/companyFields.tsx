import { useRef, useState, type ReactNode } from 'react'
import { Field, Input } from '@qvanderlinden/ui'
import type { CompanyRead } from '../../api/types'
import { useAutosave } from '../../hooks/useAutosave'

/** A failed save answers the company as the server last confirmed it, for the field to put back. */
export type CompanySaveResult = { ok: true } | { ok: false; server: CompanyRead }

/** Saves one field of the company (a PATCH of that field alone). */
export type CompanySave = (patch: Partial<CompanyRead>) => Promise<CompanySaveResult>

type TextKey = 'name' | 'bce_number' | 'registered_office' | 'iban' | 'manager_name' | 'manager_since'

/**
 * A text field that saves itself on blur and 500 ms after typing stops. `read` shows a
 * stored value, `parse` turns the typed text into the one sent (null clears a nullable
 * field), `ready` holds back a value that must not be sent yet (a blank required field,
 * an IBAN being typed). A failed save puts the server's value back, unless typed again since.
 */
export function SavedText({
  label,
  field,
  company,
  save,
  read = (stored) => stored ?? '',
  parse = (text) => text.trim() || null,
  ready = () => true,
  error,
  className,
  ...input
}: {
  label: ReactNode
  field: TextKey
  company: CompanyRead
  save: CompanySave
  read?(stored: string | null): string
  parse?(text: string): string | null
  ready?(text: string): boolean
  error?(text: string): string | undefined
  className?: string
} & Pick<React.ComponentProps<typeof Input>, 'placeholder' | 'type' | 'autoComplete' | 'spellCheck'>) {
  const [text, setText] = useState(read(company[field]))
  const typed = useRef(text)

  const saver = useAutosave(async (value) => {
    if (!ready(value)) return
    const result = await save({ [field]: parse(value) })
    if (!result.ok && typed.current === value) {
      typed.current = read(result.server[field])
      setText(typed.current)
    }
  })

  const message = error?.(text)
  return (
    <Field label={label} error={message}>
      <Input
        {...input}
        className={className}
        value={text}
        onChange={(e) => {
          typed.current = e.target.value
          setText(e.target.value)
          saver.onChange(e.target.value)
        }}
        onBlur={saver.onBlur}
      />
    </Field>
  )
}
