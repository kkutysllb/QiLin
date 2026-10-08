// @vitest-environment jsdom
/** Terminal type, copy, seats and explicit cleanup follow the plugin lifetime. */
import { createElement } from 'react'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Context } from '@qilin-agent/kylin'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import type { WebTerminalId, WebTerminalInfo } from '@qilin-agent/api-terminal-controller/types'
import { SidebarRightTabRegistry } from '@qilin-agent/client-ui-sidebar-right/src/client/tab-registry.ts'
import type { SidebarRightCloseHandler } from '@qilin-agent/client-ui-sidebar-right/client'
import type { SidebarRightOpenTab } from '@qilin-agent/client-ui-sidebar-right/client'
import { apply, inject } from '../src/client/index.ts'
import { TerminalFontRow, type TerminalFontRowInjected } from '../src/client/TerminalFontRow.tsx'
import { apply as hostApply } from '../src/index.ts'
import { TerminalGuide, type TerminalGuideInjected } from '../src/client/TerminalGuide.tsx'
import { LazyTerminalBody } from '../src/client/LazyTerminalBody.tsx'
import { TerminalTitle } from '../src/client/TerminalTitle.tsx'
import { TerminalRecovery, type TerminalRecoveryInjected } from '../src/client/TerminalRecovery.tsx'
import { TerminalCleanup, type TerminalCleanupInjected } from '../src/client/TerminalCleanup.tsx'
import type { TerminalBodyInjected } from '../src/client/face.ts'
import { en, zh } from '../src/client/locales.ts'
import { DEFAULT_TERMINAL_FONT_SIZE, TERMINAL_SETTINGS_NAMESPACE, TerminalSettingsSchema, type TerminalSettings } from '../src/terminal-settings.ts'

vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }))
const renderedTerminal = vi.hoisted(() => vi.fn(() => null))
vi.mock('../src/client/terminal.tsx', () => ({ TerminalBody: renderedTerminal }))

afterEach(() => { cleanup(); renderedTerminal.mockClear() })

const terminalInfo = (id: string): WebTerminalInfo => ({ id: id as WebTerminalId, title: id, shell: { path: '/bin/sh', name: 'sh', args: ['-i'] }, cwd: '/workspace', cols: 80, rows: 24, state: 'running', exitCode: null })

