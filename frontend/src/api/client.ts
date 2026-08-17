import type {
  AccountCreate,
  AccountProjection,
  AccountRead,
  AccountVat,
  AccountUpdate,
  CategoryCreate,
  CategoryRead,
  CategoryUpdate,
  FlowBulkUpdate,
  FlowCreate,
  FlowGenerateRequest,
  FlowGenerateResponse,
  FlowKind,
  FlowRead,
  FlowUpdate,
  MoveRequest,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return res.json() as Promise<T>
}

// --- Accounts ---------------------------------------------------------------

export function listAccounts(): Promise<AccountRead[]> {
  return request('/accounts')
}

export function createAccount(payload: AccountCreate): Promise<AccountRead> {
  return request('/accounts', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateAccount(accountId: number, payload: AccountUpdate): Promise<AccountRead> {
  return request(`/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function moveAccount(accountId: number, payload: MoveRequest): Promise<AccountRead> {
  return request(`/accounts/${accountId}/move`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function deleteAccount(accountId: number): Promise<void> {
  return request(`/accounts/${accountId}`, { method: 'DELETE' })
}

// --- Categories -------------------------------------------------------------

export function listCategories(accountId: number): Promise<CategoryRead[]> {
  return request(`/accounts/${accountId}/categories`)
}

export function createCategory(accountId: number, payload: CategoryCreate): Promise<CategoryRead> {
  return request(`/accounts/${accountId}/categories`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateCategory(
  accountId: number,
  categoryId: number,
  payload: CategoryUpdate,
): Promise<CategoryRead> {
  return request(`/accounts/${accountId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function moveCategory(
  accountId: number,
  categoryId: number,
  payload: MoveRequest,
): Promise<CategoryRead> {
  return request(`/accounts/${accountId}/categories/${categoryId}/move`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteCategory(accountId: number, categoryId: number): Promise<void> {
  return request(`/accounts/${accountId}/categories/${categoryId}`, { method: 'DELETE' })
}

// --- Flows ------------------------------------------------------------------

export function listFlows(accountId: number, kind?: FlowKind): Promise<FlowRead[]> {
  const params = kind ? `?${new URLSearchParams({ kind })}` : ''
  return request(`/accounts/${accountId}/flows${params}`)
}

export function getFlow(accountId: number, flowId: number): Promise<FlowRead> {
  return request(`/accounts/${accountId}/flows/${flowId}`)
}

export function createFlow(accountId: number, payload: FlowCreate): Promise<FlowRead> {
  return request(`/accounts/${accountId}/flows`, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateFlow(
  accountId: number,
  flowId: number,
  payload: FlowUpdate,
): Promise<FlowRead> {
  return request(`/accounts/${accountId}/flows/${flowId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function setFlowPaid(accountId: number, flowId: number, paid: boolean): Promise<FlowRead> {
  return request(`/accounts/${accountId}/flows/${flowId}/paid`, {
    method: 'PATCH',
    body: JSON.stringify({ paid }),
  })
}

export function moveFlow(
  accountId: number,
  flowId: number,
  payload: MoveRequest,
): Promise<FlowRead> {
  return request(`/accounts/${accountId}/flows/${flowId}/move`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteFlow(accountId: number, flowId: number): Promise<void> {
  return request(`/accounts/${accountId}/flows/${flowId}`, { method: 'DELETE' })
}

// Deletes every flow created by the same /bulk call (see FlowRead.batch_id).
export function deleteFlowBatch(accountId: number, batchId: string): Promise<void> {
  return request(`/accounts/${accountId}/flows/batch/${batchId}`, { method: 'DELETE' })
}

// Applies the given fields to every flow in payload.flow_ids at once. Only keys
// present in the payload are changed server-side (see FlowBulkUpdate).
export function bulkUpdateFlows(
  accountId: number,
  payload: FlowBulkUpdate,
): Promise<FlowRead[]> {
  return request(`/accounts/${accountId}/flows/bulk`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// Deletes every flow in flowIds in one transaction (scoped to the account).
export function bulkDeleteFlows(accountId: number, flowIds: number[]): Promise<void> {
  return request(`/accounts/${accountId}/flows/bulk`, {
    method: 'DELETE',
    body: JSON.stringify({ flow_ids: flowIds }),
  })
}

// Sends the natural-language rule to the backend, which has OpenRouter expand
// it into a proposed schedule. No DB writes until the user approves via
// createFlowsBulk.
export function generateFlows(
  accountId: number,
  payload: FlowGenerateRequest,
): Promise<FlowGenerateResponse> {
  return request(`/accounts/${accountId}/flows/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createFlowsBulk(accountId: number, flows: FlowCreate[]): Promise<FlowRead[]> {
  return request(`/accounts/${accountId}/flows/bulk`, {
    method: 'POST',
    body: JSON.stringify({ flows }),
  })
}

// --- Projection -------------------------------------------------------------

export function fetchProjection(accountId: number, toDate?: string): Promise<AccountProjection> {
  const params = toDate ? `?${new URLSearchParams({ to_date: toDate })}` : ''
  return request(`/accounts/${accountId}/projection${params}`)
}

// --- VAT --------------------------------------------------------------------

export function fetchVat(accountId: number, year?: number): Promise<AccountVat> {
  const params = year != null ? `?${new URLSearchParams({ year: String(year) })}` : ''
  return request(`/accounts/${accountId}/vat${params}`)
}
