/**
 * Workspace plugin, browser half. Two registrations: WorkspaceBrowser fills
 * the sidebar shell's `sidebar.workspaces` hole (the whole browsing region),
 * and WorkspacePicker fills the conversation hero's picker hole
 * (`conversation.hero.workspace` — both hero forms). Both read real Host
 * Workspaces through the global useWorkspaces hook, and each declares its
 * own `single` directory-flow child hole for the composed picker package's
 * client half (see the contract module doc). Export discipline:
 * packages/client/AGENTS.md.
 */
import type { Context } from '@qilin/kylin'
import type { RemoteHostFacts } from '@qilin/api-remotes/client'
import type { ISessions } from '@qilin/api-session-controller/client'
import type { IWorkspaces, WorkspaceSnapshot } from '@qilin/api-workspace-controller/client'
import { createSnapshotStore } from '@qilin/client-store'
import type { HostObservable, SnapshotSelectorHook } from '@qilin/client-ui-slots'
// Type-only: the workbench state owner's service merge and vocabulary.
import type {} from '@qilin/client-ui-workbench/client'
import type { Workbench } from '@qilin/client-ui-workbench/client'
// Type-only: pulls the Controller service merges.
import type {} from '@qilin/api-session-controller/client'
import type {} from '@qilin/api-workspace-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@qilin/client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-layout/client'
// Type-only: pulls the Session root standard-hook merge.
import type {} from '@qilin/client-ui-session/client'
import type { WorkbenchSwitchInjected, WorkspaceBrowserInjected, WorkspacePickerInjected } from './contract/slots.ts'
import type { AgentPresetChipInjected, AgentPresetRosterState } from './contract/slots.ts'
import { createWorkspaceShortcutControls, installWorkspaceShortcuts } from './shortcuts.ts'
import { UiWorkspaceService } from './navigation.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { AgentPresetChip } from './AgentPresetChip.tsx'
import { WorkbenchSwitchSeat } from './WorkbenchSwitchSeat.tsx'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { en, zh, type WorkspaceKey } from './locales.ts'

export type { MainSelection, UiWorkspace } from './navigation.ts'
export type {
  AgentPresetChipInjected, AgentPresetChipProps, AgentPresetChoice, AgentPresetRosterState,
  DirectoryFlowOwnerProps, DirectoryFlowSlotName, DirectoryPickingHooks, DirectoryPickingInjected,
  SessionRowScheduleOwnerProps, WorkbenchSwitchInjected, WorkbenchSwitchSeatProps,
  WorkspaceBrowserInjected, WorkspaceBrowserProps, WorkspacePickerInjected, WorkspacePickerProps,
} from './contract/slots.ts'
export type { WorkspaceKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector hook over the pure Workspace Controller snapshot. */
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  }

  interface LocaleNamespaceMap {
    /** The workspace browsing region and pick/create flow copy. */
    workspace: WorkspaceKey
  }
}

