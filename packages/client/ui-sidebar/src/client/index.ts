/** Registers the sidebar shell and global panel navigation. */
import type { Context as ClientContext } from '@qilin-agent/kylin'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { watchDarwinDesktop } from '@qilin-agent/client-ui-primitives'
import type { MainPanelId } from '@qilin-agent/client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@qilin-agent/client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@qilin-agent/client-ui-renderer/client'
// Type-only: pulls the Session root standard-props merge.
import type {} from '@qilin-agent/client-ui-session/client'
// Type-only: pulls the conversation header slot declarations.
import type {} from '@qilin-agent/client-ui-conversation/client'
import type { SidebarPanelMetadata, SidebarRootInjected, SidebarSectionAssignmentsOwnerProps } from './contract/slots.ts'
import { HeaderLeadingControls } from './HeaderLeadingControls.tsx'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, zh, type SidebarKey } from './locales.ts'

export type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps, SidebarFooterActionOwnerProps,
  SidebarPanelIconOwnerProps, SidebarPanelMetadata,
  SidebarRootComponentProps, SidebarRootInjected, SidebarSectionAssignmentsOwnerProps,
  SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from './contract/slots.ts'
export type { SidebarKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar controls and global panel copy. */
    sidebar: SidebarKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'sidebar'

interface WorkspaceNavigation {
  startSession(workspaceId?: Parameters<SidebarRootInjected['startSession']>[0]): void
}

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as unknown as WorkspaceNavigation
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar: dictionaries')
  const t = ctx.locale.bind(NS)
  const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([])
  const syncPanels = (): void => {
    // Deployment-side section assignment: each `sidebar.section.assignments`
    // occupant contributes a row-id → section map through its inject face,
    // applied before grouping, so rows the deployment does not register
    // itself (engine panels) join sections of the deployment's naming. An
    // assignment wins over the row's own `section`.
    // 标记可能晚于 apply 落地（preload 兜底挂 DOMContentLoaded）；内置座位的
    // face 自己按标记返回，watchDarwinDesktop 在翻转时重算本投影。部署侧
    // 自带的座位不受门控——是否声明本来就是部署的选择。
    const assigned: Record<string, string> = {}
    for (const entry of ctx.slots.entriesOfSlot('sidebar.section.assignments')) {
      const face = entry.inject?.(undefined as never) as Partial<SidebarSectionAssignmentsOwnerProps> | undefined
      if (face?.assignments !== undefined) Object.assign(assigned, face.assignments)
    }
    const sorted = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as MainPanelId
      // Any row without an assigned or declared section is plugin-contributed, so it
      // joins the trailing Extensions section on every surface; the engine's own rows
      // declare the General section where they register.
      const trailing = assigned[id] === undefined && resolveSlotLabel(options.section) === undefined
        ? t('section.extensions')
        : undefined
      const section = assigned[id] ?? resolveSlotLabel(options.section) ?? trailing
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id, section }
    }).sort((a, b) => a.order - b.order)
    // KStock patch (K27): 扩展面板必须殿后。行按 order 排序时，第三方扩展行的 order
    // 可能小于产品业务行，导致「扩展」分组插到「通用/业务」中间；这里按分区做稳定
    // 分组：通用（引擎自带）在前、业务组按 order 居中、扩展（无声明 section 的插件行）最后。
    const generalLabel = t('section.general')
    const extensionsLabel = t('section.extensions')
    const orderedPanels = [
      ...sorted.filter(panel => panel.section === generalLabel),
      ...sorted.filter(panel => panel.section !== generalLabel && panel.section !== extensionsLabel),
      ...sorted.filter(panel => panel.section === extensionsLabel),
    ]
    const nextOrdered = orderedPanels
    const previous = panels.getSnapshot()
    if (previous.length === nextOrdered.length && previous.every((panel, index) => {
      const candidate = nextOrdered[index] as SidebarPanelMetadata
      return panel.id === candidate.id && panel.order === candidate.order
        && panel.label === candidate.label && panel.section === candidate.section
    })) return
    panels.set(nextOrdered)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sidebar: panel entries')
  ctx.effect(() => ctx.slots.subscribe('sidebar.section.assignments', syncPanels), 'ui-sidebar: section assignments')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sidebar: panel labels')
  ctx.effect(() => watchDarwinDesktop(syncPanels), 'ui-sidebar: darwin mark')

  const injectProps = (): SidebarRootInjected => ({
    // The shell's New Session button rides the Workspace UI's shared action
    // (current Session Workspace, then recent Workspace).
    startSession: (workspaceId) => { workspaceNavigation.startSession(workspaceId) },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    selectPanel: (id) => { ctx.layout.selectPanel(id) },
    hooks: { panels, shortcuts: ctx.shortcuts.catalog },
  })
  ctx.slots.inject('sidebar', () => ctx.slots.register({
    name: 'sidebar',
    locale: NS,
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.section.assignments': { kind: 'list', scope: 'root' },
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.account': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: injectProps,
  }, SidebarRoot))
  // macOS desktop hides the collapsed sidebar entirely, so the open/New
  // Session controls move into the conversation header's root-scoped leading
  // seat (present even with no Session selected); the occupant reuses the
  // shell's injected actions and shows itself purely through CSS against the
  // AppFrame's data-sidebar-collapsed attribute.
  ctx.slots.inject('conversation.header.leading', () => ctx.slots.register({
    name: 'conversation.header.leading',
    locale: NS,
    inject: injectProps,
  }, HeaderLeadingControls))
  // 侧栏面板分区：引擎自带的分组表头（连续同段行共享一枚，SidebarRoot 对
  // section 变化插 .panelSection），部署侧集中声明引擎面板行的归属。
  // 未声明的行一律归「扩展」尾部区：它们就是插件贡献的行。
  ctx.slots.inject('sidebar.section.assignments', () => ctx.slots.register({
    name: 'sidebar.section.assignments',
    id: 'ok-desktop-sections',
    inject: () => ({ assignments: { plugins: t('section.general'), schedules: t('section.general') } }),
  }, () => null))
  syncPanels()
}
