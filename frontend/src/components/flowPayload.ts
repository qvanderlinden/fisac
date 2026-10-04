import type { FlowCreate, FlowRead } from '../api/types'
import { linesToDrafts, linesToPayload } from './LinesEditor'

// A FlowRead reduced to the full FlowCreate payload the update endpoint wants
// (full-replace semantics), so a single changed field can be merged on top.
// Lines round-trip through the LinesEditor draft <-> payload pair every
// editor uses: a hand-rolled field list once dropped ledger_account_id, which
// silently unbooked every line on each inline edit.
export function flowToPayload(flow: FlowRead): FlowCreate {
  return {
    name: flow.name,
    kind: flow.kind,
    category_id: flow.category_id,
    invoice_date: flow.invoice_date,
    payment_date: flow.payment_date,
    payment_method: flow.payment_method,
    paid: flow.paid,
    reverse_charge: flow.reverse_charge,
    lines: linesToPayload(linesToDrafts(flow.lines)),
  }
}

/**
 * The payload for one inline edit. `flow` must be the freshest copy of the
 * flow (after any commit queued before this one), never a render-time
 * snapshot: the update replaces the whole flow, so a stale base would write
 * an earlier edit back.
 */
export function mergeFlowChanges(flow: FlowRead, changes: Partial<FlowCreate>): FlowCreate {
  return { ...flowToPayload(flow), ...changes }
}

/**
 * The list with the flow of the same id swapped for `flow` (order kept), as a
 * new array. A mutation's response is written into the freshest-copy list this
 * way, so the next queued commit on that row builds on the saved value even
 * when the follow-up reload fails.
 */
export function replaceFlow(flows: FlowRead[], flow: FlowRead): FlowRead[] {
  return flows.map((f) => (f.id === flow.id ? flow : f))
}
