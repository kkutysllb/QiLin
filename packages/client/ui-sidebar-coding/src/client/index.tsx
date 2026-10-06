/**
 * Client half of the coding workbench (ported from dsh-coding-sidebar): the
 * VSCode-like right Sidebar as the dual workbench's coding content body
 * (plans/2026-10-05-dual-workbench-web-design.md §2.2). The ui-sidebar-right
 * frame owns the column chrome — width, collapse, the expand gesture — and
 * renders this package's body under `rightbar.session.coding` while the
 * workbench coding tag is active; this package registers that body and never
 * mounts DOM of its own at the document level. The interception faces
 * (turn-tail row, open-path doors, document-level links) engage only under
 * the coding tag: the general tag lets the native faces act.
 */
import { createElement } from 'react'
import { useEffect } from 'react'
import type { Context } from '../context-types.ts'
import { allLeaves, createSidebarStore, isAgentTabId, togglePanel } from './state.ts'
import { createBetterSidebarService, matchUrlTarget, sidebarServiceVersion } from './service.ts'
import { revalidateChunksOnReactivate, setChunkModuleSystem } from './chunk-loader.ts'
import { registerBuiltins } from './builtins/index.ts'
import { Sidebar } from './Sidebar.tsx'
import { RenderBoundary } from './RenderBoundary.tsx'
import { registerOpenPathInterception, registerTurnTailInterception } from './intercept.tsx'
import { registerLinkInterception } from './link-intercept.ts'
import { registerImeGuard } from './ime-guard.ts'
import { SETTINGS_SECTION_ID } from './channel-policy.ts'
import { loadPrefs } from './prefs.ts'
import { SideCardSection } from './SideCardSection.tsx'
import { api } from './api.ts'
import { observeUiWorkspaceFace } from './workspace-nav.ts'
import { LOCALE_NS, attachLocale, attachBetterLocale, t, zh, en } from './locales.ts'
import { loadChunk } from './chunk-loader.ts'
import css from './sidebar.module.css'

/** The workbench face this package reads the dual-workbench tag from. */
interface WorkbenchFace {
  readonly state: { readonly getSnapshot: () => { readonly active: 'general' | 'coding' } }
}

/** Services required before the body registers. `workbench` gates every
 *  interception face and is the tag the frame renders this body under; the
 *  rest is the ported carrier contract (see the upstream module comment):
 *  `modules` is the client module system the chunk loader resolves its
 *  externals through, and `remote` + `remote.session` pin the open-path
 *  interception's namespace wrap. Cordis inject is all-required, so a
 *  carrier without these never activates this plugin. */
export const inject = ['slots', 'sessions', 'connection', 'locale', 'modules', 'remote', 'remote.session', 'workbench']

/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions, workbench).
 */
