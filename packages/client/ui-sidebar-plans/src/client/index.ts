/**
 * Browser half: register `plans` as a right-Sidebar page tab type.
 *
 * The public two-stage path, unmodified: the type into `ctx.sidebarRightTabs`,
 * and the body into the keyed `sidebar.right.pane.tab` seat under the type's
 * `id`.
 *
 * The file split is this package's layering: what the type IS
 * (`definition.tsx`), what it keeps (`store.ts`), what the convention finds
 * and how it is read (`plans.ts`, with its Remote binding in `face.ts`), what
 * it draws (`PlansBody.tsx`), what it says (`locales.ts`), and this module,
 * which only wires them together.
 */
import type { Context as ClientContext } from '@qilin/kylin'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { PLANS_ID, plansDefinition } from './definition.tsx'
import { createReader, plansFace } from './face.ts'
import { PlansBody } from './PlansBody.tsx'
import { en, zh } from './locales.ts'
import { createPlansStore } from './store.ts'

/** This package's copy namespace. */
const NS = 'sidebarPlans'

/**
 * Required browser services: the tab registry, the keyed seat, the Remote
 * carrier and its namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the type, its dictionaries, and its body seat.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(plansDefinition(t)), 'ui-sidebar-plans: plans type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-plans: dictionaries')

  const store = createPlansStore()
  const inject = plansFace(createReader(ctx.remote))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: PLANS_ID, locale: NS, store, inject },
    PlansBody,
  )), 'ui-sidebar-plans: plans tab body')
}
