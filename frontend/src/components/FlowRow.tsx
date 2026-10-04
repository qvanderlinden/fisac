import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Checkbox, Icon, IconButton, Input, Select, Tooltip, cn } from '@qvanderlinden/ui'
import { TableCell, TableRow } from '@qvanderlinden/ui/primitives'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
  PaymentMethod,
} from '../api/types'
import { PAYMENT_METHOD_LABELS, flowGapsSummary, isFlowIncomplete, visaPaymentDate } from '../accountingDisplay'
import { eur, formatDate, signedFlowAmount } from '../format'
import { CELL, CELL_CONTROL, ROW } from './editableTable'
import { PAYMENT_METHODS } from './FlowForm'
import { LinesEditor, linesToDrafts, linesToPayload, linesValid, type LineDraft } from './LinesEditor'

// Radix Select values can't be empty strings; this stands for "none".
const NONE = 'none'

interface FlowRowProps {
  flow: FlowRead
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  colSpan: number
  // Whether the reverse-charge (autoliquidation) column is shown.
  showReverseCharge: boolean
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  expanded: boolean
  onToggleExpanded: () => void
  // Persists a partial change (the parent merges it onto the full flow
  // payload, PATCHes, then refreshes; a failed commit reverts on refresh).
  onCommit: (changes: Partial<FlowCreate>) => Promise<void>
  onTogglePaid: () => Promise<void>
  // Asks the parent to confirm and delete.
  onDelete: () => void
}

