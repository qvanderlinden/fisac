import { useState } from 'react'
import { ArrowLeft, Pencil, Sparkles, X } from 'lucide-react'
import {
  Button,
  Callout,
  Card,
  DataTable,
  Dialog,
  Field,
  IconButton,
  Select,
  Textarea,
  cn,
  toast,
  type DataTableColumn,
} from '@qvanderlinden/ui'
import { createFlowsBulk, generateFlows } from '../api/client'
import type {
  AccountRead,
  CategoryRead,
  FlowCreate,
  FlowKind,
  FlowRead,
  LedgerAccountRead,
} from '../api/types'
import { frameError } from '../errors'
import { countLabel, eur, formatDate, signedFlowAmount, toApiDecimal } from '../format'
import { CountFigure } from './CountFigure'
import { FlowForm } from './FlowForm'
import { NONE, categoryOptions, paymentMethodOptions } from './flowOptions'
import { buildProposals } from './generatorProposals'
import { LinesEditor, emptyLine, linesToPayload, linesTotals, linesValid, type LineDraft } from './LinesEditor'

type Step = 'describe' | 'generating' | 'review'

interface FlowGeneratorProps {
  kind: FlowKind
  account: AccountRead
  categories: CategoryRead[]
  ledgerAccounts: LedgerAccountRead[]
  onClose: () => void
  // Called after a successful bulk insert so the parent list can refresh.
  onInserted: () => Promise<void>
}

interface ProposalRow {
  id: number
  proposal: FlowCreate
}

// Wraps an unsaved FlowCreate proposal as a pseudo-FlowRead so FlowForm can
// edit it - FlowForm only reads name/category/dates/method/paid/lines, so the
// fake id/sort_key fields are never load-bearing. Not routed through
// linesToDrafts/linesToPayload: those convert between FlowLineRead and
// LineDraft, while this synthesizes a FlowLineRead from a FlowLineCreate. It
// carries ledger_account_id through explicitly - keep that if this changes.
function proposalToFlowRead(proposal: FlowCreate, accountId: number): FlowRead {
  const totals = linesTotals(proposal.lines, proposal.reverse_charge ?? false)
  return {
    id: -1,
    account_id: accountId,
    name: proposal.name,
    kind: proposal.kind,
    category_id: proposal.category_id,
    invoice_date: proposal.invoice_date,
    payment_date: proposal.payment_date,
    payment_method: proposal.payment_method,
    paid: proposal.paid ?? false,
    batch_id: null,
    reverse_charge: proposal.reverse_charge ?? false,
    sort_key: '',
    lines: proposal.lines.map((l, i) => ({
      id: -(i + 1),
      description: l.description ?? null,
      amount_net: l.amount_net,
      vat_rate: l.vat_rate ?? '0',
      sort_key: String(i),
      ledger_account_id: l.ledger_account_id ?? null,
    })),
    amount_net: toApiDecimal(totals.net),
    amount_vat: toApiDecimal(totals.vat),
    amount_gross: toApiDecimal(totals.gross),
  }
}

