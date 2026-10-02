/** Register interactive terminal tabs and explicit process cleanup with the sidebar. */
import type { Context } from '@qilin/kylin'
import type { WebTerminalId } from '@qilin/api-terminal-controller/types'
import type { SidebarRightTabParamsMap, TabId } from '@qilin/client-ui-sidebar-right/client'
import type { SessionId } from '@qilin/session/types'
import type {} from '@qilin/api-terminal-controller/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import type {} from '@qilin/client-ui-sidebar-browser/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-theme/client'
import type {} from '@qilin/client-ui-settings/client'
import { createSnapshotStore } from '@qilin/client-store'
import { TerminalGuideIcon } from './TerminalIcon.tsx'
import { TerminalGuide, type TerminalGuideInjected } from './TerminalGuide.tsx'
import { LazyTerminalBody } from './LazyTerminalBody.tsx'
import { TerminalTitle } from './TerminalTitle.tsx'
import { TerminalFontRow, type TerminalFontRowInjected } from './TerminalFontRow.tsx'
import { TerminalRecovery, type TerminalRecoveryInjected } from './TerminalRecovery.tsx'
import { TerminalCleanup, type TerminalCleanupInjected } from './TerminalCleanup.tsx'
import type { TerminalBodyInjected, TerminalInjected } from './face.ts'
import { en, zh } from './locales.ts'
import { resolveTerminalFont } from './terminal-font.ts'
import {
  DEFAULT_TERMINAL_FONT_SIZE, TERMINAL_SETTINGS_NAMESPACE, type TerminalSettings,
} from '../terminal-settings.ts'

/** Services needed by the terminal's sidebar seats and its settings row. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'webTerminals', 'theme', 'configForms']

/**
 * Register the terminal type, observable views and background process cleanup.
 * @param ctx - Client root Context with sidebar and terminal services.
 */
