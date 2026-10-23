import { useEffect, useRef, useState } from 'react'
import { toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { FixedAssetRead } from '../../api/types'
import { messageOf } from '../../errors'
import { createSerialQueue } from '../../serialQueue'

export interface AssetEditor {
  asset: FixedAssetRead | undefined
  error: unknown
  /** PATCHes the description or the model; resolves false when the save failed (already toasted). */
  patch(body: { description?: string; depreciation_model_id?: number }): Promise<boolean>
  /** Types one year of the schedule. */
  typeYear(year: number, amount: string): Promise<boolean>
  /** Recomputes every row of the schedule and clears "modifié". */
  recompute(): Promise<boolean>
  /** Reads the asset again (its purchase line may have changed). */
  reload(): Promise<boolean>
  /** Deletes the asset after the pending saves; later saves are dropped. */
  remove(): void
}

/**
 * One fixed asset open in its form. Every save runs one at a time in the order made, and
 * each answer (the asset with its schedule) replaces it and goes to `onChange`, so the
 * register follows. Failures are toasted; the field puts the server's value back.
 */
export function useFixedAsset(
  id: number,
  o: { onChange?(asset: FixedAssetRead): void; onDeleted?(id: number): void },
): AssetEditor {
  const [asset, setAsset] = useState<FixedAssetRead>()
  const [error, setError] = useState<unknown>()
  const latest = useRef(o)
  latest.current = o
  const [enqueue] = useState(createSerialQueue)
  const dead = useRef(false)
  const path = `/fixed-assets/${id}`

  function accept(a: FixedAssetRead) {
    setAsset(a)
    latest.current.onChange?.(a)
  }

  useEffect(() => {
    let live = true
    api.get<FixedAssetRead>(path).then(
      (a) => live && setAsset(a),
      (e) => live && setError(e),
    )
    return () => {
      live = false
    }
  }, [path])

  function run(request: () => Promise<FixedAssetRead>): Promise<boolean> {
    return enqueue(async () => {
      if (!dead.current) accept(await request())
    }).then(
      () => true,
      (e) => {
        toast(messageOf(e), { tone: 'negative' })
        return false
      },
    )
  }

  return {
    asset,
    error,
    patch: (body) => run(() => api.patch<FixedAssetRead>(path, body)),
    typeYear: (year, amount) => run(() => api.put<FixedAssetRead>(`${path}/depreciations/${year}`, { amount })),
    recompute: () => run(() => api.post<FixedAssetRead>(`${path}/recompute`)),
    reload: () => run(() => api.get<FixedAssetRead>(path)),
    remove() {
      dead.current = true
      enqueue(() => api.del(path)).then(
        () => latest.current.onDeleted?.(id),
        (e) => {
          dead.current = false
          toast(messageOf(e), { tone: 'negative' })
        },
      )
    },
  }
}
