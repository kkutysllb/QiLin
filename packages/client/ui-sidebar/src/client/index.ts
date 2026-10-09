/** Registers the sidebar shell and global panel navigation. */
import type { Context as ClientContext } from '@qilin-agent/kylin'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { isDarwinDesktop, watchDarwinDesktop } from '@qilin-agent/client-ui-primitives'
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
    const desktop = isDarwinDesktop()
    const assigned: Record<string, string> = {}
    for (const entry of ctx.slots.entriesOfSlot('sidebar.section.assignments')) {
      const face = entry.inject?.(undefined as never) as Partial<SidebarSectionAssignmentsOwnerProps> | undefined
      if (face?.assignments !== undefined) Object.assign(assigned, face.assignments)
    }
    const next = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as MainPanelId
      // OpenKylin 桌面：未归区且非引擎自带面板的行——即第三方插件——一律
      // 归「扩展」尾部区（KStock placement seat 的 trailingSection 语义；
      // 3.1.1 无该 seat，内联在此）。纯 web 保持原生行为：无区 = 无表头平铺。
      const trailing = desktop
        && assigned[id] === undefined
        && resolveSlotLabel(options.section) === undefined
        ? '扩展'
        : undefined
      const section = assigned[id] ?? resolveSlotLabel(options.section) ?? trailing
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id, section }
    }).sort((a, b) => a.order - b.order)
    const previous = panels.getSnapshot()
    if (previous.length === next.length && previous.every((panel, index) => {
      const candidate = next[index] as SidebarPanelMetadata
      return panel.id === candidate.id && panel.order === candidate.order
        && panel.label === candidate.label && panel.section === candidate.section
    })) return
    panels.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sidebar: panel entries')
  ctx.effect(() => ctx.slots.subscribe('sidebar.section.assignments', syncPanels), 'ui-sidebar: section assignments')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sidebar: panel labels')
  ctx.effect(() => watchDarwinDesktop(syncPanels), 'ui-sidebar: darwin mark')
  // The panel list is a presentation projection: an admission install (this
  // effect may run before the gate's own) or admitted-set move re-derives it.
  ctx.effect(() => ctx.slots.admission().subscribe(syncPanels), 'ui-sidebar: admission revisions')

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
      'sidebar.workbench': { kind: 'single', scope: 'root' },
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
  // OpenKylin 桌面（darwin 壳）：侧栏面板分区。引擎原生分组渲染——连续
  // 同段行共享一枚表头（SidebarRoot 对 section 变化插 .panelSection）；
  // 部署侧集中声明引擎面板行的归属（KStock client-shell 同款机制），
  // 第三方行不带 section，渲染为无表头的平铺尾部。
  // 座位无条件注册，face 按当下标记返回数据：apply 期不抢先读标记，标记晚到
  // 时 watchDarwinDesktop 重算投影即可生效；纯 web 永远拿不到这份数据。
  ctx.slots.inject('sidebar.section.assignments', () => ctx.slots.register({
    name: 'sidebar.section.assignments',
    id: 'ok-desktop-sections',
    inject: () => (isDarwinDesktop() ? { assignments: { plugins: '通用', schedules: '通用' } } : {}),
  }, () => null))
  syncPanels()
}
