/**
 * Browser half: register `sidechat` as a right-Sidebar tab type.
 *
 * The public two-stage path: the type into `ctx.sidebarRightTabs`, the body
 * into the keyed `sidebar.right.pane.tab` seat, both under the type's `id`.
 *
 * The split is this package's layering: what the type is (`definition.tsx`),
 * what it says (`locales.ts`), the pure view model (`sidechat-model.ts`), the
 * object-layer state source (`sidechat-source.ts`), the actions it performs
 * (`face.ts`), what it draws (`SidechatBody.tsx`), and this module, which
 * wires them.
 */
import type { Context as ClientContext } from '@qilin/kylin'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { SIDECHAT_ID, sidechatDefinition } from './definition.tsx'
import { sidechatFace } from './face.ts'
import type { SidechatRemote } from './face.ts'
import { NS, en, zh } from './locales.ts'
import { createSidechatSource } from './sidechat-source.ts'
import { SidechatBody } from './SidechatBody.tsx'

export type { SidechatInjected, SidechatRemote } from './face.ts'
export type { SidechatState, SidechatPhase } from './sidechat-source.ts'
export type { SidechatTranscriptEntry } from './sidechat-model.ts'
export type { SidechatKey } from './locales.ts'
export type { SidechatBodyProps } from './SidechatBody.tsx'

/**
 * Required browser services: the tab registry, the keyed seat, the Session
 * Remote namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.session']

/**
 * Client plugin body: register the type, its dictionaries, and the body.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidechat: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(sidechatDefinition(t)), 'ui-sidechat: sidechat type')

  // The panel owns its registration-scoped state source: the roster, the open
  // transcript, and the in-flight flags outlive the body's unmounts.
  const source = createSidechatSource()
  const remote: SidechatRemote = ctx.remote.session
  const face = sidechatFace(source, remote)
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: SIDECHAT_ID, locale: NS, inject: () => face },
    SidechatBody,
  )), 'ui-sidechat: sidechat tab body')
}
