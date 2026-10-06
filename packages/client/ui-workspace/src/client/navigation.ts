/** Workspace archive and directory UI capability. */

import { Service, type Context } from '@qilin/kylin'
import type { ClientRemote, DirectoryListing, RemoteFailure, RemoteResult } from '@qilin/api-remotes/client'
import type {
  ISessions,
  SessionReference,
  SessionTarget,
  SessionListState,
} from '@qilin/api-session-controller/client'
import { createSnapshotStore, type ObservableSnapshot } from '@qilin/client-store'
import type { SubagentAddress } from '@qilin/subagent/client'
import type {
  IWorkspaces, WorkspaceId, WorkspaceView,
} from '@qilin/api-workspace-controller/client'
import type { SessionId } from '@qilin/session/types'
// Type-only: the workbench state owner this navigation coordinates with (D3).
import type { Workbench } from '@qilin/client-ui-workbench/client'
import type {} from '@qilin/client-ui-layout/client'
import { pinOrderAccounts, pinOrderSource } from './pin-order.ts'
import type { WorkspaceViewStoreActions } from './stores.ts'

/** The main-pane selection a navigation action publishes: one Session, or one direct-parent subagent address. */
export interface MainSelection {
  readonly sessionId?: SessionId
  readonly subagentAddress?: SubagentAddress
}

/** Workspace archive and directory operations consumed by Client UI domains. */
export interface UiWorkspace {
  /**
   * The persisted main-pane selection. The Session Controller owns the catalog and
   * leaves view selection to navigation, so surfaces that need "the Session the
   * shell is showing" read it here.
   */
  readonly selection: ObservableSnapshot<MainSelection>
  /**
   * Select a Session and show its Conversation as one UI navigation action.
   * @param target - known Session identity or durable direct-parent subagent address to display.
   */
  openSession(target: SessionTarget): void
  /**
   * Connect a Workspace and open its Session unless a later navigation supersedes it.
   * @param workspaceId - target Workspace.
   * @param beforeOpen - optional synchronous preparation for the selected Session,
   * skipped after supersession; a throw aborts the open and releases the retained reference.
   * @returns completion; a superseded request may create a Session but does not open it.
   */
  openWorkspace(workspaceId: WorkspaceId, beforeOpen?: (sessionId: SessionId) => void): Promise<void>
  /**
   * Fork a Session and open the child unless a later navigation supersedes it.
   * @param sessionId - source Session.
   * @returns completion; a superseded request leaves its child available without selecting it.
   */
  forkSession(sessionId: SessionId): Promise<void>
  /**
   * Resolve the reusable or newly created blank Session for a Workspace.
   * @param workspaceId - target Workspace.
   * @returns a Session already addressable through the Session Controller.
   */
  connectWorkspace(workspaceId: WorkspaceId): Promise<SessionId>
  /**
   * Start a New Session flow and navigate to its Session.
   * @param workspaceId - explicit target; absent inherits the current or most recent Workspace.
   */
  startSession(workspaceId?: WorkspaceId): void
  /**
   * Switch the current blank Session to an explicitly picked new-task preset
   * (the hero chip's per-tag choice; the next new task already names it at
   * create). A started or absent Session keeps its composition.
   * @param presetId - the picked preset id.
   */
  adoptBlankSessionPreset(presetId: string): void
  /**
   * Archive a Session and clear it when it is the current selection.
   * @param sessionId - Session to archive.
   */
  archiveSession(sessionId: SessionId): Promise<void>
  /**
   * Unarchive a Session, restoring it to its recorded Workspace position.
   * @param sessionId - Session to unarchive.
   */
  unarchiveSession(sessionId: SessionId): Promise<void>
  /**
   * Pin a Session on the Host and front its saved position in every account that owns it.
   * @param sessionId - Session to pin.
   */
  pinSession(sessionId: SessionId): Promise<void>
  /**
   * Unpin a Session on the Host; saved positions stay as they are.
   * @param sessionId - Session to unpin.
   */
  unpinSession(sessionId: SessionId): Promise<void>
  /**
   * Open the Host-native directory picker.
   * @returns the selected directory, or null when cancelled.
   */
  pickDirectory(): Promise<string | null>
  /**
   * List one Host directory level.
   * @param path - directory path; absent selects the Host home.
   * @param signal - cancellation for a superseded scan.
   * @returns directory entries and breadcrumb ancestry.
   */
  listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing>
  /**
   * Create a child directory.
   * @param path - existing parent directory.
   * @param name - child directory name.
   * @returns created absolute path.
   */
  createDirectory(path: string, name: string): Promise<string>
}

