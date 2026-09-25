/**
 * Generic-job adaptation for pwsh process handles: the terminal outcome the
 * registry records and the pull source it pumps into the job's output ring.
 *
 * @module @qilin/tool-pwsh/background
 */

import type { SandboxMode } from '@qilin/sandbox'
import { escalationHintMarker, sandboxDenialMarker } from '@qilin/sandbox'
import type { ShellProcess, ShellSandboxInfo } from '@qilin/shell'
import type { JobHooks, JobOutcome, JobOutputSource } from '@qilin/jobs'
import { renderPwshProcessRead } from './render.ts'

/**
 * Sandbox facts worth the terminal detail: a runner that never ran the
 * command, or a denial (with the escalation hint this composition offers).
 * @param sandbox - settled sandbox facts, when this was a confined process.
 * @param escalationModes - escalation targets advertised by this composition.
 * @returns the markers to append, oldest first.
 */
function sandboxNotes(sandbox: ShellSandboxInfo | undefined, escalationModes: readonly SandboxMode[]): string[] {
  if (sandbox?.runnerFailed) {
    return [`[sandbox: the sandbox runner itself failed under ${sandbox.mode} mode — the command did not run; this is a sandbox problem, not a command failure]`]
  }
  if (sandbox?.denied) {
    const notes = [sandboxDenialMarker(sandbox.mode)]
    if (escalationModes.length > 0) notes.push(escalationHintMarker('command'))
    return notes
  }
  return []
}

/**
 * Map a settled background process onto the generic job-outcome vocabulary:
 * `killed` stays `killed` (detail: the signal when one is known), everything
 * else is `completed` with the exit code as detail. A nonzero command exit is
 * reported, not failed, exactly like the foreground rendering. Sandbox facts
 * join the detail, since a job's terminal reason is the one line every
 * reader — the model's status line, the roster row — shows.
 * @param proc - the settled process handle.
 * @param escalationModes - escalation targets advertised by this composition.
 * @returns the outcome for the `ctx.jobs` registration.
 */
export function processOutcome(proc: ShellProcess, escalationModes: readonly SandboxMode[] = []): JobOutcome {
  // TODO(background-infrastructure-outcome): widen ShellProcess with an explicit
  // infrastructure-failure outcome, then map it to job `failed`. Restricted
  // runner failures expose sandbox.runnerFailed, but unconfined spawn failures
  // still alias a signal-less kill; real nonzero command exits must remain
  // `completed`.
  const base: JobOutcome = proc.status === 'killed'
    ? { status: 'killed', detail: proc.signal !== null ? `signal: ${proc.signal}` : 'killed before exit' }
    : { status: 'completed', detail: `exit code: ${proc.exitCode ?? 0}` }
  const notes = sandboxNotes(proc.sandbox, escalationModes)
  return notes.length === 0 ? base : { ...base, detail: `${base.detail}; ${notes.join(' ')}` }
}

/**
 * The process's captured output as a registry pull source. It binds lazily
 * because the process is spawned inside the starter, after the registry
 * admitted the job; a read before the spawn yields nothing.
 *
 * The shell handle's own reader is consuming — each call hands over what
 * arrived since the previous one — so this source counts the bytes it
 * delivered to keep the registry's cursor monotonic, exactly as the terminal
 * tool adapts its own consuming send reader. Truncation is reported in-band by
 * the read rendering, which names the spill files, so the source has no
 * separate spill path to advertise.
 * @param proc - the started process, once the starter has spawned it.
 * @param escalationModes - escalation targets advertised by this composition.
 * @returns the single source over the process's captured streams.
 */
export function processSources(
  proc: () => ShellProcess | undefined,
  escalationModes: readonly SandboxMode[] = [],
): JobOutputSource[] {
  return [{
    read: (fromByte) => {
      const live = proc()
      if (live === undefined) return { text: '', nextOffset: fromByte, lossy: false }
      const text = renderPwshProcessRead(live.readOutput(), live.sandbox, escalationModes)
      return { text, nextOffset: fromByte + Buffer.byteLength(text, 'utf8'), lossy: false }
    },
  }]
}

/**
 * Adapt asynchronous shell preparation after job admission without exposing a partial process.
 * @param start - starts the process with job-owned cancellation.
 * @param outcome - projects the settled process into the job outcome.
 * @returns synchronous job hooks whose completion includes preparation and process settlement.
 */
export function processJob(
  start: (signal: AbortSignal) => Promise<ShellProcess>,
  outcome: (process: ShellProcess) => JobOutcome,
): JobHooks {
  const controller = new AbortController()
  let process: ShellProcess | undefined
  const done: Promise<JobOutcome> = (async () => {
    try {
      process = await start(controller.signal)
      try {
        if (controller.signal.aborted) process.kill()
      } finally {
        await process.done
      }
      return outcome(process)
    } catch (error: unknown) {
      return {
        status: controller.signal.aborted && process === undefined ? 'killed' : 'failed',
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  })()
  return {
    cancel: (reason) => {
      if (controller.signal.aborted) return
      controller.abort(reason)
      process?.kill()
    },
    done,
  }
}
