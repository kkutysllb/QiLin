/** The agent-loop card's staged form over the `agent-loop` settings namespace. */

import type { SnapshotStore } from '@qilin-agent/client-store'
import type { ConfigForm } from '@qilin-agent/client-ui-settings/client'
import { SettingsFormModel, settingsNumberField, type SettingsFormActions, type SettingsFieldState, type SettingsFormShell } from '@qilin-agent/client-ui-primitives'

/**
 * Namespace of the agent loop's user-owned settings. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const AGENT_LOOP_NS = 'agent-loop'

/**
 * The agent-loop fields this card edits. The Host section carries only this
 * field — the composed `agents` array is deliberately not part of it.
 */
export interface AgentLoopSettings {
  /** Upper bound on parallel-safe tool calls in flight per step. */
  maxParallelToolCalls?: number
}

/** What the agent-loop card renders. */
export interface AgentLoopCardState extends SettingsFormShell {
  /** Parallel tool-call cap. */
  maxParallelToolCalls: SettingsFieldState
}

/** The registration-side face the agent-loop card's slot entry injects. */
export interface AgentLoopCardFace extends SettingsFormActions {
  hooks: {
    /** Card snapshot bound by the renderer as useAgentLoopCard. */
    agentLoopCard: SnapshotStore<AgentLoopCardState>
  }
}

/** Bridges the `agent-loop` scope onto the card's staged form. */
export class AgentLoopCardController {
  private readonly form: SettingsFormModel<AgentLoopSettings>
  private readonly store: SnapshotStore<AgentLoopCardState>

  /** @param scope - the bound settings scope for the `agent-loop` namespace. */
  constructor(scope: ConfigForm<AgentLoopSettings>) {
    this.form = new SettingsFormModel(scope, [settingsNumberField('maxParallelToolCalls')])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): AgentLoopCardState {
    return { ...this.form.shell(), maxParallelToolCalls: this.form.field('maxParallelToolCalls') }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): AgentLoopCardFace {
    return { hooks: { agentLoopCard: this.store }, ...this.form.actions() }
  }
}
