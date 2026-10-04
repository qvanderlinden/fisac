import { describe, expect, it } from 'vitest'
import type { FlowLineRead, FlowRead } from './api/types'
import { flowGapsSummary, isFlowIncomplete } from './accountingDisplay'

function line(ledgerAccountId: number | null): FlowLineRead {
  return {
    id: 1,
    description: null,
    amount_net: '10.00',
    vat_rate: '21.00',
    sort_key: 'a',
    ledger_account_id: ledgerAccountId,
  }
}

function flow(patch: Partial<FlowRead>): FlowRead {
  return {
    id: 1,
    account_id: 1,
    name: 'Loyer',
    kind: 'expense',
    category_id: 1,
    invoice_date: '2026-01-15',
    payment_date: null,
    payment_method: null,
    paid: false,
    batch_id: null,
    reverse_charge: false,
    sort_key: 'a',
    lines: [],
    amount_net: '0.00',
    amount_vat: '0.00',
    amount_gross: '0.00',
    ...patch,
  }
}

describe('flowGapsSummary', () => {
  it('is empty for a complete flow', () => {
    expect(isFlowIncomplete(flow({ lines: [line(3)] }))).toBe(false)
    expect(flowGapsSummary(flow({ lines: [line(3)] }))).toBe('')
  })

  it('names a missing category in French', () => {
    expect(flowGapsSummary(flow({ category_id: null, lines: [line(3)] }))).toBe('sans catégorie')
  })

  it('counts one unbooked line in the singular', () => {
    expect(flowGapsSummary(flow({ lines: [line(null)] }))).toBe('1 ligne sur 1 non imputée')
    expect(flowGapsSummary(flow({ lines: [line(null), line(3), line(3)] }))).toBe('1 ligne sur 3 non imputée')
  })

  it('counts several unbooked lines in the plural', () => {
    expect(flowGapsSummary(flow({ lines: [line(null), line(null), line(3)] }))).toBe('2 lignes sur 3 non imputées')
  })

  it('joins both gaps with a spaced semicolon', () => {
    expect(flowGapsSummary(flow({ category_id: null, lines: [line(null), line(null)] }))).toBe(
      'sans catégorie ; 2 lignes sur 2 non imputées',
    )
  })

  it('does not count a flow with no lines as unbooked', () => {
    expect(flowGapsSummary(flow({ category_id: null }))).toBe('sans catégorie')
  })
})
