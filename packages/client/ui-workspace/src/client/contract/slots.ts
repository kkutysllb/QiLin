/**
 * ui-workspace contracts. Two registrations share this package:
 *
 * - WorkspaceBrowser fills the sidebar shell's `sidebar.workspaces` hole —
 *   the whole browsing region (section header, search, grouped/flat session
 *   list, workspace dialogs). It registers this package's viewing store and
 *   consumes the shell's two-fact owner share (wide / expandSidebar).
 * - WorkspacePicker fills the conversation empty-state hole (menu + error
 *   dialog shared with the browser).
 *
 * Each registration also declares one **directory-flow hole** (`single`
 * kind): the slot a composed picker package's client half fills with its
 * picking interaction — a renderless native-chooser driver or an in-app
 * browsing dialog. ui-workspace owns the trigger (the "Add workspace…"
 * entry, present only while the hole is occupied) and the adoption
 * semantics (`createWorkspace({ path })`, the retryable error dialog,
 * Choose again); the occupant owns everything between `open` and the picked path,
 * including creating a new directory to hand back. That occupant-owned
 * creation is why adding a workspace has a single route: an unoccupied hole
 * leaves the surface with no add affordance at all.
 * Two holes exist because the two menu surfaces are independent slot entries
 * and a hole has exactly one declaring entry — they carry the same owner
 * contract and the same occupant.
 */
