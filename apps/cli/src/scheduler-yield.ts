/**
 * Host fallback for the Web Scheduler API global.
 * @module @qilin-agent/cli/scheduler-yield
 */

/** The part of the Web Scheduler API this harness relies on. */
interface HostScheduler {
  /** Yield to the event loop once, then continue. */
  yield: () => Promise<void>
}

/**
 * Install `globalThis.scheduler.yield` unless the host already defines a
 * `scheduler`.
 *
 * The fallback resolves on the next `setImmediate` — the API's "yield to the
 * event loop once, then continue" semantic — and a host-provided `scheduler`
 * is left untouched. Call it before importing anything that may read the
 * global; `bin.ts` calls it at the top of the entry, ahead of every mode
 * module. Rationale: [the host-shim Agent
 * Note](../../../.agents/notes/implemented/architecture/2026-10-07-web-scheduler-yield-host-shim.md).
 *
 * @returns whether this call installed the fallback.
 */
export function installSchedulerYield(): boolean {
  const host = globalThis as { scheduler?: unknown }
  if (host.scheduler !== undefined) return false
  const scheduler: HostScheduler = {
    yield: (): Promise<void> => new Promise(resolve => setImmediate(resolve)),
  }
  Object.defineProperty(globalThis, 'scheduler', { value: scheduler, writable: true, configurable: true })
  return true
}
