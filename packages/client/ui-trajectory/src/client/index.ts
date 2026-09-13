/**
 * Browser trajectory plugin: a right-Sidebar tab type whose body is the event
 * ledger, without defining a service.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@qilin/attachment'
import type { SessionBinding } from '@qilin/api-session-controller/client'
import type { ObservableSnapshot } from '@qilin/client-store'
import type { SessionId } from '@qilin/session/types'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@qilin/client-locale/client'
// Type-only: the 'sidebar.right.pane.tab' SlotMap row and the tab-type
// registry's Context merge, both declared by the Sidebar's owning package.
import type {} from '@qilin/client-ui-sidebar-right/client'
import type {} from '@qilin/client-ui-conversation/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import { createTrajectoryDurationStore } from './duration-store.ts'
import { en, NS, zh } from './locales.ts'
import { registerTrajectoryAssistantDefinition } from './trajectory-assistant-definition.ts'
import { registerTrajectoryCompactionDefinitions } from './trajectory-compaction-definition.ts'
import { registerTrajectoryMessageDefinitions } from './trajectory-message-definitions.ts'
import { registerTrajectoryRequestHeaderDefinition } from './trajectory-request-header-definition.ts'
import {
  EMPTY_TRAJECTORY_SNAPSHOT, registerTrajectoryConversationView,
} from './trajectory-snapshot-builder.ts'
import type { TrajectorySnapshot } from './trajectory-contract.ts'
import { registerTrajectoryToolDefinition } from './trajectory-tool-definition.ts'
import { TRAJECTORY_ID, trajectoryTabDefinition } from './trajectory-tab-definition.ts'
import { TrajectoryView, type TrajectoryViewInjected } from './TrajectoryView.tsx'

export type { TrajectoryKey } from './locales.ts'
export type {
  TrajectoryContribution,
  TrajectoryConversationViewNode,
  TrajectoryRequestHeaderState,
  TrajectorySnapshot,
  UseTrajectory,
} from './trajectory-contract.ts'
export type { TrajectoryTabParams } from './trajectory-tab-definition.ts'
export { TRAJECTORY_ID, TRAJECTORY_KIND } from './trajectory-tab-definition.ts'

/** Required services: the Sidebar tab registry, the slot registry, Session paging, and the locale service. */
export const inject = ['slots', 'sessions', 'uiSession', 'uiConversation', 'sidebarRightTabs', 'locale']

/**
 * Client plugin body: register the Sidebar tab type, its body, and its data
 * contributions. Each registration rides an effect wrapper, so plugin unload
 * removes the type and its seats together.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const trajectorySources = new WeakMap<SessionBinding, ObservableSnapshot<TrajectorySnapshot>>()
  const trajectorySource = (binding: SessionBinding): ObservableSnapshot<TrajectorySnapshot> => {
    let source = trajectorySources.get(binding)
    if (source === undefined) {
      const target = ctx.uiConversation.binding(binding).target('trajectory')
      source = {
        getSnapshot: () => target.getSnapshot() ?? EMPTY_TRAJECTORY_SNAPSHOT,
        subscribe: listener => target.subscribe(listener),
      }
      trajectorySources.set(binding, source)
    }
    return source
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-trajectory: dictionaries')
  // Registration-time text (the tab chip and guide labels) reads through the
  // bound translate as a thunk, so it follows the active locale without
  // re-registration.
  const t = ctx.locale.bind(NS)
  const duration = createTrajectoryDurationStore()
  registerTrajectoryMessageDefinitions(ctx)
  registerTrajectoryRequestHeaderDefinition(ctx)
  registerTrajectoryAssistantDefinition(ctx)
  registerTrajectoryToolDefinition(ctx)
  registerTrajectoryCompactionDefinitions(ctx)
  registerTrajectoryConversationView(ctx)
  ctx.effect(
    () => ctx.sidebarRightTabs.register(trajectoryTabDefinition(t)),
    'ui-trajectory: tab type',
  )
  ctx.uiSession.provide({
    hooks: ['trajectory'],
    resolve: binding => ({ hooks: { trajectory: trajectorySource(binding) } }),
  })
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TRAJECTORY_ID,
    locale: NS,
    children: {
      'conversation.trajectory.images': { kind: 'single', scope: 'session' },
    },
    inject: (sessionId: SessionId): TrajectoryViewInjected => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) {
        throw new Error(`ui-trajectory: session "${sessionId}" is unavailable`)
      }
      const trajectory = ctx.uiConversation.binding(sessionId).target('trajectory')
      return {
        hooks: { duration },
        loadOlder: async () => {
          const before = trajectory.getSnapshot()
          await session.loadOlder()
          return trajectory.getSnapshot() !== before
        },
        loadImage: Object.assign(
          (attachment: ImageAttachmentRef) => ctx.uiConversation.imageUrl(sessionId, attachment),
          { peek: (attachment: ImageAttachmentRef) => ctx.uiConversation.peekImageUrl(sessionId, attachment) },
        ),
        setActualDuration: (value) => { duration.set(value) },
      }
    },
  }, TrajectoryView)), 'ui-trajectory: tab body')
}