async function mountPlugin(stored: TerminalSettings | null = { fontFamily: 'User Mono', fontSize: 15 }) {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  ctx.provide('sidebarRightTabs', tabs)
  const entries: {
    name: string
    key?: string
    id?: string
    locale: string
    component: unknown
    inject: (id: SessionId) => unknown
  }[] = []
  const dictionaries = new Map<string, unknown>()
  let closeHandler: SidebarRightCloseHandler | undefined
  const model = { state: {} }
  const terminals = {
    retainTabs: vi.fn(), view: vi.fn(() => model), close: vi.fn(), closeFailures: {}, retryClose: vi.fn(),
    launchShells: vi.fn(async () => ({ shells: [], selectedShell: undefined })), selectShell: vi.fn(),
    recover: vi.fn(async (_sessionId: SessionId): Promise<WebTerminalInfo[]> => []),
  }
  let params: { terminalId: WebTerminalId } | { shellPath: string } | { url: string } | undefined
  const occurrence = vi.fn(() => ({ navigation: { getSnapshot: () => ({ params, address: 'sidebar://terminal/content' }) } }))
  const openTabIn = vi.fn()
  const tabsIn = vi.fn(() => [] as { id: string; kind: string }[])
  const openTabs = createSnapshotStore<readonly SidebarRightOpenTab[]>([])
  ctx.provide('webTerminals', terminals as never)
  const openTab = vi.fn()
  ctx.provide('sidebarRight', {
    tabDomain: { occurrence }, openTabIn, openTab, tabsIn, openTabs,
    registerCloseHandler: (kind: string, handler: SidebarRightCloseHandler) => { expect(kind).toBe('terminal'); closeHandler = handler; return () => { closeHandler = undefined } },
  } as never)
  ctx.provide('slots', {
    inject: (_name: string, register: () => () => void) => register(),
    register: (options: Omit<typeof entries[number], 'component'>, component: unknown) => { const entry = { ...options, component }; entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
  } as never)
  ctx.provide('locale', {
    bind: () => (key: string) => key,
    register: (name: string, values: unknown) => { dictionaries.set(name, values); return () => { dictionaries.delete(name) } },
  } as never)
  const theme = { preference: 'light' as const, fontSize: 14, leading: 0, active: { id: 'light', colorScheme: 'light' as const, tokens: {} }, themes: [], revision: 0 }
  ctx.provide('theme', { getTheme: () => theme } as never)
  // The terminal section as the settings service serves it: one accepted
  // value, observed, with a recording write queue.
  const settings = createSnapshotStore<{ value: TerminalSettings | undefined }>({ value: stored ?? undefined })
  const setField = vi.fn(async () => true)
  const configForms = {
    get: vi.fn(() => ({
      getSnapshot: () => settings.getSnapshot(),
      subscribe: (listener: () => void) => settings.subscribe(listener),
      set: setField,
    })),
  }
  ctx.provide('configForms', configForms as never)
  const fiber = await ctx.plugin({ inject, apply })
  return {
    tabs, entries, dictionaries, terminals, model, occurrence, openTabIn, openTab, tabsIn, openTabs, theme,
    settings, setField,
    emitTheme() { ctx.emit('theme/change', theme) },
    get closeHandler() { return closeHandler },
    setParams(next: typeof params) { params = next },
    async dispose() { await fiber.dispose(); await ctx.fiber.dispose() },
  }
}

it('registers the durable font section when a settings provider exists', () => {
  const registered: [string, unknown][] = []
  const provider = { settings: { register: (name: string, schema: unknown) => { registered.push([name, schema]) } } }
  const ctx = { inject: (names: string[], run: (scoped: typeof provider) => void) => { expect(names).toEqual(['settings']); run(provider) } }
  hostApply(ctx as never)
  expect(registered).toEqual([[TERMINAL_SETTINGS_NAMESPACE, TerminalSettingsSchema]])
})

it('registers terminal views, recovery and cleanup, then releases every contribution on unload', async () => {
  const h = await mountPlugin()
  try {
    const definition = h.tabs.get('terminal')!
    expect(definition.label?.()).toBe('title')
    expect(definition.title('sidebar://terminal')).toBe('title')
    expect(definition.guide?.map(entry => [entry.order, entry.title(), entry.description?.()])).toEqual([[20, 'new', 'description']])
    const Icon = definition.guide?.[0]?.icon
    if (Icon === undefined) throw new Error('Terminal guide icon was not registered')
    expect(renderToStaticMarkup(createElement(Icon, { size: 22 }))).toContain('width="22"')
    expect(renderToStaticMarkup(createElement(Icon))).toContain('width="26"')
    expect(definition.multiple).toBe(true)
    expect(h.dictionaries.get('sidebarTerminal')).toEqual({ en, zh })
    expect(h.entries.map(entry => [entry.name, entry.component, entry.locale])).toEqual([
      ['sidebar.right.tab.guide.entry', TerminalGuide, 'sidebarTerminal'],
      ['sidebar.right.pane.tab', LazyTerminalBody, 'sidebarTerminal'],
      ['sidebar.right.pane.tab.title', TerminalTitle, 'sidebarTerminal'],
      ['conversation.session.header.actions', TerminalRecovery, 'sidebarTerminal'],
      ['shell.overlay', TerminalCleanup, 'sidebarTerminal'],
      ['settings.general.item', TerminalFontRow, 'sidebarTerminal'],
    ])
    const sessionId = 'session' as SessionId
    const row = h.entries.at(-1)!.inject(sessionId) as TerminalFontRowInjected
    expect(row.hooks.font.getSnapshot()).toEqual({ fontFamily: 'User Mono', fontSize: 15 })
    const body = h.entries.find(entry => entry.component === LazyTerminalBody)!.inject(sessionId) as TerminalBodyInjected
    expect(body.hooks.font.getSnapshot().fontFamily.startsWith('User Mono, ')).toBe(true)
    row.setFont({ fontSize: 20 })
    expect(row.hooks.font.getSnapshot().fontSize).toBe(20)
    expect(body.hooks.font.getSnapshot().fontSize).toBe(20)
    expect(h.setField).toHaveBeenCalledWith('fontSize', 20)
    const seen = vi.fn()
    const unsubscribeFont = body.hooks.font.subscribe(seen)
    const unsubscribeRow = row.hooks.font.subscribe(seen)
    h.settings.set({ value: { fontFamily: 'Accepted', fontSize: 22 } })
    expect(row.hooks.font.getSnapshot()).toEqual({ fontFamily: 'Accepted', fontSize: 22 })
    expect(seen).toHaveBeenCalledTimes(2)
    unsubscribeFont()
    unsubscribeRow()
    // A write that cannot be persisted still applies locally.
    h.setField.mockRejectedValueOnce(new Error('offline'))
    row.setFont({ fontSize: 9 })
    await Promise.resolve()
    expect(body.hooks.font.getSnapshot().fontSize).toBe(9)
    const launcher = h.entries[0]!.inject(sessionId) as TerminalGuideInjected
    const signal = new AbortController().signal
    await launcher.loadShells(signal)
    expect(h.terminals.launchShells).toHaveBeenCalledWith(sessionId, signal)
    launcher.selectShell('/bin/bash')
    expect(h.terminals.selectShell).toHaveBeenCalledWith('/bin/bash')
    const face = h.entries[1]!.inject(sessionId) as TerminalBodyInjected
    expect(face.hooks.theme.getSnapshot()).toBe(h.theme)
    const changed = vi.fn()
    const unsubscribe = face.hooks.theme.subscribe(changed)
    h.emitTheme()
    expect(changed).toHaveBeenCalledOnce()
    unsubscribe()
    h.emitTheme()
    expect(changed).toHaveBeenCalledOnce()
    expect(face.view('tab')).toBe(h.model)
    expect(h.terminals.view).toHaveBeenLastCalledWith(sessionId, 'tab', 'sidebar://terminal/content', undefined, undefined)
    const terminalId = 'retained' as WebTerminalId
    h.setParams({ terminalId })
    h.setParams({ shellPath: '/bin/bash' })
    face.view('tab')
    expect(h.terminals.view).toHaveBeenLastCalledWith(sessionId, 'tab', 'sidebar://terminal/content', undefined, '/bin/bash')
    // Parameters another tab type owns are not this package's occurrence.
    h.setParams({ url: 'https://example.test' })
    face.view('tab')
    expect(h.terminals.view).toHaveBeenLastCalledWith(sessionId, 'tab', 'sidebar://terminal/content', undefined, undefined)
    h.setParams({ terminalId })
    expect(face.keyedHooks.terminal('tab')).toBe(h.model.state)
    expect(h.terminals.view).toHaveBeenLastCalledWith(sessionId, 'tab', 'sidebar://terminal/content', terminalId, undefined)
    expect(h.occurrence).toHaveBeenLastCalledWith(sessionId, { id: 'tab' })
    if (h.closeHandler === undefined) throw new Error('Terminal close handler was not registered')
    h.closeHandler(sessionId, { id: 'tab', contentId: 'sidebar://terminal/content' } as Parameters<SidebarRightCloseHandler>[1])
    expect(h.terminals.close).toHaveBeenLastCalledWith(sessionId, 'tab', 'sidebar://terminal/content', terminalId)
    h.setParams(undefined)
    h.closeHandler(sessionId, { id: 'new-tab', contentId: 'sidebar://terminal/new' } as Parameters<SidebarRightCloseHandler>[1])
    expect(h.terminals.close).toHaveBeenLastCalledWith(sessionId, 'new-tab', 'sidebar://terminal/new', undefined)
    const cleanupFace = h.entries[4]!.inject(sessionId) as TerminalCleanupInjected
    expect(cleanupFace.hooks.closeFailures).toBe(h.terminals.closeFailures)
    cleanupFace.retryClose('terminal' as Parameters<TerminalCleanupInjected['retryClose']>[0])
    expect(h.terminals.retryClose).toHaveBeenCalledWith('terminal')
  } finally {
    await h.dispose()
  }
  expect(h.closeHandler).toBeUndefined()
  expect(h.tabs.get('terminal')).toBeUndefined()
  expect(h.entries).toEqual([])
  expect(h.dictionaries.size).toBe(0)
})

it('loads the terminal body implementation when its registered wrapper mounts', async () => {
  render(createElement(LazyTerminalBody, {} as never))
  await waitFor(() => { expect(renderedTerminal).toHaveBeenCalledOnce() })
})

it('restores terminal occurrences before listing unrepresented Host terminals and shares recovery across headers', async () => {
  const h = await mountPlugin()
  h.tabsIn.mockReturnValue([{ id: 'collapsed-terminal', kind: 'terminal' }, { id: 'file', kind: 'text' }])
  const pending = Promise.withResolvers<WebTerminalInfo[]>()
  h.terminals.recover.mockImplementationOnce(() => pending.promise)
  const sessionId = 'session' as SessionId
  const recovery = h.entries[3]!.inject(sessionId) as TerminalRecoveryInjected
  const remounted = h.entries[3]!.inject(sessionId) as TerminalRecoveryInjected
  const completion = recovery.restore()
  expect(h.terminals.view).toHaveBeenCalledWith(sessionId, 'collapsed-terminal', 'sidebar://terminal/content', undefined, undefined)
  expect(h.terminals.view).toHaveBeenCalledOnce()
  try {
    expect(remounted.restore()).toBe(completion)
    expect(h.terminals.recover).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(h.openTabIn).not.toHaveBeenCalled()
    pending.resolve([terminalInfo('build'), terminalInfo('tests')])
    await completion
    expect(h.openTabIn.mock.calls).toEqual([
      [sessionId, 'terminal', { params: { terminalId: 'build' } }],
      [sessionId, 'terminal', { params: { terminalId: 'tests' } }],
    ])
    await remounted.restore()
    expect(h.terminals.recover).toHaveBeenCalledTimes(1)
    expect(h.openTabIn).toHaveBeenCalledTimes(2)
    const otherSession = 'other-session' as SessionId
    await (h.entries[3]!.inject(otherSession) as TerminalRecoveryInjected).restore()
    expect(h.terminals.recover).toHaveBeenLastCalledWith(otherSession)
    expect(h.terminals.recover).toHaveBeenCalledTimes(2)
    expect(h.openTabIn).toHaveBeenCalledTimes(2)
  } finally {
    pending.resolve([])
    await completion
    await h.dispose()
  }
})

it('allows a failed Host lookup to be retried without marking the Session recovered', async () => {
  const h = await mountPlugin()
  const unavailable = new Error('Host unavailable')
  h.terminals.recover.mockRejectedValueOnce(unavailable)
  const sessionId = 'session' as SessionId
  const recovery = h.entries[3]!.inject(sessionId) as TerminalRecoveryInjected
  try {
    await expect(recovery.restore()).rejects.toBe(unavailable)
    expect(h.openTabIn).not.toHaveBeenCalled()
    await recovery.restore()
    await recovery.restore()
    expect(h.terminals.recover).toHaveBeenCalledTimes(2)
  } finally {
    await h.dispose()
  }
})

it('does not open retained terminals when their lookup completes after plugin unload', async () => {
  const h = await mountPlugin()
  const pending = Promise.withResolvers<WebTerminalInfo[]>()
  h.terminals.recover.mockImplementationOnce(() => pending.promise)
  const recovery = h.entries[3]!.inject('session' as SessionId) as TerminalRecoveryInjected
  const completion = recovery.restore()
  try {
    expect(h.terminals.recover).toHaveBeenCalledOnce()
    await h.dispose()
    pending.resolve([terminalInfo('build')])
    await completion
    expect(h.openTabIn).not.toHaveBeenCalled()
  } finally {
    pending.resolve([])
    await completion
    await h.dispose()
  }
})

it('retains terminal metadata from dormant layouts and releases its inventory subscription on unload', async () => {
  const h = await mountPlugin()
  const terminal = { sessionId: 'inactive' as SessionId, tabId: 't', kind: 'terminal', contentId: 'terminal' } as SidebarRightOpenTab
  h.openTabs.set([terminal, { ...terminal, kind: 'documentPreview', contentId: 'file' }])
  await expect.poll(() => h.terminals.retainTabs).toHaveBeenLastCalledWith([terminal])
  await h.dispose()
  expect(h.terminals.retainTabs).toHaveBeenLastCalledWith([])
  const calls = h.terminals.retainTabs.mock.calls.length
  h.openTabs.set([terminal])
  await Promise.resolve()
  expect(h.terminals.retainTabs).toHaveBeenCalledTimes(calls)
})

it('opens a terminal link beside the terminal, and falls back to a browser tab without the browser type', async () => {
  const h = await mountPlugin()
  const face = h.entries[1]!.inject('s-1' as SessionId) as TerminalBodyInjected
  const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
  try {
    // No browser tab type is registered here, so the link leaves the app.
    face.openUrl('https://example.test/a')
    expect(opened).toHaveBeenCalledExactlyOnceWith('https://example.test/a', '_blank', 'noopener,noreferrer')
    expect(h.openTab).not.toHaveBeenCalled()

    h.tabs.register({
      id: 'browser', kind: 'browser', priority: 'builtin', label: () => 'Browser', title: () => 'Browser',
    })
    face.openUrl('https://example.test/b')
    expect(h.openTab).toHaveBeenCalledExactlyOnceWith('browser', { params: { url: 'https://example.test/b' } })
    expect(opened).toHaveBeenCalledOnce()
  } finally {
    opened.mockRestore()
  }
  await h.dispose()
})

it('measures with the built-in font until the Host publishes a stored section', async () => {
  const h = await mountPlugin(null)
  try {
    const sessionId = 'session' as SessionId
    const row = h.entries.at(-1)!.inject(sessionId) as TerminalFontRowInjected
    const body = h.entries.find(entry => entry.component === LazyTerminalBody)!.inject(sessionId) as TerminalBodyInjected
    expect(row.hooks.font.getSnapshot()).toEqual({ fontFamily: '', fontSize: DEFAULT_TERMINAL_FONT_SIZE })
    expect(body.hooks.font.getSnapshot().fontSize).toBe(DEFAULT_TERMINAL_FONT_SIZE)
    // A later publish still carries nothing: the fallback stands.
    const seen = vi.fn()
    const unsubscribe = body.hooks.font.subscribe(seen)
    h.settings.set({ value: undefined })
    expect(seen).not.toHaveBeenCalled()
    expect(body.hooks.font.getSnapshot().fontSize).toBe(DEFAULT_TERMINAL_FONT_SIZE)
    unsubscribe()
  } finally {
    await h.dispose()
  }
})