declare module '@qilin/api-session-controller/client' {
  interface SessionReferenceSourceMap {
    workspaceOperation: unknown
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workspace'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * the ui-sidebar / ui-conversation applies, whose activation order relative
 * to this one is NOT constrained: qilin.client.inject edges are informational
 * (loading/prefetch metadata, never apply sequencing) and neither owner
 * provides a waitable service. apply therefore depends on each slot
 * declaration through `slots.inject()` instead of assuming order.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker', 'remote.agentPresets',
  'workbench', 'layout', 'shortcuts',
]

/**
 * Register the browser and picker once their slot declarations are on the
 * ledger. Inject factories return plain callbacks; data reads use the
 * framework's global hooks.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  const workbench = ctx.get('workbench') as Workbench
  // One viewing-store instance: the browser declares the handle and the
  // UiWorkspace service writes pin order through the same instance the
  // renderer hands the browser.
  const viewHandle = createWorkspaceViewStore()
  const viewInstance = viewHandle.create()
  const viewStore: typeof viewHandle = { ...viewHandle, create: () => viewInstance }
  const uiWorkspace = new UiWorkspaceService(
    ctx, ctx.remote.directoryPicker, ctx.remote.agentPresets, workbench, workspaces, sessions,
    viewInstance.actions)
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')
  const shortcutControls = createWorkspaceShortcutControls()
  // The switch records the tag first (the rebind reads the new active tag)
  // and then aligns the current Workspace's blank sessions (D3).
  const onWorkbenchSwitch: WorkbenchSwitchInjected['onWorkbenchSwitch'] = (tag) => {
    workbench.setActive(tag)
    uiWorkspace.rebindBlanksAfterTagSwitch()
  }

  const searchSessions: WorkspaceBrowserInjected['searchSessions'] = async (query, signal) => {
    const result = await sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  // Stable per-surface occupancy sources (the renderer's hook cache keys by
  // source identity): true while the surface's directory-flow hole is filled.
  const flowSource = (hole: 'sidebar.workspaces.directoryFlow' | 'conversation.hero.workspace.directoryFlow'): HostObservable<boolean> => ({
    getSnapshot: () => ctx.slots.entries(hole).length > 0,
    subscribe: listener => ctx.slots.subscribe(hole, listener),
  })
  const browserFlowSource = flowSource('sidebar.workspaces.directoryFlow')
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }
  const pickerFlowSource = flowSource('conversation.hero.workspace.directoryFlow')
  const openSession: WorkspaceBrowserInjected['open'] = (sessionId) => {
    uiWorkspace.openSession(sessionId)
  }
  const browserInjected = (): WorkspaceBrowserInjected => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback.
    startSession: (workspaceId) => { uiWorkspace.startSession(workspaceId) },
    open: openSession,
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const result = await sessions.using(
        sessionId,
        { source: 'workspaceOperation' },
        reference => reference.binding.session.rename(title),
      )
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId)
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await uiWorkspace.archiveSession(sessionId) },
    // A pin failure surfaces as a rejected promise: the row's own action
    // reports it, and nothing else on the surface moves.
    pinSession: sessionId => uiWorkspace.pinSession(sessionId),
    unpinSession: sessionId => uiWorkspace.unpinSession(sessionId),
    createWorkspace: input => workspaces.create(input),
    requestSearch: shortcutControls.search,
    requestAddWorkspace: shortcutControls.add,
    closeAddWorkspace: shortcutControls.closeAdd,
    closeRenameRequest: shortcutControls.closeRename,
    setDirectoryBusy: shortcutControls.directoryBusy,
    hooks: {
      directoryFlow: browserFlowSource, hostInfo, workspaceShortcuts: shortcutControls.state,
      shortcuts: ctx.shortcuts.catalog,
    },
  })
  installWorkspaceShortcuts(ctx, uiWorkspace, shortcutControls, (sessionId) => { void uiWorkspace.archiveSession(sessionId) })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource },
  })
  // Each registration declares its directory-flow child in the same call;
  // slot injection follows both the owner and declaration HMR lifetimes.
  // The sidebar-top switch seat shares the switch callback with the browser
  // (which no longer renders its own row): the seat selects the tag, the
  // browser filters through the recorded state.
  ctx.slots.inject('sidebar.workbench', () => ctx.slots.register(
    {
      name: 'sidebar.workbench',
      inject: () => ({ hooks: { workbench: workbench.state }, onWorkbenchSwitch }),
      locale: NS,
    },
    WorkbenchSwitchSeat,
  ))
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: {
        'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
        'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
        'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
      },
      store: viewStore,
      inject: browserInjected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      children: { 'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: pickerInjected,
      locale: NS,
    },
    WorkspacePicker,
  ))

  // The hero run-mode chip (D3's per-tag "remember the creator pick"): the
  // roster is read once per connection and the pick records the active tag's
  // new-task preset, then aligns the on-screen blank session so the staged
  // task already carries the choice. An optional presets service reads as an
  // empty roster, and a failed read keeps the chip hidden until a reset.
  const rosterStore = createSnapshotStore<AgentPresetRosterState>({ status: 'idle', presets: [] })
  let rosterGeneration = 0
  const loadRoster = (): void => {
    const generation = ++rosterGeneration
    void ctx.remote.agentPresets.list().then((result) => {
      if (generation !== rosterGeneration) return
      // An optional service and a mounted-but-empty roster hide the chip the
      // same way; a real failure hides it until the next reset retries.
      if (!result.ok && result.error.code === 'gateway/invocation-unavailable') {
        rosterStore.set({ status: 'ready', presets: [] })
        return
      }
      if (!result.ok) {
        rosterStore.set({ status: 'failed', presets: [] })
        return
      }
      rosterStore.set({
        status: 'ready',
        // A broken preset has no composition to hand a new task; the menu
        // offers only presets the Host can actually compose.
        presets: result.value.presets
          .filter(preset => preset.broken === undefined)
          .map(preset => ({
            id: preset.id,
            ...preset.name === undefined ? {} : { name: preset.name },
            ...preset.description === undefined ? {} : { description: preset.description },
          })),
      })
    }).catch(() => {
      if (generation === rosterGeneration) rosterStore.set({ status: 'failed', presets: [] })
    })
  }
  ctx.effect(() => {
    loadRoster()
    return ctx.on('connection/reset', loadRoster)
  }, 'ui-workspace: preset roster refresh')
  const pickPreset: AgentPresetChipInjected['pick'] = (presetId) => {
    workbench.setPresetFor(workbench.state.getSnapshot().active, presetId)
    uiWorkspace.adoptBlankSessionPreset(presetId)
  }
  ctx.slots.inject('conversation.hero.agentPreset', () => ctx.slots.register(
    {
      name: 'conversation.hero.agentPreset',
      // Below the default so a composition that deliberately re-enables the
      // old ui-agent-preset seat (the e2e lane's subject) keeps the cell;
      // the shipped composition mounts only this chip.
      priority: -1,
      inject: (): AgentPresetChipInjected => ({
        hooks: { workbench: workbench.state, roster: rosterStore },
        tagChoices: tag => workbench.tagChoices(tag),
        pick: pickPreset,
      }),
      locale: NS,
    },
    AgentPresetChip,
  ))
}
