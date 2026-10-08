/**
 * Browser half of open-in-app: one Session-header split button opening the
 * session's workspace directory (the summary's `cwd`) in the remembered
 * installed application, plus the document preview header's file opener and
 * its unpreviewable empty-state form. Availability arrives once per page from
 * the host apps route; the last choice persists in the browser through the
 * persisted snapshot store on the controller. The file controls read desktop
 * availability and run their gestures over the Session Remote, whose Host side
 * re-verifies each path before any native command runs.
 */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type { ShortcutCommandId } from '@qilin-agent/client-shortcuts/client'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-ui-layout/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-session/client'
import type {} from '@qilin-agent/client-ui-sidebar-documentpreview/client'
import type {} from '@qilin-agent/api-remotes/client'
import type {} from '@qilin-agent/api-session-controller/remote'
import { OPEN_IN_APP_ICON_PREFIX_ROUTE } from '@qilin-agent/host-open-in-app/shared'
import type {} from '@qilin-agent/client-ui-sidebar-files/client'
import { OpenInAppController } from './controller.ts'
import { OpenInAppAction, type OpenInAppActionInjected } from './OpenInAppAction.tsx'
import { OpenInAppPathController } from './open-path.ts'
import { OpenPathAction, OpenPathEmptyAction, type OpenPathInjected } from './OpenPathAction.tsx'
import { en, NS, zh, type OpenInAppKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header "open workspace in application" copy and document file-open copy. */
    'open-in-app': OpenInAppKey
  }
}

export type { OpenInAppActionInjected, OpenInAppActionProps } from './OpenInAppAction.tsx'
export type { OpenPathActionProps, OpenPathEmptyActionProps, OpenPathInjected } from './OpenPathAction.tsx'
export type { OpenInAppPathAction, OpenInAppPathFailure, OpenInAppPathRemote } from './open-path.ts'

/** Required services: sessions, layout selection, the slot registry, copy, the Remote face, and shortcuts. */
export const inject = ['sessions', 'slots', 'locale', 'layout', 'shortcuts', 'remote', 'remote.session']

/**
 * Client plugin body: register the dictionaries, the header split button, and
 * the document preview's file controls.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new OpenInAppController()
  void controller.load()
  const paths = new OpenInAppPathController(ctx.remote.session)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'open-in-app: dictionaries')
  /** The opening face both Session-header seats receive: the app roster, the remembered choice, and the launch. */
  const openInAppInjected = (): OpenInAppActionInjected => ({
    hooks: {
      openInAppApps: controller.apps,
      openInAppChoice: controller.choice,
    },
    launch: (appId, path) => controller.launch(appId, path),
    choose: (appId) => { controller.choose(appId) },
    iconUrl: appId => `${OPEN_IN_APP_ICON_PREFIX_ROUTE}/${appId}`,
  })
  /** The opening face both document seats receive: one page-lifetime desktop answer, per-file queries on demand. */
  const pathInjected = (): OpenPathInjected => ({
    hooks: { openInAppDesktop: paths.desktop },
    loadDesktop: () => paths.load(),
    applications: (path, signal) => paths.applications(path, signal),
    openPath: (path, action, application) => paths.openPath(path, action, application),
  })
  const t = ctx.locale.bind(NS)
  const target = () => {
    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) return undefined
    const session = Object.values(ctx.sessions.list.getSnapshot().byId)
      .find(row => (row.retainedBy.mainView ?? 0) > 0)
    const appId = controller.currentApp()
    return session?.cwd && appId !== undefined ? { appId, path: session.cwd } : undefined
  }
  ctx.effect(() => ctx.shortcuts.register({
    id: 'workspace.openLocal' as ShortcutCommandId, label: () => t('open.tooltip'), aliases: ['open workspace locally', 'open in app'],
    defaults: {
      'desktop:macos': { code: 'KeyO', modifiers: ['primary', 'alt'] },
      'desktop:windows': { code: 'KeyO', modifiers: ['primary', 'alt'] },
      'desktop:linux': { code: 'KeyO', modifiers: ['primary', 'alt'] },
      'web:macos': { code: 'KeyO', modifiers: ['primary', 'shift'] },
      'web:windows': { code: 'KeyO', modifiers: ['primary', 'shift'] },
    },
    regions: ['page', 'editable'], modals: [],
    resolve: () => {
      if (controller.operation.getSnapshot().phase === 'busy') return { status: 'blocked', reason: t('shortcut.busy') }
      const selected = target()
      if (selected === undefined) return { status: 'blocked', reason: t('shortcut.unavailable') }
      return { status: 'handled', run: () => {
        void controller.launch(selected.appId, selected.path).catch((error: unknown) => {
          console.warn('workspace open rejected:', error)
        })
      } }
    },
  }), 'open-in-app: workspace command')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'open-in-app',
    order: -10,
    locale: NS,
    inject: openInAppInjected,
  }, OpenInAppAction))
  // Workspace directory controls: the file tree's reload-adjacent action list
  // renders the same shared control against the displayed directory.
  ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.files.actions',
    id: 'open-in-app',
    locale: NS,
    inject: openInAppInjected,
  }, OpenInAppAction))
  ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions',
    id: 'open-in-app',
    locale: NS,
    inject: pathInjected,
  }, OpenPathAction))
  ctx.slots.inject('sidebar.right.tab.document.unpreviewable', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.unpreviewable',
    id: 'open-in-app',
    locale: NS,
    inject: pathInjected,
  }, OpenPathEmptyAction))
}