export function apply(ctx: Context): void {
  // The sidebar follows the QiLin i18n system: attach the locale service so
  // the module-level t()/isZh() resolve the Host-backed language preference
  // (and switch live — the Sidebar root subscribes to it), and register the
  // plugin's dictionaries into the shared locale registry. The disposers
  // run on fiber disposal, so re-activation (HMR) re-registers cleanly.
  attachLocale(ctx.locale)
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'ui-sidebar-coding: dictionaries')

  // Session-open seam: capture the host uiWorkspace through the waitable
  // inject — the OFFICIAL cross-plugin service resolution (the upstream
  // record: a subagent navigation died on a bare ctx.get that only reads
  // this fiber's local store). Deliberately NOT wrapped in ctx.effect:
  // inject starts a child plugin fiber, and cordis disposes child fibers
  // with this fiber — an HMR reload re-runs apply and re-captures cleanly.
  ctx.inject(['uiWorkspace'], (scope) => {
    observeUiWorkspaceFace((scope as { uiWorkspace?: unknown }).uiWorkspace)
  })

  console.info(`[ui-sidebar-coding] client ${sidebarServiceVersion()} booted (coding content body)`)

  // Opt-in third-language support through @huanlin/dsh-plugin-better-locale.
  // Optional by contract: an absent store keeps the zh/en chain. See the
  // upstream module comment for the activation-order reasoning.
  ctx.effect(() => {
    let dispose: (() => void) | undefined
    // Guards the async chunk registration below: a sync() re-run (or fiber
    // disposal) that lands while the chunk is still in flight must render
    // that registration moot.
    let generation = 0
    const sync = (): void => {
      generation += 1
      dispose?.()
      dispose = undefined
      const store = ctx.get('betterLocale') as
        | {
          readonly active: string | undefined
          getOverride(dshActive: string, ns: string, key: string): string | undefined
          isOverrideActive(dshActive: string): boolean
          register(ns: string, dicts: Record<string, Record<string, string>>): () => void
          subscribe(listener: () => void): () => void
        }
        | undefined
      attachBetterLocale(store)
      if (store !== undefined) {
        // The 19 override dictionaries ride the lazy `locale` chunk: until
        // it lands, the store has no betterSidebar entries and t() keeps
        // the zh/en chain; the store's own revision bump on register
        // re-renders the chrome once the dicts arrive.
        const myGeneration = generation
        void loadChunk('locale')
          .then((mod) => {
            if (myGeneration !== generation) return
            dispose = store.register(LOCALE_NS, mod.localeDicts as Record<string, Record<string, string>>)
          })
          .catch(() => { /* the dicts stay unregistered; the zh/en chain runs */ })
      }
    }
    // Initial check (picks up the store if better-locale activated first).
    sync()
    // Re-check on every locale revision bump.
    const unsubscribe = ctx.locale.subscribe(sync)
    return () => {
      generation += 1
      unsubscribe()
      dispose?.()
      attachBetterLocale(undefined)
    }
  }, 'ui-sidebar-coding: better-locale lazy integration')

  // One store instance per activation: production code creates it only here,
  // then hands it to the content body and closes over it in the slot
  // registrations (the official createXXXStore() factory rule — no
  // module-level singleton).
  const sidebarStore = createSidebarStore()
  // The sidebar registry service: external plugins register tab types and
  // file previewers through `ctx.betterSidebar.registerTab/registerFileViewer`.
  // The registry stays this package's internal extension point (plan §2.2
  // item 6); published before the body registers so consumers injecting
  // 'betterSidebar' are ready by the time the column renders.
  const service = createBetterSidebarService(sidebarStore)
  ctx.provide('betterSidebar', service)
  // Terminal tab titles use the host's effective shell name (e.g. bash/zsh)
  // instead of "Terminal 1". Tabs created before the response arrives keep
  // the fallback title.
  const fallbackTitle = t('terminal')
  let terminalTitle = fallbackTitle
  void api.shellGet().then(({ name }) => {
    terminalTitle = name
    const snapshot = service.getSnapshot()
    if (snapshot.state === undefined) return
    const tabs = allLeaves(snapshot.state.splits).flatMap(leaf => leaf.tabs)
    for (const tab of tabs) {
      if (tab.type === 'terminal' && !isAgentTabId(tab.id) && tab.title === fallbackTitle) {
        service.updateTab(tab.id, { title: name })
      }
    }
  }).catch(() => { /* keep fallback */ })

  // The dual-workbench tag (D5): every interception face engages only under
  // the coding tag; the general tag lets the native faces act.
  const workbench = ctx.get('workbench') as WorkbenchFace
  const codingActive = (): boolean => workbench.state.getSnapshot().active === 'coding'

  // Register the plugin's own built-in tabs and viewers through the same
  // service (eating our own dogfood). The disposer unregisters them on
  // fiber disposal (HMR-safe).
  ctx.effect(
    () => registerBuiltins(ctx, service, { terminalTitle: () => terminalTitle }),
    'ui-sidebar-coding: register built-in tabs and viewers',
  )

  // Fresh chunk state for this activation: drop per-test fixtures and
  // revalidate loaded chunk scripts against the bundle route's ETags —
  // unchanged chunks keep their resolved exports (no re-inject /
  // re-execute on HMR), changed ones are dropped for a clean re-fetch.
  setChunkModuleSystem(ctx.modules)
  void revalidateChunksOnReactivate()

  // The coding content body (D5): rendered by the ui-sidebar-right frame
  // inside the right column while the coding tag is active. The frame owns
  // width, collapse, and the expand gesture; the body fills the column and
  // forces the ported panel open (the column never shows it collapsed).
  ctx.slots.inject('rightbar.session.coding', () => ctx.slots.register({
    name: 'rightbar.session.coding',
    inject: () => ({ store: sidebarStore, service }),
  }, function CodingBody() {
    // The ported panel's own open flag starts closed (a DSH overlay habit);
    // in-column the body IS the open panel, so pin it open on mount. The
    // frame's collapse hides the whole column, not this flag.
    useEffect(() => {
      sidebarStore.reduce(s => (s.panelOpen ? s : togglePanel(s)))
    }, [])
    return (
      <div className={css.codingBody} data-qilin-in-column>
        <RenderBoundary className={css.boundaryError}>
          {createElement(Sidebar, { ctx, store: sidebarStore })}
        </RenderBoundary>
      </div>
    )
  }))

  ctx.effect(
    () => {
      try {
        return registerTurnTailInterception(ctx, sidebarStore, { codingActive })
      } catch (error) {
        console.error('[ui-sidebar-coding] interception error:', error)
        return () => {}
      }
    },
    'ui-sidebar-coding: turn-tail interception',
  )

  ctx.effect(
    () => {
      try {
        return registerOpenPathInterception(ctx, sidebarStore, { codingActive })
      } catch (error) {
        console.error('[ui-sidebar-coding] interception error:', error)
        return () => {}
      }
    },
    'ui-sidebar-coding: open-path interception',
  )

  ctx.effect(
    () => {
      try {
        // External http(s) links in the chat/GUI open the sidebar's browser
        // tab instead of a new window — under the coding tag only. Gated on
        // the browserInterceptLinks MASTER pref, the URL's protocol flag
        // (browserInterceptHttp / Https — https defaults OFF: most https
        // sites refuse iframe embedding), and the target tab's enable
        // switch; Ctrl/Cmd+click always bypasses. The target is the first
        // registered tab whose `urlTarget` claims the URL (enabled tabs
        // only), else the built-in browser tab.
        const urlTargetOf = (url: URL): string | undefined => {
          const prefs = sidebarStore.getPrefs()
          const enabled = service.getTabs().filter(tab => prefs.tabsEnabled[tab.id] !== false)
          return matchUrlTarget(enabled, url)?.id
        }
        return registerLinkInterception({
          takeoverEnabled: (url) => {
            if (!codingActive()) return false
            const prefs = sidebarStore.getPrefs()
            if (prefs.browserInterceptLinks === false) return false
            const protocolOn = url.protocol === 'https:'
              ? prefs.browserInterceptHttps !== false
              : prefs.browserInterceptHttp !== false
            if (!protocolOn) return false
            // A plugin claim is the target (already enabled-filtered);
            // otherwise the built-in browser must be enabled.
            return urlTargetOf(url) !== undefined || prefs.tabsEnabled['browser'] !== false
          },
          openInSidebar: (url) => {
            let title: string | undefined
            try { title = new URL(url).hostname } catch { /* keep the default title */ }
            const type = urlTargetOf(new URL(url)) ?? 'browser'
            ctx.get('betterSidebar')?.openTab({ type, url, ...(title === undefined ? {} : { title }) })
          },
          selfOrigin: window.location.origin,
        })
      } catch (error) {
        console.error('[ui-sidebar-coding] interception error:', error)
        return () => {}
      }
    },
    'ui-sidebar-coding: link interception',
  )

  // The IME guard: composition keys (candidate arrows, confirm, cancel)
  // belong to the input method, never to page JS. Inlined third-party UI
  // (formerly Univer's office controls) has shipped unguarded keydown
  // handlers that hijack ArrowUp/ArrowDown and break Chinese input; the
  // document-capture guard neutralizes the whole class before React or any
  // native listener sees the event. Registered as early as possible so no
  // other capture-phase listener can win the ordering race. Not
  // workbench-gated: it has no native-face counterpart to yield to.
  ctx.effect(
    () => {
      try {
        return registerImeGuard()
      } catch (error) {
        console.error('[ui-sidebar-coding] ime guard error:', error)
        return () => {}
      }
    },
    'ui-sidebar-coding: IME composition guard',
  )

  // The "Side card" settings section: this package's own row in the Settings
  // shell — its own id at default priority (D11 deleted the stock-cell
  // takeover and the nav-icon marker; the native declarative settings face
  // and this row are the only surfaces). slots.inject waits for the shell's
  // declaration; the section reads/writes the prefs through the plugin's own
  // fenced settings route and renders the declarative enable/disable
  // inventory from the tab/viewer registry.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SETTINGS_SECTION_ID,
    order: 100,
    label: () => t('settingsNav'),
    inject: () => ({ store: sidebarStore, service }),
  }, SideCardSection))

  // Prefs resolve once at activation so the first body mount carries the
  // user's choices; a failure falls back to the schema defaults. (The DSH
  // overlay's live-resync and external-disable machinery is gone with the
  // body mount — the section writes sync the store directly.)
  void Promise.race([
    loadPrefs(api),
    new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 2000) }),
  ]).then((prefs) => {
    if (prefs !== null) sidebarStore.setPrefs(prefs)
  }).catch(() => { /* schema defaults */ })
}