declare module '@qilin/kylin' {
  interface Context {
    /** Cross-Controller Workspace navigation and directory UI capability. */
    uiWorkspace: UiWorkspace
  }
}

/** Structured directory failure exposed to directory UI consumers. */
export class DirectoryBrowseError extends Error {
  override readonly name = 'DirectoryBrowseError'

  /** @param rpcError - Host directory business failure. */
  constructor(readonly rpcError: RemoteFailure) {
    super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`)
  }
}

/**
 * The preset-switch caller the browsing region consumes: the one Remote method
 * the blank-session tag rebind needs, stated structurally so consumers pass the
 * live namespace or a test double without a cast.
 */
export interface AgentPresetSwitcher {
  /**
   * Switch one blank session's agent composition to a preset.
   * @param id - the blank session to recompose.
   * @param agentPreset - the preset id to compose from.
   * @returns the recorded preset id, or a failure (`agent-preset/locked` once
   * the session has started).
   */
  select(id: SessionId, agentPreset: string): Promise<RemoteResult<string>>
}

/** Implements Workspace archive and directory UI operations. */
class UiWorkspaceService extends Service implements UiWorkspace {
  private readonly connecting = new Map<WorkspaceId, Promise<SessionId>>()
  private readonly lifetime = new AbortController()
  /**
   * The persisted main-pane selection. Published as the `mainSelection` root
   * standard source, because the Session Controller owns the catalog and leaves
   * view selection to navigation.
   */
  readonly selection = createSnapshotStore<MainSelection>(
    {}, { persist: { name: 'qilin.sessions.current' } },
  )
  private mainReference: SessionReference | undefined

  /**
   * @param ctx - Client root Context.
   * @param directoryPicker - the directory-picking Remote namespace.
   * @param agentPresets - the preset-switch caller, for the blank-session
   * tag rebind (D3: a blank session may switch presets; a started one may not).
   * @param workbench - the tag state owner, supplying each new task's preset
   * and the visibility fold the reuse rule checks.
   * @param workspaces - pure Workspace Controller.
   * @param sessions - pure Session Controller.
   * @param view - the browser's viewing-store write set, which owns saved Session order.
   */
  constructor(
    ctx: Context,
    private readonly directoryPicker: ClientRemote['directoryPicker'],
    private readonly agentPresets: AgentPresetSwitcher,
    private readonly workbench: Workbench,
    private readonly workspaces: IWorkspaces,
    private readonly sessions: ISessions,
    private readonly view: Pick<WorkspaceViewStoreActions, 'pinSessionOrder'>,
  ) {
    super(ctx, 'uiWorkspace')
    ctx.effect(() => {
      const stop = this.watchNavigation()
      return () => {
        stop()
        this.lifetime.abort()
        const reference = this.mainReference
        this.mainReference = undefined
        reference?.release()
      }
    }, 'ui-workspace: Workspace navigation policy')
  }

  async connectWorkspace(workspaceId: WorkspaceId): Promise<SessionId> {
    const workspace = this.workspaces.list.getSnapshot().items
      .find(item => item.workspaceId === workspaceId)
    if (workspace === undefined) {
      throw new Error(`uiWorkspace.connectWorkspace: unknown workspace ${workspaceId}`)
    }
    const inflight = this.connecting.get(workspaceId)
    if (inflight !== undefined) return inflight

    const archived = this.workspaces.list.getSnapshot().archivedSessionIds
    const sessions = this.sessions.list.getSnapshot()
    for (const id of sessions.ids) {
      const summary = sessions.byId[id]
      if (summary !== undefined && summary.blank && summary.cwd === workspace.path
        && workspace.sessionIds.includes(summary.id)
        && !archived.includes(summary.id)) {
        this.rebindBlankToActiveTag(id)
        return summary.id
      }
    }

    // D3: the new task names its preset explicitly instead of leaving the
    // Host to resolve the roster default, so the workbench tag the task was
    // started under decides what the session composes from.
    const attempt = this.sessions.create({
      workspaceId,
      agentPreset: this.workbench.presetFor(this.workbench.state.getSnapshot().active),
    })
      .finally(() => { this.connecting.delete(workspaceId) })
    this.connecting.set(workspaceId, attempt)
    return attempt
  }

  /**
   * Rebind every blank session of the current Workspace to the now-active
   * tag's preset. Blank sessions carried over from the other tag would
   * otherwise sit hidden in this tag's filtered list; a non-blank session
   * stays exactly as it is (the Host refuses non-blank switches anyway).
   */
  rebindBlanksAfterTagSwitch(): void {
    const current = this.mainReference?.sessionId
    const workspace = current === undefined
      ? undefined
      : this.workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(current))
    if (workspace === undefined) return
    for (const id of workspace.sessionIds) {
      const summary = this.sessions.list.getSnapshot().byId[id]
      if (summary?.blank === true) this.rebindBlankToActiveTag(id)
    }
  }

  /**
   * Switch one blank session to the active tag's preset when the preset it
   * was created under does not show under this tag. Fire-and-forget: the
   * session stays usable either way, and a `locked` verdict means it engaged
   * mid-rebind, so its own preset stands.
   * @param id - the blank session to align.
   */
  private rebindBlankToActiveTag(id: SessionId): void {
    const summary = this.sessions.list.getSnapshot().byId[id]
    if (summary === undefined) return
    const tag = this.workbench.state.getSnapshot().active
    if (this.workbench.shows(summary.projectionValues?.agentPreset, tag)) return
    this.agentPresets.select(id, this.workbench.presetFor(tag)).catch((reason: unknown) => {
      console.warn(`blank session ${id} kept its own preset:`, reason)
    })
  }

  adoptBlankSessionPreset(presetId: string): void {
    const current = this.mainReference?.sessionId
    if (current === undefined) return
    const summary = this.sessions.list.getSnapshot().byId[current]
    if (summary?.blank !== true) return
    this.agentPresets.select(current, presetId).catch((reason: unknown) => {
      console.warn(`blank session ${current} kept its own preset:`, reason)
    })
  }

  openSession(target: SessionTarget): void {
    this.replaceMain(target, this.lifetime.signal)
  }

  async openWorkspace(workspaceId: WorkspaceId, beforeOpen?: (sessionId: SessionId) => void): Promise<void> {
    const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal])
    const sessionId = await this.connectWorkspace(workspaceId)
    if (navigation.aborted) return
    this.replaceMain(sessionId, navigation, beforeOpen)
  }

  async forkSession(sessionId: SessionId): Promise<void> {
    const navigation = AbortSignal.any([this.ctx.layout.beginNavigation(), this.lifetime.signal])
    const childId = await this.sessions.fork({ sessionId, increaseTitle: true })
    if (!navigation.aborted) this.replaceMain(childId, navigation)
  }

  startSession(workspaceId?: WorkspaceId): void {
    const workspace = this.workspaces.list.getSnapshot()
    const sessions = this.sessions.list.getSnapshot()
    const current = this.mainReference?.sessionId
    const currentWorkspaceId = current === undefined
      ? undefined
      : workspace.items.find(item => item.sessionIds.includes(current))?.workspaceId
    const recent = workspace.phase === 'ready' && sessions.phase === 'ready'
      ? recentWorkspace(workspace.items, sessions.byId)
      : undefined
    const target = workspaceId ?? currentWorkspaceId ?? recent
    if (target === undefined) {
      this.clearMain()
      return
    }
    void this.openWorkspace(target).catch(
      (reason: unknown) => { console.warn('new session failed:', reason) },
    )
  }

  async archiveSession(sessionId: SessionId): Promise<void> {
    await this.workspaces.archiveSession(sessionId)
    if (this.mainReference?.sessionId === sessionId) this.clearMain()
  }

  async unarchiveSession(sessionId: SessionId): Promise<void> {
    await this.workspaces.unarchiveSession(sessionId)
  }

  async pinSession(sessionId: SessionId): Promise<void> {
    await this.workspaces.pinSession(sessionId)
    const { items } = this.workspaces.list.getSnapshot()
    this.view.pinSessionOrder(
      sessionId,
      pinOrderAccounts(items, sessionId),
      pinOrderSource(items, this.sessions.list.getSnapshot()),
    )
  }

  async unpinSession(sessionId: SessionId): Promise<void> {
    await this.workspaces.unpinSession(sessionId)
  }

  async pickDirectory(): Promise<string | null> {
    const result = await this.directoryPicker.pick()
    if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`)
    return result.value
  }

  async listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing> {
    const result = await this.directoryPicker.list(path, signal)
    if (!result.ok) throw new DirectoryBrowseError(result.error)
    return result.value
  }

  async createDirectory(path: string, name: string): Promise<string> {
    const result = await this.directoryPicker.createDirectory(path, name)
    if (!result.ok) throw new DirectoryBrowseError(result.error)
    return result.value
  }

  private watchNavigation(): () => void {
    let initial: 'waiting' | 'connecting' | 'done' = 'waiting'
    const reconcile = (): void => {
      if (this.lifetime.signal.aborted) return
      if (this.clearArchivedCurrent()) return
      if (initial !== 'waiting') return
      const workspace = this.workspaces.list.getSnapshot()
      const sessions = this.sessions.list.getSnapshot()
      if (workspace.phase !== 'ready' || sessions.phase !== 'ready') return
      if (this.mainReference !== undefined) {
        initial = 'done'
        return
      }
      const saved = this.selection.getSnapshot()
      const savedTarget = saved.subagentAddress
        ?? (saved.sessionId !== undefined && sessions.byId[saved.sessionId] !== undefined
          ? saved.sessionId
          : undefined)
      if (savedTarget !== undefined) {
        initial = 'connecting'
        try {
          if (saved.subagentAddress !== undefined) {
            void this.sessions.refreshProjections(saved.subagentAddress.parentSessionId)
          }
          this.openSession(savedTarget)
          initial = 'done'
        } catch (reason: unknown) {
          initial = 'waiting'
          console.warn('initial Session restoration failed:', reason)
        }
        return
      }
      const target = recentWorkspace(workspace.items, sessions.byId)
      if (target === undefined) {
        initial = 'done'
        return
      }
      initial = 'connecting'
      void this.connectWorkspace(target).then(
        (sessionId) => {
          if (this.mainReference === undefined) this.openSession(sessionId)
        },
      ).then(
        () => { initial = 'done' },
        (reason: unknown) => {
          if (this.lifetime.signal.aborted) return
          initial = 'waiting'
          console.warn('initial workspace selection failed:', reason)
        },
      )
    }
    const disposeWorkspaces = this.workspaces.list.subscribe(reconcile)
    const disposeSessions = this.sessions.list.subscribe(reconcile)
    reconcile()
    return () => {
      this.lifetime.abort()
      disposeSessions()
      disposeWorkspaces()
    }
  }

  /** @returns true when an archived current selection was cleared. */
  private clearArchivedCurrent(): boolean {
    const current = this.mainReference?.sessionId
    if (current === undefined
      || !this.workspaces.list.getSnapshot().archivedSessionIds.includes(current)) return false
    this.clearMain()
    return true
  }

  private clearMain(): void {
    const previous = this.mainReference
    this.mainReference = undefined
    this.selection.set({})
    previous?.release()
    this.ctx.layout.selectPanel(null)
  }

  private replaceMain(
    target: SessionTarget,
    signal: AbortSignal,
    beforeOpen?: (sessionId: SessionId) => void,
  ): void {
    signal.throwIfAborted()
    const reference = this.sessions.retain(target, { source: 'mainView' })
    try {
      signal.throwIfAborted()
      beforeOpen?.(reference.sessionId)
      if (signal.aborted) {
        reference.release()
        return
      }
      const subagentAddress = typeof target === 'string'
        ? this.sessions.subagentAddress(reference.sessionId)
        : target
      this.selection.set({
        sessionId: reference.sessionId,
        ...(subagentAddress === undefined ? {} : { subagentAddress }),
      })
    } catch (error: unknown) {
      reference.release()
      throw error
    }
    const previous = this.mainReference
    this.mainReference = reference
    previous?.release()
    void this.sessions.refreshProjections(reference.sessionId)
    this.ctx.layout.selectPanel(null)
  }

}

/** Stable tie-breaking follows Host Workspace order. */
function recentWorkspace(
  workspaces: readonly WorkspaceView[],
  sessions: SessionListState['byId'],
): WorkspaceId | undefined {
  let selected: WorkspaceId | undefined
  let selectedTime = Number.NEGATIVE_INFINITY
  for (const workspace of workspaces) {
    let latest = Number.NEGATIVE_INFINITY
    for (const sessionId of workspace.sessionIds) {
      const session = sessions[sessionId]
      if (session !== undefined) latest = Math.max(latest, session.updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt)
    if (selected === undefined || latest > selectedTime) {
      selected = workspace.workspaceId
      selectedTime = latest
    }
  }
  return selected
}

export { UiWorkspaceService }
