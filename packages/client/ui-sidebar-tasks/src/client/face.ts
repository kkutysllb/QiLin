/**
 * The page's actions, bound to the Session service and the subagent Remote.
 *
 * The component awaits nothing: it calls `openChild`, `refresh`, and
 * `interruptChild`, and this face performs the service and Remote calls behind
 * them. Each action resolves what it needs at call time, never at render time.
 */
import type { JobsSnapshot } from '@qilin-agent/api-job-controller/client'
import type { SessionTarget } from '@qilin-agent/api-session-controller/client'
import type { SessionId } from '@qilin-agent/session/types'
import type { SubagentInterruptReceipt } from '@qilin-agent/subagent/client'
import type { RemoteResult } from '@qilin-agent/typert-protocol'

/** The `ctx.sessions` reads the page's actions perform. */
export interface TasksSessionActions {
  /**
   * Reveal one Session as the current one: a catalog child through its
   * durable address, or a bare id (the graph's main card).
   * @param target - the Session to open.
   */
  openSubagent(target: SessionTarget): void
  /**
   * Re-read one parent's direct-child catalog.
   * @param parentSessionId - catalog owner.
   * @returns completion of the current or newly started read.
   */
  refreshProjections(parentSessionId: SessionId): Promise<void>
}

/** One child interrupt, as the Host's generated `subagents.interruptByParent` declares it. */
export type InterruptByParent = (
  childSessionId: SessionId,
  parentSessionId: SessionId,
  mode: 'continuable',
) => Promise<RemoteResult<SubagentInterruptReceipt>>

/** The slice of the Client Remote face the page calls. */
export interface TasksSubagentsRemote {
  /**
   * Stop one continuable child through its durable parent address.
   * @param childSessionId - the child being stopped.
   * @param parentSessionId - the child's direct parent.
   * @param mode - the delivery mode the address must carry.
   * @returns the Host's receipt, or its failure.
   */
  interruptByParent: InterruptByParent
}

/** The page's injected business face, as the body receives it. */
export interface TasksInjected {
  /**
   * Reveal one Session as the current one: a row's catalog address, or the
   * graph's bare main id.
   * @param target - the Session to open.
   */
  readonly openChild: (target: SessionTarget) => void
  /**
   * Re-read one parent's direct-child catalog.
   * @param parentSessionId - catalog owner.
   */
  readonly refresh: (parentSessionId: SessionId) => void
  /**
   * Stop one running continuable child through its durable parent address. The
   * call is fire-and-forget: a rejected interrupt leaves the row exactly as the
   * catalog reports it until the next refresh.
   * @param childSessionId - the child being stopped.
   * @param parentSessionId - the child's direct parent.
   */
  readonly interruptChild: (childSessionId: SessionId, parentSessionId: SessionId) => void
  /** The client jobs roster the page draws, bound by the renderer as useJobs. */
  readonly hooks: { readonly jobs: {
    getSnapshot(): JobsSnapshot
    subscribe(listener: () => void): () => void
  } }
  /**
   * Keep this Session's roster current while the page is mounted; returns the
   * stop function.
   * @param sessionId - the Session whose visible jobs to mirror.
   */
  readonly watchRows: (sessionId: SessionId) => () => void
}

/** The background-job roster and watcher the page draws from. */
export interface TasksJobsFace {
  readonly hooks: { readonly jobs: {
    getSnapshot(): JobsSnapshot
    subscribe(listener: () => void): () => void
  } }
  readonly watchRows: (sessionId: SessionId) => () => void
}

/**
 * Bind the page's actions to the service and Remote they call.
 * @param sessions - the Client Session service's navigation and catalog reads.
 * @param subagents - the generated `subagents` Remote namespace.
 * @param jobs - the client jobs roster and its watcher.
 * @returns the Slot `inject` face the body receives.
 */
export function tasksFace(
  sessions: TasksSessionActions,
  subagents: TasksSubagentsRemote,
  jobs: TasksJobsFace,
): TasksInjected {
  return {
    ...jobs,
    openChild(target) {
      sessions.openSubagent(target)
    },
    refresh(parentSessionId) {
      void sessions.refreshProjections(parentSessionId)
    },
    // `interruptByParent` names the durably continuable delivery the caller's
    // row already carries; a one-shot child draws no control at all.
    interruptChild(childSessionId, parentSessionId) {
      void subagents.interruptByParent(childSessionId, parentSessionId, 'continuable')
    },
  }
}
