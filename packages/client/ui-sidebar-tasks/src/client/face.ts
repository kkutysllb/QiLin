/**
 * The page's actions, bound to the Session service and the subagent Remote.
 *
 * The component awaits nothing: it calls `openChild`, `refresh`, and
 * `interruptChild`, and this face performs the service and Remote calls behind
 * them. Each action resolves what it needs at call time, never at render time.
 */
import type { SessionId } from '@qilin/session/types'
import type { SubagentAddress, SubagentInterruptReceipt } from '@qilin/subagent/client'
import type { RemoteResult } from '@qilin/typert-protocol'

/** The `ctx.sessions` reads the page's actions perform. */
export interface TasksSessionActions {
  /**
   * Reveal one catalog child as the current Session.
   * @param address - catalog-derived parent and child ids.
   */
  openSubagent(address: SubagentAddress): void
  /**
   * Re-read one parent's direct-child catalog.
   * @param parentSessionId - catalog owner.
   * @returns completion of the current or newly started read.
   */
  refreshSubagents(parentSessionId: SessionId): Promise<void>
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
   * Reveal one catalog child as the current Session.
   * @param address - the row's catalog address.
   */
  readonly openChild: (address: SubagentAddress) => void
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
}

/**
 * Bind the page's actions to the service and Remote they call.
 * @param sessions - the Client Session service's navigation and catalog reads.
 * @param subagents - the generated `subagents` Remote namespace.
 * @returns the Slot `inject` face the body receives.
 */
export function tasksFace(
  sessions: TasksSessionActions,
  subagents: TasksSubagentsRemote,
): TasksInjected {
  return {
    openChild(address) {
      sessions.openSubagent(address)
    },
    refresh(parentSessionId) {
      void sessions.refreshSubagents(parentSessionId)
    },
    // `interruptByParent` names the durably continuable delivery the caller's
    // row already carries; a one-shot child draws no control at all.
    interruptChild(childSessionId, parentSessionId) {
      void subagents.interruptByParent(childSessionId, parentSessionId, 'continuable')
    },
  }
}