export function FlowRow({
  flow,
  kind,
  account,
  categories,
  ledgerAccounts,
  colSpan,
  showReverseCharge,
  selected,
  onSelectedChange,
  expanded,
  onToggleExpanded,
  onCommit,
  onTogglePaid,
  onDelete,
}: FlowRowProps) {
  // Header-field drafts, committed on blur or Enter. Reseeded whenever the
  // flow prop changes (e.g. after a refresh) so a rejected edit reverts.
  const [name, setName] = useState(flow.name)
  const [invoiceDate, setInvoiceDate] = useState(flow.invoice_date)
  const [paymentDate, setPaymentDate] = useState(flow.payment_date ?? '')

  useEffect(() => {
    setName(flow.name)
    setInvoiceDate(flow.invoice_date)
    setPaymentDate(flow.payment_date ?? '')
  }, [flow])

  // Line drafts are seeded when the row (re)opens - not on every refresh - so
  // an in-progress line edit isn't clobbered by an unrelated header commit.
  const [lines, setLines] = useState<LineDraft[]>(() => linesToDrafts(flow.lines, flow.reverse_charge))
  const [savingLines, setSavingLines] = useState(false)

  useEffect(() => {
    if (expanded) setLines(linesToDrafts(flow.lines, flow.reverse_charge))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id, expanded])

  const method = flow.payment_method
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  function commitName() {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === flow.name) {
      setName(flow.name)
      return
    }
    onCommit({ name: trimmed })
  }

  function commitInvoiceDate() {
    if (invoiceDate === '' || invoiceDate === flow.invoice_date) {
      setInvoiceDate(flow.invoice_date)
      return
    }
    onCommit({ invoice_date: invoiceDate })
  }

  function commitPaymentDate() {
    const next = paymentDate || null
    if (next === (flow.payment_date ?? null)) return
    onCommit({ payment_date: next })
  }

  function changeMethod(value: string) {
    if (value === NONE) {
      // No payment method means no payment is made - clear the date too.
      onCommit({ payment_method: null, payment_date: null })
    } else if (value === 'visa') {
      // Visa flows never store their own payment date - the projection
      // derives it from the account's Visa payment day instead.
      onCommit({ payment_method: 'visa', payment_date: null })
    } else {
      onCommit({ payment_method: value as PaymentMethod })
    }
  }

  async function saveLines() {
    if (!linesValid(lines)) return
    setSavingLines(true)
    try {
      await onCommit({ lines: linesToPayload(lines) })
    } finally {
      setSavingLines(false)
    }
  }

  const gaps = isFlowIncomplete(flow) ? flowGapsSummary(flow) : null

  return (
    <>
      <TableRow data-state={selected ? 'selected' : undefined} className={ROW}>
        <TableCell className={cn(CELL, 'w-7 pr-0')}>
          {/* Only the gaps the annual accounts care about: no category, or a
              line booked to no ledger account. */}
          {gaps && (
            <Tooltip label={gaps}>
              <span role="img" tabIndex={0} aria-label={`Incomplet : ${gaps}`} className="inline-flex text-warning-fg">
                <Icon icon={TriangleAlert} size={14} />
              </span>
            </Tooltip>
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'w-8 px-0')}>
          <IconButton
            size="sm"
            icon={expanded ? ChevronDown : ChevronRight}
            label={expanded ? 'Masquer les lignes' : 'Afficher les lignes'}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          />
        </TableCell>
        <TableCell className={cn(CELL, 'w-8')}>
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={`Sélectionner ${flow.name}`}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            aria-label="Nom"
            className={cn(CELL_CONTROL, 'min-w-48 font-medium')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={blurOnEnter}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Catégorie"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={flow.category_id != null ? String(flow.category_id) : NONE}
            onValueChange={(value) => onCommit({ category_id: value === NONE ? null : Number(value) })}
            options={[
              { value: NONE, label: 'Aucune' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Input
            size="sm"
            type="date"
            aria-label="Date de facture"
            className={CELL_CONTROL}
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            onBlur={commitInvoiceDate}
            onKeyDown={blurOnEnter}
          />
        </TableCell>
        <TableCell className={CELL}>
          <Select
            size="sm"
            aria-label="Moyen de paiement"
            className={cn(CELL_CONTROL, 'min-w-36')}
            value={method ?? NONE}
            onValueChange={changeMethod}
            options={[
              { value: NONE, label: 'Sans paiement' },
              ...PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
                disabled: m === 'visa' && account.visa_payment_day == null,
              })),
            ]}
          />
        </TableCell>
        <TableCell className={CELL}>
          {method === null ? (
            <span className="px-2.5 text-fg-subtle">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Aucune date de paiement</span>
            </span>
          ) : method === 'visa' ? (
            account.visa_payment_day != null && (
              <Tooltip label="Selon le cycle Visa du compte">
                <span tabIndex={0} className="numeric px-2.5 whitespace-nowrap text-fg-muted">
                  {formatDate(
                    visaPaymentDate(flow.invoice_date, account.visa_payment_day, account.visa_closing_day),
                    'full',
                  )}
                </span>
              </Tooltip>
            )
          ) : (
            <Input
              size="sm"
              type="date"
              aria-label="Date de paiement"
              className={CELL_CONTROL}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              onBlur={commitPaymentDate}
              onKeyDown={blurOnEnter}
            />
          )}
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <span className={cn('numeric whitespace-nowrap', kind === 'revenue' ? 'text-positive-fg' : 'text-fg-strong')}>
            {eur(signedFlowAmount(kind, flow.amount_gross))}
          </span>
        </TableCell>
        {showReverseCharge && (
          <TableCell className={cn(CELL, 'text-center')}>
            <Checkbox
              checked={flow.reverse_charge}
              onCheckedChange={(v) => onCommit({ reverse_charge: v === true })}
              aria-label={`Autoliquidation pour ${flow.name}`}
            />
          </TableCell>
        )}
        <TableCell className={CELL}>
          <Badge asChild tone={flow.paid ? 'positive' : 'warning'}>
            <button
              type="button"
              className="cursor-pointer"
              onClick={onTogglePaid}
              aria-label={`${flow.name} : ${flow.paid ? 'payé' : 'à payer'} — marquer ${flow.paid ? 'à payer' : 'payé'}`}
            >
              {flow.paid ? 'payé' : 'à payer'}
            </button>
          </Badge>
        </TableCell>
        <TableCell className={cn(CELL, 'text-right')}>
          <IconButton size="sm" icon={Trash2} label={`Supprimer ${flow.name}`} onClick={onDelete} />
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
          <TableCell colSpan={colSpan} className="px-6 py-4">
            <div className="flex flex-col gap-3">
              <LinesEditor
                lines={lines}
                onChange={setLines}
                ledgerAccounts={ledgerAccounts}
                reverseCharge={flow.reverse_charge}
              />
              {!linesValid(lines) && (
                <p className="type-body-sm text-negative-fg">
                  Un montant ou un taux est illisible — corrigez les cases en rouge.
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveLines}
                  disabled={savingLines || !linesValid(lines)}
                >
                  {savingLines ? 'Enregistrement…' : 'Enregistrer les lignes'}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
