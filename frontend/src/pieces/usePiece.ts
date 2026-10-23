import { useEffect, useRef, useState } from 'react'
import { toast } from '@qvanderlinden/ui'
import { api } from '../api/client'
import type { PieceRead } from '../api/types'
import { messageOf } from '../errors'
import { createSerialQueue } from '../serialQueue'
import type { PieceSide } from './usePieceRefs'

/** A piece as every piece and line route answers it. */
export type AnyPiece = PieceRead & { lines: { id: number }[] }

const PATHS: Record<PieceSide, { piece: string; line: string }> = {
  sale: { piece: '/sales', line: '/sale-lines' },
  purchase: { piece: '/purchases', line: '/purchase-lines' },
}

/** `/sales` or `/purchases`. */
export function piecesPath(side: PieceSide): string {
  return PATHS[side].piece
}

export function piecePath(side: PieceSide, id: number): string {
  return `${PATHS[side].piece}/${id}`
}

export interface PieceEditor<T extends AnyPiece> {
  piece: T | undefined
  error: unknown
  /** PATCHes header fields; resolves false when the save failed (already toasted). */
  patch(body: object): Promise<boolean>
  addLine(body: object): Promise<boolean>
  patchLine(lineId: number, body: object): Promise<boolean>
  removeLine(lineId: number): Promise<boolean>
  /** Deletes the piece after the pending saves; later saves are dropped. */
  remove(): void
  /**
   * Asks the screen to hide the form. Once it has unmounted (so the saves its fields
   * flush are queued first), a piece created in this session (`isNew`) and left with no
   * line and no tiers is deleted; a piece that existed before is never deleted here.
   * `onSettled` follows once that and every save before it has reached the server.
   */
  close(): void
}

/**
 * One piece open in its form. Every field saves on its own; the requests run one at a
 * time in the order typed, and each answer (the whole piece) replaces the piece, so the
 * totals and the effects follow. Failures are toasted; the field puts the server's value
 * back (see `useSavedText`).
 */
export function usePiece<T extends AnyPiece>(
  side: PieceSide,
  id: number,
  o: {
    initial?: T
    isNew?: boolean
    onChange?(piece: T): void
    onDeleted?(id: number): void
    onClose(): void
    /** Once the form has unmounted and every save and delete it queued has been answered. */
    onSettled?(): void
  },
): PieceEditor<T> {
  const [piece, setPiece] = useState<T | undefined>(o.initial?.id === id ? o.initial : undefined)
  const [error, setError] = useState<unknown>()
  const latest = useRef(o)
  latest.current = o
  const current = useRef(piece)
  const [enqueue] = useState(createSerialQueue)
  const dead = useRef(false)
  const closing = useRef(false)
  const path = piecePath(side, id)

  function accept(p: T) {
    current.current = p
    setPiece(p)
    latest.current.onChange?.(p)
  }

  useEffect(() => {
    if (current.current?.id === id) return
    let live = true
    api.get<T>(path).then(
      (p) => live && accept(p),
      (e) => live && setError(e),
    )
    return () => {
      live = false
    }
  }, [path, id])

  // The fields' unmount cleanups flush their saves after this one runs: the close-time
  // delete and `onSettled` wait a microtask, so they queue behind those saves. StrictMode's
  // rehearsal unmount is followed at once by a remount, which the microtask sees.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (mounted.current) return
        if (closing.current && latest.current.isNew) {
          enqueue(async () => {
            const p = current.current
            if (dead.current || !p || p.lines.length > 0 || p.third_party_id !== null) return
            await api.del(path)
            dead.current = true
            latest.current.onDeleted?.(id)
          }).catch((e) => toast(messageOf(e), { tone: 'negative' }))
        }
        void enqueue.drained().then(() => latest.current.onSettled?.())
      })
    }
  }, [])

  function run(request: () => Promise<T>): Promise<boolean> {
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

  const lines = PATHS[side].line
  return {
    piece,
    error,
    patch: (body) => run(() => api.patch<T>(path, body)),
    addLine: (body) => run(() => api.post<T>(`${path}/lines`, body)),
    patchLine: (lineId, body) => run(() => api.patch<T>(`${lines}/${lineId}`, body)),
    removeLine: (lineId) => run(() => api.del<T>(`${lines}/${lineId}`)),
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
    close() {
      closing.current = true
      latest.current.onClose()
    },
  }
}
