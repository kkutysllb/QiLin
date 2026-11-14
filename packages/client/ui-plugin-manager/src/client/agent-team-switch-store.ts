/**
 * The Agent Teams profile layer as the Session header's switch sees it: whether
 * the profile selects the bundle, and whether a write is in flight or refused.
 */

import { createSnapshotStore, type SnapshotStore } from '@qilin-agent/client-store'
import type { Context as ClientContext } from '@qilin-agent/kylin'
// Type-only: pulls the `ctx.remote` merge and the pluginManager namespace row.
import type {} from '@qilin-agent/api-remotes/client'

/** The bundle the switch owns: the installation ships it, the profile selects it. */
export const AGENT_TEAM_BUNDLE = '@qilin-agent/agent-team-profile'

/** Header switch snapshot. */
export interface AgentTeamSwitchState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** Whether the profile selects the bundle right now. */
  enabled: boolean
  /** Whether a write is in flight. */
  busy: boolean
  /** The last write's outcome, when it needs saying: a failure or a restart. */
  notice: 'failed' | 'restart-required' | null
  /** The Host's reason for {@link notice}, when it gave one. */
  detail: string | null
}

const INITIAL: AgentTeamSwitchState = {
  status: 'idle',
  enabled: false,
  busy: false,
  notice: null,
  detail: null,
}

/** Reads and writes the Agent Teams bundle selection for the Session header switch. */
export class AgentTeamSwitchController {
  /** Snapshot the header's switch subscribes to. */
  readonly store: SnapshotStore<AgentTeamSwitchState> = createSnapshotStore(INITIAL)

  /**
   * @param ctx - the browser plugin context (the pluginManager Remote namespace).
   */
  constructor(
    private readonly ctx: ClientContext,
  ) {}

  private set(patch: Partial<AgentTeamSwitchState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Read the bundle's selection. A Host that does not list it leaves the
   * switch out: this installation cannot switch Agent Teams on or off.
   * @returns once the snapshot reflects the Host.
   */
  async load(): Promise<void> {
    this.set({ status: 'loading' })
    const result = await this.ctx.remote.pluginManager.listBundles()
    if (!result.ok) {
      this.set({ status: 'unavailable', detail: result.error.message })
      return
    }
    const bundle = result.value.find(candidate => candidate.name === AGENT_TEAM_BUNDLE)
    if (bundle === undefined) {
      this.set({ status: 'unavailable' })
      return
    }
    this.set({ status: 'ready', enabled: bundle.enabled })
  }

  /**
   * Select or deselect the bundle, then re-read what the Host settled on so a
   * refused or restart-bound write shows the state that actually holds.
   * @param next - the selection the switch asks for.
   * @returns once the write and the confirming read settle.
   */
  async toggle(next: boolean): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.status !== 'ready' || state.busy) return
    this.set({ busy: true, notice: null, detail: null })
    try {
      const result = await this.ctx.remote.pluginManager.setBundleEnabled(AGENT_TEAM_BUNDLE, next)
      if (result.ok) {
        this.set({
          ...result.value.application === 'restart-required'
            ? { notice: 'restart-required' as const, detail: result.value.restartReason ?? null }
            : {},
          ...result.value.application === 'failed' || result.value.application === 'cancelled'
            ? { notice: 'failed' as const, detail: result.value.error?.diagnostic ?? null }
            : {},
        })
      } else {
        this.set({ notice: 'failed', detail: result.error.message })
      }
      await this.load()
    } finally {
      this.set({ busy: false })
    }
  }
}
