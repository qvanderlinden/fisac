/**
 * Runs async tasks one at a time, in the order they were added. A task that
 * rejects rejects only its own promise: the ones queued behind it still run.
 *
 * The flows table commits every edit with a full-replace PATCH built from the
 * freshest copy of the flow, so edits must not overlap: a second commit has to
 * wait for the first one to land (and for the list to refresh) before it
 * reads the flow it merges onto.
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