import type { HostObservable, PropsHooks, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@qilin/client-ui-slots'
// Type-only: pull the owner SlotMap merges into programs that resolve the
// runtime shares below.
import type {} from '@qilin/client-ui-sidebar/client'
import type {} from '@qilin/client-ui-conversation/client'
import type { SessionSearchResultItem } from '@qilin/api-session-controller/client'
import type { RemoteHostFacts } from '@qilin/api-remotes/client'
import type { WorkspaceId, WorkspaceView } from '@qilin/api-workspace-controller/client'
import type { SessionId } from '@qilin/session/types'
// Type-only: the workbench tag vocabulary this surface consumes.
import type { WorkbenchState, WorkbenchTag } from '@qilin/client-ui-workbench/client'
import type { createWorkspaceViewStore } from '../stores.ts'
import type { ShortcutCatalogEntry } from '@qilin/client-shortcuts/client'
import type { WorkspaceShortcutState } from '../shortcuts.ts'

/**
 * Owner share of the directory-flow holes: the complete conversation between
 * the trigger surface and the picking interaction. The occupant reads `open`
 * to run/render its interaction and reports exactly one outcome per open.
 */
export interface DirectoryFlowOwnerProps {
  /** True while a picking interaction is requested; flipping back to false withdraws the request. */
  open: boolean
  /** True while the owner adopts a picked path (`createWorkspace` in flight); occupants disable their commit affordances. */
  busy: boolean
  /** The operator picked a directory (absolute host path); the owner adopts it. */
  onPicked: (path: string) => void
  /** The operator dismissed the interaction; the owner just closes the flow. */
  onCancel: () => void
  /** The interaction itself failed (chooser missing, listing denied); the owner shows its error surface. */
  onError: (message: string) => void
}

/**
 * Owner share of the two Session-row schedule seats. Both receive only the
 * row's Session identity: the occupant reads that Session's own scheduled
 * tasks, and reading them activates nothing.
 */
export interface SessionRowScheduleOwnerProps {
  /** Session this row shows; the occupant addresses its own data by this id. */
  readonly sessionId: SessionId
}

declare module '@qilin/client-ui-slots' {
  interface SlotMap {
    /** Directory-flow hole under the conversation empty-state picker (declared by the WorkspacePicker entry). */
    'conversation.hero.workspace.directoryFlow': { kind: 'single'; scope: 'root'; owner: DirectoryFlowOwnerProps }
    /** Directory-flow hole under the sidebar browsing region (declared by the WorkspaceBrowser entry). */
    'sidebar.workspaces.directoryFlow': { kind: 'single'; scope: 'root'; owner: DirectoryFlowOwnerProps }
    /**
     * Leading decoration of one Session row, in the 16px cell before the title
     * that the row's own state dot otherwise occupies. A higher-priority state
     * (a pending interaction, a new message, live activity) replaces the seat
     * with that dot for the same row, so an occupant here never renders beside
     * a status dot and is mounted only by a row whose primary state is idle.
     * An archived row keeps that cell blank — neither its status dot nor this
     * seat renders there, and its live status appears on the hover card only.
     */
    'sidebar.session.row.leading': { kind: 'list'; scope: 'root'; owner: SessionRowScheduleOwnerProps }
    /**
     * Section of the Session row's hover card between its relative time and
     * its trailing status line. Mounted only while that card is open.
     */
    'sidebar.session.row.hover': { kind: 'list'; scope: 'root'; owner: SessionRowScheduleOwnerProps }
  }
}

/** The two directory-flow holes; a flow package's client half registers its one component into both. */
export type DirectoryFlowSlotName =
  | 'conversation.hero.workspace.directoryFlow'
  | 'sidebar.workspaces.directoryFlow'

/**
 * Directory-picking share both trigger surfaces consume. Occupancy rides the
 * inject face's reserved `hooks` compartment: the renderer binds the source
 * into the `useDirectoryFlow` selector hook, so an empty hole hides the
 * "Add workspace…" entry reactively and the surface withdraws an open
 * flow whose occupant unloaded mid-interaction (nobody is left to cancel).
 */
export type DirectoryPickingInjected = {
  hooks: {
    /** True while this surface's directory-flow hole is occupied. */
    directoryFlow: HostObservable<boolean>
  }
}

/** Component-side view of the picking share: the bound occupancy selector hook. */
export type DirectoryPickingHooks = PropsHooks<DirectoryPickingInjected['hooks']>

/**
 * Browser-private injected share (arrives via the register inject factory).
 * Data reads use the global framework hooks; these are the Host actions the
 * browsing region drives.
 */
export type WorkspaceBrowserInjected = {
  hooks: DirectoryPickingInjected['hooks'] & {
    /**
     * Fixed Host facts, reached through a hook rather than injected as values:
     * the renderer memoizes an entry's inject result for the registration's
     * lifetime, so facts read there would freeze at whatever the first render
     * saw. Select the field the surface needs (`info => info.home`).
     */
    hostInfo: HostObservable<RemoteHostFacts>
    /** Keyboard-command opening requests the browser consumes. */
    workspaceShortcuts: HostObservable<WorkspaceShortcutState>
    /** Effective command catalog for row shortcut hints. */
    shortcuts: HostObservable<readonly ShortcutCatalogEntry[]>
  }
  /** Open the browser search and focus its input. */
  requestSearch: () => void
  /** Request the existing directory picker. */
  requestAddWorkspace: () => void
  /** Consume the directory-picker opening request. */
  closeAddWorkspace: () => void
  /** Consume the rename-dialog opening request. */
  closeRenameRequest: () => void
  /** Publish directory interaction occupancy for command availability. */
  setDirectoryBusy: (busy: boolean) => void
  /**
   * Start a New Session in a Workspace: reuse-or-create its blank session and
   * open it; without an explicit workspace, inherit the current Session
   * Workspace, then the recent Workspace, or clear into the New Session view.
   */
  startSession: (workspaceId?: WorkspaceId) => void
  /** Open a real Session. */
  open: (sessionId: SessionId) => void
  /**
   * Search current visible conversation messages. The Host fixes the result
   * bound; `hasMore` means the query needs narrowing.
   */
  searchSessions: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ items: readonly SessionSearchResultItem[]; hasMore: boolean }>
  /** Maximum number of merged rows rendered for one search. */
  searchResultLimit: number
  /** Rename a Session (explicit user title; resolves on host acceptance). */
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  /** Fork a Session at its last completed turn and open the child. */
  forkSession: (sessionId: SessionId) => void
  /** Rename a Host Workspace (rejects on name conflict; resolves on durability). */
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<void>
  /** Delete only a Host Workspace registration; directory and Session logs remain. */
  deleteWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  /**
   * Reorder a Workspace in the durable registry display order.
   * Omitted anchor appends to the end.
   */
  insertWorkspaceBefore: (workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId) => Promise<void>
  /**
   * Archive a Session into the registry-global set: hidden from grouping
   * surfaces, log and accounting slot retained. Archiving the current
   * session clears the selection into the New Session view state.
   */
  archiveSession: (sessionId: SessionId) => Promise<void>
  /**
   * Pin a Session ahead of unpinned ones in its group and the flat list, and
   * front its saved manual position. Rejects on Host failure so the caller
   * can report it.
   */
  pinSession: (sessionId: SessionId) => Promise<void>
  /** Drop one Session's pin; saved positions stay as they are. */
  unpinSession: (sessionId: SessionId) => Promise<void>
  /** Adopt a picked host directory as a real Workspace before targeting a Session. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
}

/**
 * Injected share of the sidebar-top workbench switch: the tag selection and
 * the switch callback (the same record-and-rebind path the browser list
 * filters through).
 */
export type WorkbenchSwitchInjected = {
  hooks: {
    /** The workbench tag selection and per-tag preset memory (the `workbench` service state). */
    workbench: HostObservable<WorkbenchState>
  }
  /** Switch the workbench tag (see {@link WorkspaceBrowserInjected.onWorkbenchSwitch}). */
  onWorkbenchSwitch: (tag: WorkbenchTag) => void
}

/** One preset row of the run-mode chip's menu: the fields the roster wire carries and the chip shows. */
export interface AgentPresetChoice {
  /** The preset id new tasks are created with. */
  readonly id: string
  /** Display name from the preset's own manifest; absent falls back to the id. */
  readonly name?: string
  /** One-line description shown under the menu name. */
  readonly description?: string
}

/** The roster snapshot the chip's menu renders; an empty list hides the chip. */
export interface AgentPresetRosterState {
  /** Read outcome: idle before the first read, failed keeps the chip hidden. */
  readonly status: 'idle' | 'ready' | 'failed'
  /** The deployment's presets (an optional service yields the empty list). */
  readonly presets: readonly AgentPresetChoice[]
}

/**
 * Injected share of the hero run-mode chip: the workbench state (active tag
 * and each tag's remembered new-task preset), the live roster, and the pick
 * action that records the tag's choice and rebinds the on-screen blank
 * session.
 */
export type AgentPresetChipInjected = {
  hooks: {
    /** The workbench tag selection and per-tag preset memory (the `workbench` service state). */
    workbench: HostObservable<WorkbenchState>
    /** The preset roster snapshot; `failed` and empty rosters hide the chip. */
    roster: HostObservable<AgentPresetRosterState>
  }
  /**
   * The shipped preset ids one tag's menu offers, in menu order — the
   * workbench owner's vocabulary, reached as a service callback so this
   * package imports no cross-plugin value (the purity gate forbids one).
   */
  tagChoices: (tag: WorkbenchTag) => readonly string[]
  /** Record one tag's new-task preset choice and align the current blank session. */
  pick: (presetId: string) => void
}

/** Full run-mode chip props: hero owner share + injected state + the locale seat. */
export type AgentPresetChipProps =
  PropsRuntime<'conversation.hero.agentPreset'>
  & PropsHooks<AgentPresetChipInjected['hooks']>
  & Omit<AgentPresetChipInjected, 'hooks'>
  & PropsLocale<'workspace'>

/** Full switch-seat props: shell owner share + injected selection + the locale seat. */
export type WorkbenchSwitchSeatProps =
  PropsRuntime<'sidebar.workbench'>
  & PropsHooks<WorkbenchSwitchInjected['hooks']>
  & Omit<WorkbenchSwitchInjected, 'hooks'>
  & PropsLocale<'workspace'>

/** Full browser props: shell owner share + viewing store + injected actions + the locale seat. */
export type WorkspaceBrowserProps =
  PropsRuntime<'sidebar.workspaces'>
  & PropsRenderSlots<'sidebar.workspaces.directoryFlow' | 'sidebar.session.row.leading' | 'sidebar.session.row.hover'>
  & PropsStore<ReturnType<typeof createWorkspaceViewStore>>
  & Omit<WorkspaceBrowserInjected, 'hooks'>
  & PropsHooks<WorkspaceBrowserInjected['hooks']>
  & PropsLocale<'workspace'>

/**
 * Picker-private injected share. Pick semantics remain in the owner's onPick
 * callback; this callback creates only the real Host Workspace. A type alias
 * supplies the implicit index signature required by the registry.
 */
export type WorkspacePickerInjected = DirectoryPickingInjected & {
  /** Adopt a picked host directory as a real Workspace before targeting a Session. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
}

/**
 * Full picker props: the owner share plus the creation callback and the
 * locale seat. The two picker holes (blank-session hero / New-Session view)
 * share one owner currency, so one composed type serves both registrations.
 */
export type WorkspacePickerProps =
  PropsRuntime<'conversation.hero.workspace'>
  & PropsRenderSlots<'conversation.hero.workspace.directoryFlow'>
  & Omit<WorkspacePickerInjected, 'hooks'>
  & DirectoryPickingHooks
  & PropsLocale<'workspace'>
