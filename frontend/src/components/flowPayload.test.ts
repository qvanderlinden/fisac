import { describe, expect, it } from 'vitest'
import type { FlowLineRead, FlowRead } from '../api/types'
import { flowToPayload, mergeFlowChanges, replaceFlow } from './flowPayload'

function line(patch: Partial<FlowLineRead> = {}): FlowLineRead {
  return {
    id: 1,
    description: 'Abonnement',
    amount_net: '100.00',
    vat_rate: '21.00',
    sort_key: 'a',
    ledger_account_id: 7,
    ...patch,
  }
}

function flow(patch: Partial<FlowRead> = {}): FlowRead {
  return {
    id: 5,
    account_id: 1,
    name: 'Loyer',
    kind: 'expense',
    category_id: 2,
    invoice_date: '2026-10-08',
    payment_date: '2026-10-10',
    payment_method: 'bank_transfer',
    paid: false,
    batch_id: null,
    reverse_charge: false,
    sort_key: 'a',
    lines: [line()],
    amount_net: '100.00',
    amount_vat: '21.00',
    amount_gross: '121.00',
    ...patch,
  }
}

describe('flowToPayload', () => {
  it('keeps every header field and each line with its ledger account', () => {
    expect(flowToPayload(flow())).toEqual({
      name: 'Loyer',
      kind: 'expense',
      category_id: 2,
      invoice_date: '2026-10-08',
      payment_date: '2026-10-10',
      payment_method: 'bank_transfer',
      paid: false,
      reverse_charge: false,
      lines: [{ description: 'Abonnement', amount_net: '100', vat_rate: '21', ledger_account_id: 7 }],
    })
  })
})

describe('mergeFlowChanges', () => {
  it('lays the changes over the full payload', () => {
    const payload = mergeFlowChanges(flow(), { reverse_charge: true })
    expect(payload.reverse_charge).toBe(true)
    expect(payload.name).toBe('Loyer')
    expect(payload.lines).toHaveLength(1)
  })

  it('carries an earlier commit when merged onto the refreshed flow, not onto the stale one', () => {
    const stale = flow()
    // The rename landed and the list refreshed: the freshest copy has the new name.
    const fresh = flow({ name: 'Loyer bureau' })

    expect(mergeFlowChanges(stale, { reverse_charge: true }).name).toBe('Loyer')
    expect(mergeFlowChanges(fresh, { reverse_charge: true }).name).toBe('Loyer bureau')
  })

  it('replaces the lines when the change carries lines', () => {
    const lines = [{ description: null, amount_net: '5', vat_rate: '6', ledger_account_id: null }]
    expect(mergeFlowChanges(flow(), { lines }).lines).toEqual(lines)
  })

  it('does not mutate the flow it merges onto', () => {
    const base = flow()
    mergeFlowChanges(base, { name: 'Autre', paid: true })
    expect(base.name).toBe('Loyer')
    expect(base.paid).toBe(false)
  })
})

describe('replaceFlow', () => {
  it('swaps the flow with the same id and keeps the order', () => {
    const list = [flow({ id: 1 }), flow({ id: 2, name: 'Ancien' }), flow({ id: 3 })]
    const next = replaceFlow(list, flow({ id: 2, name: 'Nouveau' }))
    expect(next.map((f) => f.id)).toEqual([1, 2, 3])
    expect(next[1].name).toBe('Nouveau')
  })

  it('leaves the list as it is when the id is unknown', () => {
    const list = [flow({ id: 1 })]
    expect(replaceFlow(list, flow({ id: 9 }))).toEqual(list)
  })

  it('does not mutate the list it was given', () => {
    const list = [flow({ id: 1, name: 'Ancien' })]
    replaceFlow(list, flow({ id: 1, name: 'Nouveau' }))
    expect(list[0].name).toBe('Ancien')
  })
})
