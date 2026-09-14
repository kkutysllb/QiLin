/**
 * MCP servers page store: the patch-layer snapshot the page renders, plus the
 * mutations that write it through the `mcpServers` Remote. The Host stays the
 * single fact source — every mutation answers with the fresh snapshot, so the
 * page never re-derives what it just wrote.
 */

import type { Context as ClientContext } from '@qilin/kylin'
import { createSnapshotStore } from '@qilin/client-store'
import type { SnapshotStore } from '@qilin/client-store'
import type { McpBuiltinView, McpServerDraft, McpServersSnapshot, McpServerView } from '@qilin/mcp-servers/types'
import type { RemoteResult } from '@qilin/typert-protocol'

/** What the MCP servers page renders at any moment. */
export interface McpPageState {
  /** `loading` only before the first answer; later refreshes keep the last rows. */
  status: 'idle' | 'loading' | 'ready'
  /** The failed call's message; null once a call succeeds. */
  error: string | null
  /** Why the patch layer is not addressable; null when it parsed. */
  layerError: string | null
  /** Absolute path of the patch layer every write goes to. */
  patchPath: string
  servers: readonly McpServerView[]
  builtins: readonly McpBuiltinView[]
  /** Namespace of the server whose write is in flight; null when none is. */
  busy: string | null
}

/** The MCP servers page controller (one per settings surface). */
export class McpServersStore {
  /** The snapshot the page renders from (uSES-safe store). */
  readonly store: SnapshotStore<McpPageState> = createSnapshotStore<McpPageState>({
    status: 'idle',
    error: null,
    layerError: null,
    patchPath: '',
    servers: [],
    builtins: [],
    busy: null,
  })

  /** Latest read wins; an older answer never overwrites a newer one. */
  private generation = 0

  /**
   * @param ctx - the page plugin's context, whose `remote.mcpServers` namespace
   * carries every read and write this page performs.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Read the whole page state from the Host.
   * @returns whether the answer landed.
   */
  async load(): Promise<boolean> {
    this.store.update((state) => { state.status = 'loading' })
    return await this.call(null, signal => this.ctx.remote.mcpServers.list(signal))
  }

  /**
   * Write one server's settings, adding it when the layer has none.
   * @param draft - the complete settings the editor submitted.
   * @returns whether the write landed; a failed one leaves the editor open.
   */
  async save(draft: McpServerDraft): Promise<boolean> {
    return await this.call(draft.serverName, signal => this.ctx.remote.mcpServers.save(draft, signal))
  }

  /**
   * Remove one configured server.
   * @param serverName - the namespace to remove.
   * @returns whether the removal landed.
   */
  async remove(serverName: string): Promise<boolean> {
    return await this.call(serverName, signal => this.ctx.remote.mcpServers.delete(serverName, signal))
  }

  /**
   * Enable or disable one configured server.
   * @param serverName - the namespace to change.
   * @param enabled - the next enablement.
   * @returns whether the change landed.
   */
  async setEnabled(serverName: string, enabled: boolean): Promise<boolean> {
    return await this.call(serverName, signal => this.ctx.remote.mcpServers.setEnabled(serverName, enabled, signal))
  }

  /**
   * Add one recommended server to the layer.
   * @param id - recommended-server id from the current snapshot.
   * @returns whether the server was added.
   */
  async addBuiltin(id: string): Promise<boolean> {
    return await this.call(id, signal => this.ctx.remote.mcpServers.addBuiltin(id, signal))
  }

  /**
   * Run one Remote call and publish its snapshot or its failure. Cancellation
   * is owned here rather than by a component: a superseded read is aborted so
   * its answer cannot land after a newer one.
   * @param busy - the namespace the caller should mark busy, or null for a read.
   * @param run - the call, given the signal it must be cancelled by.
   * @returns whether this call's answer was the one published.
   */
  private async call(
    busy: string | null,
    run: (signal: AbortSignal) => Promise<RemoteResult<McpServersSnapshot>>,
  ): Promise<boolean> {
    const generation = ++this.generation
    const controller = new AbortController()
    this.store.update((state) => { state.busy = busy; state.error = null })
    try {
      const result = await run(controller.signal)
      if (generation !== this.generation) return false
      if (!result.ok) {
        this.fail(result.error.message)
        return false
      }
      this.publish(result.value)
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      this.fail(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  /** Publish one snapshot: the page is ready, no write is in flight, no call failed. */
  private publish(snapshot: McpServersSnapshot): void {
    this.store.update((state) => {
      state.status = 'ready'
      state.error = null
      state.busy = null
      state.layerError = snapshot.error ?? null
      state.patchPath = snapshot.patchPath
      state.servers = snapshot.servers
      state.builtins = snapshot.builtins
    })
  }

  /** Publish a failed call, keeping the layer state the last answer described. */
  private fail(message: string): void {
    this.store.update((state) => {
      state.status = 'ready'
      state.busy = null
      state.error = message
    })
  }
}
