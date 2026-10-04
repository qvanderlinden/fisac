import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Callout, Card, IconButton, Input, Tag, cn, toast } from '@qvanderlinden/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@qvanderlinden/ui/primitives'
import { createLedgerAccount, deleteLedgerAccount, listLedgerAccounts, updateLedgerAccount } from '../api/client'
import type { LedgerAccountRead } from '../api/types'
import { frameError, httpStatus } from '../errors'
import { ConfirmDialog } from './ConfirmDialog'
import { CELL, CELL_CONTROL, HEAD, ROW } from './editableTable'
import { classTag, codeHint as codeHintFor, CLASS_LABELS, isValidCode } from './ledgerCode'
import { PageHeader } from './PageHeader'

interface LedgerAccountsViewProps {
  accountId: number
}

// code + class + name + delete
const COLUMN_COUNT = 4

const RELOAD_LEAD = 'Rechargez la page, puis réessayez.'

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// One row: the name is editable in place, committed on blur or Enter only
// when it changed. A rejected commit puts the saved name back.
function LedgerRow({
  row,
  onRename,
  onDelete,
}: {
  row: LedgerAccountRead
  // Resolves to whether the server accepted the new name.
  onRename: (name: string) => Promise<boolean>
  onDelete: () => void
}) {
  const [name, setName] = useState(row.name)

  // Keyed on the saved name, not the object: a refresh hands this row a new
  // object with the same values and must not wipe what is being typed.
  useEffect(() => {
    setName(row.name)
  }, [row.name])

  async function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === row.name) {
      setName(row.name)
      return
    }
    if (!(await onRename(trimmed))) setName(row.name)
  }

  return (
    <TableRow className={ROW}>
      <TableCell className={cn(CELL, 'numeric text-fg-strong')}>{row.code}</TableCell>
      <TableCell className={CELL}>
        <Tag>
          {row.pcmn_class} {CLASS_LABELS[row.pcmn_class]}
        </Tag>
      </TableCell>
      <TableCell className={CELL}>
        <Input
          size="sm"
          aria-label={`Nom du compte ${row.code}`}
          className={cn(CELL_CONTROL, 'min-w-48')}
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </TableCell>
      <TableCell className={cn(CELL, 'text-right')}>
        <IconButton size="sm" icon={Trash2} label={`Supprimer le compte ${row.code}`} onClick={onDelete} />
      </TableCell>
    </TableRow>
  )
}

export function LedgerAccountsView({ accountId }: LedgerAccountsViewProps) {
  const [rows, setRows] = useState<LedgerAccountRead[]>([])
  const [loaded, setLoaded] = useState(false)
  // The last mutation that failed, and the last load that failed.
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<LedgerAccountRead | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
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
      const fetched = await listLedgerAccounts(id)
      if (seq !== requestSeq.current) return
      setRows(fetched)
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
    setRows([])
    setLoaded(false)
    setError(null)
    setLoadError(null)
    setDeleting(null)
    setNewCode('')
    setNewName('')
    setAdding(false)
    setAddError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Runs a rename so a failure (e.g. a name cleared server-side) surfaces in
  // the shared error line, and the list re-syncs with the server either way.
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

  const codeValid = isValidCode(newCode)
  const canAdd = codeValid && newName.trim() !== '' && !adding

  async function add() {
    if (!canAdd) return
    const id = accountId
    setAdding(true)
    setAddError(null)
    try {
      const created = await createLedgerAccount(id, { code: newCode, name: newName.trim() })
      toast('Compte ajouté au plan comptable.', { tone: 'positive' })
      if (currentAccount.current === id) {
        // Re-sort locally rather than refetching: the list is ordered by code.
        setRows((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
        setNewCode('')
        setNewName('')
      }
    } catch (err) {
      if (currentAccount.current === id) {
        setAddError(
          httpStatus(err) === 409 ? 'Ce code existe déjà.' : `Le compte n’a pas été ajouté. ${frameError(err)}`,
        )
      }
    } finally {
      if (currentAccount.current === id) setAdding(false)
    }
  }

  function addOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  const codeHint = codeHintFor(newCode)
  const preview = classTag(newCode)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan comptable" />
      <p className="max-w-measure type-body-sm text-fg-muted">
        Les comptes sur lesquels imputer les lignes des flux. La classe est le premier chiffre du code ; elle est
        déduite pour vous.
      </p>

      {loadError && (
        <Callout tone="negative" title="Le plan comptable n’a pas pu être chargé.">
          {loadError}{' '}
          <Button type="button" variant="link" onClick={refresh}>
            Réessayer
          </Button>
        </Callout>
      )}

      {error && (
        <Callout tone="negative" title="Action impossible">
          {error}
        </Callout>
      )}

      {!loaded && !loadError && <p className="type-body-sm text-fg-muted">Chargement…</p>}

      {loaded && (
        <Card padding={false}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD, 'w-28')}>code</TableHead>
                <TableHead className={cn(HEAD, 'w-56')}>classe</TableHead>
                <TableHead className={HEAD}>nom</TableHead>
                <TableHead className={HEAD}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <LedgerRow
                  key={row.id}
                  row={row}
                  onRename={(name) =>
                    run(`Le compte ${row.code} n’a pas été renommé.`, () =>
                      updateLedgerAccount(accountId, row.id, { name }),
                    )
                  }
                  onDelete={() => setDeleting(row)}
                />
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className={cn(CELL, 'py-10 text-center text-fg-muted')}>
                    Aucun compte pour l’instant — ajoutez le premier ci-dessous.
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                <TableCell className={CELL}>
                  <Input
                    size="sm"
                    numeric
                    inputMode="numeric"
                    aria-label="Code du nouveau compte"
                    // Left-aligned like the codes above it.
                    className="text-left"
                    placeholder="610000"
                    invalid={codeHint !== null}
                    value={newCode}
                    onChange={(e) => {
                      setNewCode(e.target.value.trim())
                      setAddError(null)
                    }}
                    onKeyDown={addOnEnter}
                  />
                </TableCell>
                <TableCell className={CELL}>
                  {preview ? <Tag>{preview}</Tag> : <span className="px-2.5 text-fg-subtle">—</span>}
                </TableCell>
                <TableCell className={CELL}>
                  <Input
                    size="sm"
                    aria-label="Nom du nouveau compte"
                    placeholder="Fournitures"
                    maxLength={200}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={addOnEnter}
                  />
                </TableCell>
                <TableCell className={cn(CELL, 'text-right')}>
                  <Button type="button" size="sm" iconLeft={Plus} disabled={!canAdd} onClick={add}>
                    Ajouter
                  </Button>
                </TableCell>
              </TableRow>
              {(codeHint || addError) && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMN_COUNT} className="px-4 py-2">
                    <p role="alert" className="type-body-sm text-negative-fg">
                      {addError ?? codeHint}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {deleting && (
        <ConfirmDialog
          title="Supprimer ce compte ?"
          description={`Le compte ${deleting.code} « ${deleting.name} » sera retiré du plan comptable. Les lignes imputées sur ce compte restent en place, mais non imputées.`}
          confirmLabel="Supprimer le compte"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const id = accountId
            setError(null)
            await deleteLedgerAccount(id, deleting.id)
            toast('Compte retiré du plan comptable.', { tone: 'positive' })
            if (currentAccount.current === id) {
              // A "code already exists" message may have named this very code.
              setAddError(null)
              await refresh()
            }
          }}
        />
      )}
    </div>
  )
}
