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
 * (`rows.ts`, `lineage.ts`), the actions it performs (`face.ts`), what it draws
 * (`TasksBody.tsx`, `TasksBadge.tsx`), and this module, which wires them.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { TASKS_ID, tasksDefinition } from './definition.tsx'
import { tasksFace } from './face.ts'
import { NS, en, zh } from './locales.ts'
import { TasksBadge } from './TasksBadge.tsx'
import { TasksBody } from './TasksBody.tsx'

export type { SidebarTasksKey } from './locales.ts'
export type { InterruptByParent, TasksInjected, TasksSessionActions, TasksSubagentsRemote } from './face.ts'
export type { SubagentDescendantSummary } from './lineage.ts'
export type { SubagentRow } from './rows.ts'
export type { TasksBadgeProps } from './TasksBadge.tsx'
export type { TasksBodyProps } from './TasksBody.tsx'

/**
 * Required browser services: the tab registry, the keyed seats, the Session
 * service and its subagent Remote, and copy.
 */
export const inject = ['slots', 'locale', 'sessions', 'sidebarRightTabs', 'remote', 'remote.subagents']

/**
 * Client plugin body: register the type, its dictionaries, its body, and the
 * chip's status pill.
 * @param ctx - client root context carrying the registry, the slots, the Session service, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-tasks: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(tasksDefinition(t)), 'ui-sidebar-tasks: tasks type')

  const face = tasksFace(ctx.sessions, ctx.remote.subagents)
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TASKS_ID, locale: NS, inject: () => face },
    TasksBody,
  )), 'ui-sidebar-tasks: tasks tab body')
  // The badge draws a count the two snapshots already hold, so it declares no
  // inject face: the standard `useSessions` hook is the whole data path.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.badge', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.badge', key: TASKS_ID },
    TasksBadge,
  )), 'ui-sidebar-tasks: tasks tab badge')
}
