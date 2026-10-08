/**
 * Browser half: register this package's right-Sidebar tab type.
 *
 * The public two-stage path, unmodified: the type into `ctx.sidebarRightTabs`,
 * its body into the keyed `sidebar.right.pane.tab` seat and its chip title
 * into the keyed `sidebar.right.pane.tab.title` seat, all under the type's
 * own `id`.
 *
 * The file split is this package's layering: what the type IS
 * (`definition.tsx`), what it keeps (`store.ts`), how it talks to the
 * `workspaceGit` Remote namespace (`face.ts`, with the pure status, diff, and
 * failure arithmetic in `git-model.ts`), what it draws (`GitBody.tsx`,
 * `GitTitle.tsx`), what it says (`locales.ts`), and this module, which only
 * wires them together.
 */
import type { Context as ClientContext } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/api-remotes/client'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-session/client'
import type {} from '@qilin-agent/client-ui-sidebar-right/client'
import { GIT_ID, gitDefinition } from './definition.tsx'
import { createGitReader, gitFace } from './face.ts'
import { GitBody } from './GitBody.tsx'
import { GitTitle } from './GitTitle.tsx'
import { en, zh } from './locales.ts'
import { createGitStore } from './store.ts'

/** This package's copy namespace. */
const NS = 'sidebarGit'

/**
 * Required browser services: the tab registry, the keyed seats, the Remote
 * carrier and its namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceGit']

/**
 * Client plugin body: register the type, its dictionaries, and its body and
 * chip title seats under the type's id.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(gitDefinition(t)), 'ui-sidebar-git: git type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-git: dictionaries')

  const store = createGitStore()
  const inject = gitFace(createGitReader(ctx.remote))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: GIT_ID, locale: NS, store, inject },
    GitBody,
  )), 'ui-sidebar-git: git tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: GIT_ID },
    GitTitle,
  )), 'ui-sidebar-git: git tab title')
}
