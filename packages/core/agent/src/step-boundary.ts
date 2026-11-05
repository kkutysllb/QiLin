/**
 * Optional host delivery that records steering at the step boundary that
 * claims it.
 * @module @qilin-agent/agent/step-boundary
 */

import type { UserMessage } from '@qilin-agent/llm'

/**
 * Process-stable host hook for deterministic step-boundary steering delivery.
 *
 * An Agent implementation that stages a message and splices it from the same
 * pre-step that claims it implements this hook, so the durable inbox insertion
 * shares one boundary with the claim that consumes it. Callers fall back to
 * `Agent.steer()` when the hook is absent: that path records the insertion at
 * call time, which suits a locally submitted steer but lets a cross-agent relay
 * land between an existing claim and the step it opens.
 * @internal
 */
export const deliverAtNextStep = Symbol.for('qilin.agent.deliverAtNextStep')

/** Host face implemented by an Agent that supports {@link deliverAtNextStep}. */
export interface StepBoundaryDelivery {
  /**
   * Stage one steering message for the step boundary that claims it.
   * @param message - identified steering content and the source that supplied it.
   */
  [deliverAtNextStep](message: UserMessage): void
}