// The LLM-assisted generator in three steps: describe the recurring rule and
// the template applied to every occurrence, wait for the proposal, then
// review (edit or remove rows) and insert them in one batch.
export function FlowGenerator({
  kind,
  account,
  categories,
  ledgerAccounts,
  onClose,
  onInserted,
}: FlowGeneratorProps) {
  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  // Template fields, entered once and applied to every generated occurrence.
  const [categoryId, setCategoryId] = useState(NONE)
  const [paymentMethod, setPaymentMethod] = useState(NONE)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [proposals, setProposals] = useState<FlowCreate[]>([])
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  // Generation and insertion fail on different steps: each error stays on its own.
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [insertError, setInsertError] = useState<string | null>(null)
  const [inserting, setInserting] = useState(false)

  const linesOk = linesValid(lines)

  async function handleGenerate() {
    // The button is disabled meanwhile; this keeps an unreadable amount out of
    // the request all the same.
    if (!linesOk) return
    setStep('generating')
    setGenerateError(null)
    try {
      const response = await generateFlows(account.id, { description })
      setProposals(
        buildProposals(response.occurrences, kind, { categoryId, paymentMethod, lines: linesToPayload(lines) }),
      )
      setModel(response.model)
      setProvider(response.provider)
      setInsertError(null)
      setStep('review')
    } catch (err) {
      setGenerateError(frameError(err, { client: 'Reformulez la règle, puis réessayez.' }))
      setStep('describe')
    }
  }

  // Once the flows are saved the dialog has done its job and is not re-armed:
  // a failing refresh (the parent reports its own load error) must neither read
  // as a failed insert nor let the same batch be inserted twice.
  async function handleInsert() {
    setInserting(true)
    setInsertError(null)
    try {
      await createFlowsBulk(account.id, proposals)
    } catch (err) {
      setInsertError(frameError(err))
      setInserting(false)
      return
    }
    toast(`${countLabel(proposals.length, 'flux inséré', 'flux insérés')}.`, { tone: 'positive' })
    try {
      await onInserted()
    } catch {
      // Closed, not kept in a "done" state: the flows are saved, so there is
      // nothing left to retry here (the parent already closes it before it refreshes).
      onClose()
    }
  }

  const reviewing = step === 'review'
  const generating = step === 'generating'
  const busy = generating || inserting

  // The description, template and proposals are lost on close: nothing closes
  // the dialog while a request runs, so a late failure stays visible.
  function requestClose() {
    if (!busy) onClose()
  }

  const columns: DataTableColumn<ProposalRow>[] = [
    {
      key: 'invoice_date',
      header: 'date de facture',
      render: (_, row) => <span className="numeric whitespace-nowrap">{formatDate(row.proposal.invoice_date, 'full')}</span>,
    },
    {
      key: 'payment_date',
      header: 'date de paiement',
      render: (_, row) =>
        row.proposal.payment_date ? (
          <span className="numeric whitespace-nowrap">{formatDate(row.proposal.payment_date, 'full')}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'name',
      header: 'nom',
      render: (_, row) => <span className="font-medium text-fg-strong">{row.proposal.name}</span>,
    },
    {
      key: 'amount',
      header: 'montant',
      numeric: true,
      render: (_, row) => (
        <span className={cn('whitespace-nowrap', row.proposal.kind === 'revenue' && 'text-positive-fg')}>
          {eur(signedFlowAmount(row.proposal.kind, linesTotals(row.proposal.lines, row.proposal.reverse_charge ?? false).gross))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (_, row) => (
        <div className="flex justify-end gap-1">
          <IconButton
            size="sm"
            icon={Pencil}
            label={`Modifier ${row.proposal.name}`}
            disabled={inserting}
            onClick={() => setEditingIndex(row.id)}
          />
          <IconButton
            size="sm"
            icon={X}
            label={`Retirer ${row.proposal.name}`}
            disabled={inserting}
            onClick={() => setProposals((prev) => prev.filter((_, j) => j !== row.id))}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <Dialog
        open
        size="lg"
        onClose={requestClose}
        title={reviewing ? 'Vérifier les flux générés' : kind === 'revenue' ? 'Générer des revenus' : 'Générer des dépenses'}
        // The description, template and proposals are lost on close, so a
        // stray click on the scrim doesn't close it.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        footer={
          reviewing ? (
            <>
              <Button type="button" variant="ghost" iconLeft={ArrowLeft} onClick={() => setStep('describe')} disabled={inserting}>
                Retour
              </Button>
              <span className="flex-1" />
              <Button type="button" variant="secondary" onClick={onClose} disabled={inserting}>
                Annuler
              </Button>
              <Button type="button" onClick={handleInsert} disabled={inserting || proposals.length === 0}>
                {inserting ? (
                  'Insertion…'
                ) : (
                  <span>
                    Insérer <CountFigure n={proposals.length} singular="flux" plural="flux" />
                  </span>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={generating}>
                Annuler
              </Button>
              <Button
                type="button"
                iconLeft={Sparkles}
                onClick={handleGenerate}
                disabled={generating || description.trim() === '' || !linesOk}
              >
                {generating ? 'Génération…' : 'Générer'}
              </Button>
            </>
          )
        }
      >
        {reviewing ? (
          <div className="flex flex-col gap-4">
            <p className="type-body-sm text-fg-muted">
              <CountFigure n={proposals.length} singular="flux proposé" plural="flux proposés" /> (modèle : {model}
              {provider ? ` via ${provider}` : ''}). Modifiez ou retirez des lignes, puis insérez.
            </p>
            <Card padding={false}>
              <DataTable
                compact
                columns={columns}
                rows={proposals.map((proposal, i) => ({ id: i, proposal }))}
                emptyMessage="Toutes les lignes ont été retirées — revenez en arrière pour régénérer."
              />
            </Card>
            {insertError && (
              <Callout tone="negative" title="Les flux n’ont pas été insérés.">
                {insertError}
              </Callout>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              label="Règle récurrente"
              hint="L’IA ne génère que les noms et les dates ; la catégorie, le moyen de paiement et les montants ci-dessous s’appliquent à chaque flux."
            >
              <Textarea
                rows={3}
                placeholder="Ex. cotisations sociales ~1000 € par trimestre, payées par domiciliation le 5 du premier mois du trimestre"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={generating}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Catégorie">
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={generating}
                  options={categoryOptions(categories, { detailed: true })}
                />
              </Field>
              <Field label="Moyen de paiement">
                <Select
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  disabled={generating}
                  options={paymentMethodOptions(account, { detailed: true })}
                />
              </Field>
            </div>
            {/* LinesEditor has no disabled prop: a disabled fieldset covers its inputs and buttons. */}
            <fieldset disabled={generating} className="m-0 min-w-0 border-0 p-0">
              <LinesEditor lines={lines} onChange={setLines} ledgerAccounts={ledgerAccounts} />
            </fieldset>
            {!linesOk && (
              <p className="type-body-sm text-negative-fg">
                Un montant ou un taux est illisible — corrigez les cases en rouge.
              </p>
            )}
            {generateError && (
              <Callout tone="negative" title="La génération a échoué.">
                {generateError}
              </Callout>
            )}
          </div>
        )}
      </Dialog>

      {editingIndex !== null && proposals[editingIndex] && (
        <FlowForm
          kind={proposals[editingIndex].kind}
          account={account}
          categories={categories}
          ledgerAccounts={ledgerAccounts}
          initialFlow={proposalToFlowRead(proposals[editingIndex], account.id)}
          onCancel={() => setEditingIndex(null)}
          // Writes back into the local proposals - nothing touches the API
          // until the final bulk insert.
          onSubmit={async (payload) => {
            setProposals((prev) => prev.map((p, j) => (j === editingIndex ? payload : p)))
            setEditingIndex(null)
          }}
        />
      )}
    </>
  )
}
