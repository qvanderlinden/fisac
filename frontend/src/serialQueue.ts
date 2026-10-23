/**
 * Runs async tasks one at a time, in the order they were added. A task that
 * rejects rejects only its own promise: the ones queued behind it still run.
 *
 * One row's autosaved fields each PATCH on their own; queued per row, they
 * reach the server in the order they were typed, so a slow first PATCH can
 * never land after a later one and undo it.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task)
    // The tail never rejects, so one failure cannot stall the queue; callers
    // still get the rejection through `result`.
    tail = result.catch(() => undefined)
    return result
  }
}
