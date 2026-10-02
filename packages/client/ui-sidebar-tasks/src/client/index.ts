/**
 * Browser half: register `tasks` as a right-Sidebar tab type.
 *
 * The public two-stage path, unmodified: the type into `ctx.sidebarRightTabs`,
 * the body into the keyed `sidebar.right.pane.tab` seat, and the strip's status
 * pill into the keyed `sidebar.right.pane.tab.badge` seat, all under the type's
 * `id`.
 *
 * The split is this package's layering: what the type IS (`definition.tsx`),
 * what it says (`locales.ts`), the pure projections of the two snapshots
 * (`rows.ts`, `lineage.ts`), the graph's pure model and layout
 * (`tasks-graph-model.ts`, `tasks-graph-layout.ts`), what it keeps
 * (`tasks-graph-store.ts`), the actions it performs (`face.ts`), what it draws
 * (`TasksBody.tsx`, `TasksGraphView.tsx`, `TasksBadge.tsx`), and this module,
 * which wires them.
 */
import type { Context as ClientContext } from '@qilin/kylin'
// Type-only: pulls the ctx.uiWorkspace service merge.
import type {} from '@qilin/client-ui-workspace/client'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { TASKS_ID, tasksDefinition } from './definition.tsx'
import { tasksFace } from './face.ts'
import type { TasksJobsFace } from './face.ts'
import { TasksBadge } from './TasksBadge.tsx'
import type { TasksBadgeInjected } from './TasksBadge.tsx'
import { NS, en, zh } from './locales.ts'
import { createTasksGraphStore } from './tasks-graph-store.ts'
import { TasksBody } from './TasksBody.tsx'

export type { SidebarTasksKey } from './locales.ts'
export type { InterruptByParent, TasksInjected, TasksSessionActions, TasksSubagentsRemote } from './face.ts'
export type { SubagentDescendantSummary } from './lineage.ts'
export type { SubagentRow } from './rows.ts'
export type { TaskNodeKind, TaskNodeVM, TasksGraphModel } from './tasks-graph-model.ts'
export type { NodeOffsets, TaskLayoutMode } from './tasks-graph-layout.ts'
export type { TasksGraphCamera, TasksGraphState } from './tasks-graph-store.ts'
export type { TasksBadgeProps } from './TasksBadge.tsx'
export type { TasksBodyProps } from './TasksBody.tsx'

/**
 * Required browser services: the tab registry, the keyed seats, the Session
 * service and its subagent Remote, and copy.
 */
export const inject = ['slots', 'locale', 'sessions', 'sidebarRightTabs', 'remote', 'remote.subagents', 'jobs']

/**
 * Client plugin body: register the type, its dictionaries, its body, and the
 * chip's status pill.
 * @param ctx - client root context carrying the registry, the slots, the Session service, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-tasks: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(tasksDefinition(t)), 'ui-sidebar-tasks: tasks type')

  // The Session Controller owns the catalog; revealing a child as the current
  // Session is navigation, so it goes through the workspace service.
  const jobsFace: TasksJobsFace = {
    hooks: { jobs: ctx.jobs.state },
    watchRows: sessionId => ctx.jobs.watchRows(sessionId),
  }
  const face = tasksFace({
    openSubagent: (target) => { ctx.uiWorkspace.openSession(target) },
    refreshProjections: parentSessionId => ctx.sessions.refreshProjections(parentSessionId),
  }, ctx.remote.subagents, jobsFace)
  // The graph's shared view state (form, folds, arrangement, offsets, camera)
  // outlives the body's unmounts, so the body registration declares the store.
  const graphStore = createTasksGraphStore()
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TASKS_ID, locale: NS, store: graphStore, inject: () => face },
    TasksBody,
  )), 'ui-sidebar-tasks: tasks tab body')
  // The badge draws the job count from the jobs roster and owns its
  // subscription, because the strip mounts it whether or not the pane is open.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.badge', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.badge', key: TASKS_ID, inject: (): TasksBadgeInjected => jobsFace },
    TasksBadge,
  )), 'ui-sidebar-tasks: tasks tab badge')
}