export function apply(ctx: Context): void {
  let disposed = false
  const recovered = new Map<SessionId, Promise<void>>()
  ctx.effect(() => () => { disposed = true; recovered.clear() }, 'ui-sidebar-terminal.lifetime')
  ctx.effect(() => {
    const sync = (): void => { ctx.webTerminals.retainTabs(ctx.sidebarRight.openTabs.getSnapshot().filter(tab => tab.kind === 'terminal')) }
    const unsubscribe = ctx.sidebarRight.openTabs.subscribe(sync)
    sync()
    return () => { unsubscribe(); ctx.webTerminals.retainTabs([]) }
  }, 'ui-sidebar-terminal.window-holds')
  // Navigation parameters are typed by every registered tab type; this package
  // reads only its own occurrence's terminal spelling, so it narrows rather
  // than claiming the whole union.
  const target = (sessionId: SessionId, key: string): SidebarRightTabParamsMap['terminal'] | undefined => {
    const params = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key as TabId }).navigation.getSnapshot().params
    if (params === undefined) return undefined
    return 'terminalId' in params || 'shellPath' in params ? params : undefined
  }
  const terminalId = (sessionId: SessionId, key: string): WebTerminalId | undefined => {
    const params = target(sessionId, key)
    return params !== undefined && 'terminalId' in params ? params.terminalId : undefined
  }
  const view = (sessionId: SessionId, key: string) => {
    const params = target(sessionId, key)
    const contentId = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key as TabId }).navigation.getSnapshot().address
    return ctx.webTerminals.view(sessionId, key, contentId, terminalId(sessionId, key),
      params !== undefined && 'shellPath' in params ? params.shellPath : undefined)
  }
  const namespace = 'sidebarTerminal'
  const id = '@qilin/client-ui-sidebar-terminal'
  const t = ctx.locale.bind(namespace)
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-sidebar-terminal.copy')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id, kind: 'terminal', multiple: true, priority: 'builtin', label: () => t('title'), title: () => t('title'),
    guide: [{ id: 'new', order: 20, title: () => t('new'), description: () => t('description'), icon: TerminalGuideIcon }],
  }), 'ui-sidebar-terminal.type')
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler('terminal', (sessionId, tab) => {
    ctx.webTerminals.close(sessionId, tab.id, tab.contentId, terminalId(sessionId, tab.id))
  }), 'ui-sidebar-terminal.close')
  const inject = (sessionId: SessionId): TerminalInjected => ({
    view: key => view(sessionId, key),
    keyedHooks: { terminal: key => view(sessionId, key).state },
  })
  const theme: TerminalBodyInjected['hooks']['theme'] = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: listener => ctx.on('theme/change', listener),
  }
  // A URL printed in a terminal opens in the Sidebar's own browser, beside the
  // terminal that printed it; without that tab type — a composition that leaves
  // the browser out — the link falls back to a new browser tab, because a
  // terminal link that does nothing is worse than one that leaves the app.
  const openUrl = (url: string): void => {
    if (ctx.sidebarRightTabs.get('browser') !== undefined) ctx.sidebarRight.openTab('browser', { params: { url } })
    else window.open(url, '_blank', 'noopener,noreferrer')
  }
  // The font preference is one reactive fact with two readers: the screen wants
  // the resolved stack and size, the settings row wants the values the user
  // typed. One store carries both, so a resolved snapshot keeps its identity
  // between changes (a source that minted a fresh stack per read would
  // re-render its subscribers forever).
  const settings = ctx.configForms.get<TerminalSettings>(TERMINAL_SETTINGS_NAMESPACE)
  const initial = settings.getSnapshot().value
    ?? { fontFamily: '', fontSize: DEFAULT_TERMINAL_FONT_SIZE }
  const fonts = createSnapshotStore({
    settings: initial,
    resolved: resolveTerminalFont(initial.fontFamily, initial.fontSize),
  })
  const adopt = (accepted: TerminalSettings): void => {
    fonts.set({ settings: accepted, resolved: resolveTerminalFont(accepted.fontFamily, accepted.fontSize) })
  }
  ctx.effect(() => settings.subscribe(() => {
    const accepted = settings.getSnapshot().value
    if (accepted !== undefined) adopt(accepted)
  }), 'ui-sidebar-terminal.font')
  const font: TerminalBodyInjected['hooks']['font'] = {
    getSnapshot: () => fonts.getSnapshot().resolved,
    subscribe: listener => fonts.subscribe(listener),
  }
  const fontSettings: TerminalFontRowInjected['hooks']['font'] = {
    getSnapshot: () => fonts.getSnapshot().settings,
    subscribe: listener => fonts.subscribe(listener),
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
    name: 'sidebar.right.tab.guide.entry', key: id, locale: namespace,
    inject: (sessionId): TerminalGuideInjected => ({
      loadShells: signal => ctx.webTerminals.launchShells(sessionId, signal),
      selectShell: (path) => { ctx.webTerminals.selectShell(path) },
    }),
  }, TerminalGuide)), 'ui-sidebar-terminal.guide')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: id, locale: namespace,
      inject: (sessionId): TerminalBodyInjected => ({ ...inject(sessionId), hooks: { theme, font }, openUrl }),
    }, LazyTerminalBody,
  )), 'ui-sidebar-terminal.body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: id, locale: namespace, inject }, TerminalTitle,
  )), 'ui-sidebar-terminal.title')
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id, locale: namespace,
    inject: (sessionId): TerminalRecoveryInjected => ({
      restore: () => {
        let pending = recovered.get(sessionId)
        if (pending === undefined) {
          for (const tab of ctx.sidebarRight.tabsIn(sessionId)) {
            if (tab.kind === 'terminal') view(sessionId, tab.id)
          }
          pending = ctx.webTerminals.recover(sessionId).then((terminals) => {
            if (disposed) return
            for (const info of terminals) ctx.sidebarRight.openTabIn(sessionId, 'terminal', {
              params: { terminalId: info.id },
            })
          }).catch((error: unknown) => { recovered.delete(sessionId); throw error })
          recovered.set(sessionId, pending)
        }
        return pending
      },
    }),
  }, TerminalRecovery)), 'ui-sidebar-terminal.recovery')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id, locale: namespace,
    inject: (): TerminalCleanupInjected => ({
      hooks: { closeFailures: ctx.webTerminals.closeFailures },
      retryClose: (terminalId) => { ctx.webTerminals.retryClose(terminalId) },
    }),
  }, TerminalCleanup)), 'ui-sidebar-terminal.cleanup')
  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'terminal-font', order: 18, locale: namespace,
    inject: (): TerminalFontRowInjected => ({
      hooks: { font: fontSettings },
      setFont: (patch) => {
        adopt({ ...fonts.getSnapshot().settings, ...patch })
        for (const [field, value] of Object.entries(patch)) {
          void settings.set(field, value).catch((_error: unknown) => {
            // The local choice stays usable when persistence is unavailable.
          })
        }
      },
    }),
  }, TerminalFontRow)), 'ui-sidebar-terminal.font-row')
}
