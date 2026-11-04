// @vitest-environment jsdom
/** Branch coverage for the native path, Session directory, and URL menu contributions. */
import { Context } from '@qilin-agent/kylin'
import { MenuRegistry } from '@qilin-agent/client-ui-context-menu/src/client/registry.ts'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SessionId } from '@qilin-agent/session/types'
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CONTEXT_MENU_ICONS, ContextMenuApplicationIcon, registerContextMenus } from '../src/client/context-menus.tsx'
import { OpenInAppController } from '../src/client/controller.ts'
import { OpenInAppPathController } from '../src/client/open-path.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (navigator as { clipboard?: unknown }).clipboard
})

/** Replace only the clipboard member so locale detection keeps the jsdom languages. */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

const t = ((key: string, values?: Record<string, string>) => {
  const template = (en as Record<string, string>)[key] ?? key
  return values === undefined ? template : template.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? '')
}) as PropsLocale<'open-in-app'>['t']

interface MenuAction {
  readonly id: string
  readonly label: string
  readonly icon: { readonly key: string; readonly src?: string }
  readonly disabled?: boolean
  readonly failureLabel?: string
  readonly separatorBefore?: boolean
  readonly run?: () => Promise<void> | void
}

type Actions = readonly MenuAction[]

interface Contribution {
  readonly id: string
  readonly target: string
  readonly observe?: () => readonly { subscribe: (listener: () => void) => () => void }[]
  readonly resolve: (target: Record<string, unknown>, signal: AbortSignal) => Actions | Promise<Actions>
}

function remoteWith(over: {
  canOpen?: () => Promise<unknown>
  applications?: () => Promise<unknown>
  open?: (request: unknown) => Promise<unknown>
} = {}) {
  return {
    canOpenWorkspacePath: vi.fn(over.canOpen ?? (async () => ({ ok: true as const, value: true }))),
    workspacePathApplications: vi.fn(over.applications
      ?? (async () => ({ ok: true as const, value: [{ id: 'vscode', name: 'VS Code', default: true, icon: 'data:image/png,AA' }] }))),
    openWorkspacePath: vi.fn(over.open ?? (async () => ({ ok: true as const, value: { opened: true } }))),
  }
}

async function bench(over: {
  rows?: Record<string, { cwd?: string }>
  apps?: readonly string[] | null
  remote?: ReturnType<typeof remoteWith>
  launch?: () => Promise<Response>
} = {}) {
  const ctx = new Context()
  const contributions: Contribution[] = []
  const notify = vi.fn()
  const failed = vi.fn()
  const registry = new MenuRegistry(failed)
  ctx.provide('contextMenus', {
    register: (contribution: Contribution) => {
      contributions.push(contribution)
      const remove = registry.register(contribution as never)
      return () => { remove(); contributions.splice(contributions.indexOf(contribution), 1) }
    },
    notify,
  } as never)
  const rows = over.rows ?? { s1: { cwd: '/ws/proj' } }
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId: rows }), subscribe: () => () => {} },
  } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const remote = over.remote ?? remoteWith()
  const paths = new OpenInAppPathController(remote as never)
  const launch = vi.fn(over.launch ?? (async () => new Response('{}', { status: 200 })))
  const directories = new OpenInAppController(async () => await launch())
  directories.apps.set(over.apps === undefined ? ['finder', 'vscode'] : over.apps)
  const fiber = ctx.plugin({ name: 'open-in-app-menus', apply: (child) => {
    registerContextMenus(child, paths, t, directories)
  } })
  await fiber.await()
  const contribution = (id: string): Contribution => {
    const found = contributions.find(entry => entry.id === id)
    if (found === undefined) throw new Error('missing contribution ' + id)
    return found
  }
  const resolve = async (id: string, target: Record<string, unknown>): Promise<Actions> =>
    await contribution(id).resolve(target, new AbortController().signal)
  const byId = (actions: Actions, id: string): MenuAction => {
    const found = actions.find(action => action.id === id)
    if (found === undefined) throw new Error('missing action ' + id)
    return found
  }
  return { ctx, fiber, contributions, notify, failed, registry, remote, paths, directories, launch, resolve, byId }
}

it('reveals the Session directory with the installed file manager', async () => {
  const b = await bench({ apps: ['vscode', 'explorer'] })
  try {
    const [reveal] = await b.resolve('open-in-app.session', { sessionId: SessionId('s1') })
    // The generic file-manager label applies when Finder is not installed.
    expect(reveal?.label).toBe('Show in folder')
    expect(reveal?.disabled).toBe(false)
    await reveal?.run?.()
    expect(b.directories.apps.getSnapshot()).toEqual(['vscode', 'explorer'])
    expect(b.launch).toHaveBeenCalledOnce()
  } finally { await b.fiber.dispose() }
})

it('disables the Session directory action without a directory or a file manager', async () => {
  const b = await bench({ apps: ['vscode'], rows: { s1: {} } })
  try {
    const [reveal] = await b.resolve('open-in-app.session', { sessionId: SessionId('s1') })
    expect(reveal?.label).toBe('Show in folder')
    expect(reveal?.disabled).toBe(true)
    expect(reveal?.run).toBeUndefined()
    expect(reveal?.failureLabel).toBe('Could not show the file location. Try again.')
  } finally { await b.fiber.dispose() }
})

it('reveals and copies a workspace directory path, and reports a refused reveal', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const b = await bench({
    remote: remoteWith({ open: async () => ({ ok: false, error: { code: 'denied' } }) }),
  })
  try {
    b.paths.desktop.set(true)
    const [reveal, copyPath] = await b.resolve('open-in-app.directory', {
      sessionId: SessionId('s1'), path: 'sub/dir',
    })
    expect(reveal?.label).toBe('Show in Finder')
    expect(reveal?.disabled).toBe(false)
    expect(copyPath?.label).toBe('Copy folder path')
    await copyPath?.run?.()
    expect(writeText).toHaveBeenCalledWith('/ws/proj/sub/dir')
    expect(b.notify).toHaveBeenCalledWith('Copied', true)
    // A refused Host reveal surfaces the action's own failure label.
    await expect(reveal?.run?.()).rejects.toThrow('Could not show the file location. Try again.')
    expect(b.remote.openWorkspacePath).toHaveBeenCalledWith({ path: '/ws/proj/sub/dir', action: 'reveal' })
  } finally { await b.fiber.dispose() }
})

it('disables the directory reveal when the Host cannot open paths', async () => {
  const b = await bench()
  try {
    b.paths.desktop.set(false)
    const [reveal] = await b.resolve('open-in-app.directory', { sessionId: SessionId('s1'), path: 'sub' })
    expect(reveal?.disabled).toBe(true)
    expect(reveal?.run).toBeUndefined()
  } finally { await b.fiber.dispose() }
})

it('opens a file in the recorded default application and copies its path', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const b = await bench()
  try {
    const [reveal, open, copyPath] = await b.resolve('open-in-app.file', {
      sessionId: SessionId('s1'), path: 'src/main.ts',
    })
    expect(b.remote.canOpenWorkspacePath).toHaveBeenCalledOnce()
    expect(reveal?.disabled).toBe(false)
    expect(open?.label).toBe('Open in VS Code')
    expect(open?.icon).toEqual({ key: 'open-in-app.application', src: 'data:image/png,AA' })
    expect(open?.disabled).toBe(false)
    expect(copyPath?.label).toBe('Copy file path')
    await open?.run?.()
    expect(b.remote.openWorkspacePath).toHaveBeenCalledWith({ path: '/ws/proj/src/main.ts', application: 'vscode' })
    await copyPath?.run?.()
    expect(writeText).toHaveBeenCalledWith('/ws/proj/src/main.ts')
  } finally { await b.fiber.dispose() }
})

it('reports an application open failure through the action label', async () => {
  const b = await bench({
    remote: remoteWith({ open: async () => ({ ok: false, error: { code: 'denied' } }) }),
  })
  try {
    const [, open] = await b.resolve('open-in-app.file', { sessionId: SessionId('s1'), path: 'src/main.ts' })
    await expect(open?.run?.()).rejects.toThrow('Could not open. Try again.')
  } finally { await b.fiber.dispose() }
})

it('offers the default-application entry when the handler query fails or desktop is unavailable', async () => {
  const failed = await bench({ remote: remoteWith({ applications: async () => ({ ok: false, error: { code: 'x' } }) }) })
  try {
    const [, open] = await failed.resolve('open-in-app.file', { sessionId: SessionId('s1'), path: 'a.txt' })
    expect(open?.label).toBe('Open in default application')
    expect(open?.icon).toEqual({ key: 'open-in-app.application' })
    expect(open?.disabled).toBe(true)
    expect(open?.run).toBeUndefined()
  } finally { await failed.fiber.dispose() }

  const offline = await bench({
    remote: remoteWith({ canOpen: async () => ({ ok: true as const, value: false }) }),
  })
  try {
    const [reveal, open, copyPath] = await offline.resolve('open-in-app.file', {
      sessionId: SessionId('s1'), path: 'a.txt',
    })
    expect(reveal?.disabled).toBe(true)
    expect(open?.disabled).toBe(true)
    expect(copyPath?.disabled).toBeUndefined()
    // No handler query runs without desktop availability.
    expect(offline.remote.workspacePathApplications).not.toHaveBeenCalled()
  } finally { await offline.fiber.dispose() }
})

it('opens a URL externally and copies its address', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  const b = await bench()
  try {
    const [external, copy] = await b.resolve('open-in-app.url', { url: 'https://example.com/a' })
    expect(external?.label).toBe('Open in external browser')
    void external?.run?.()
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer')
    await copy?.run?.()
    expect(writeText).toHaveBeenCalledWith('https://example.com/a')
    expect(b.notify).toHaveBeenCalledWith('Copied', true)
  } finally { await b.fiber.dispose() }
})

it('observes the desktop and directory state each contribution reads', async () => {
  const b = await bench({ apps: ['finder'] })
  try {
    const session = b.registry.resolve({ kind: 'session', value: { sessionId: SessionId('s1') } } as never)
    await session.ready
    expect(session.source.getSnapshot().map(action => action.id)).toEqual(['open-in-app.session/reveal'])

    const directory = b.registry.resolve({ kind: 'directory', value: { sessionId: SessionId('s1'), path: 'sub' } } as never)
    await directory.ready
    // Availability and directory reads publish through the observed sources.
    b.paths.desktop.set(true)
    await vi.waitFor(() => {
      expect(directory.source.getSnapshot().find(action => action.id === 'open-in-app.directory/reveal')?.disabled).toBe(false)
    })
    b.paths.desktop.set(false)
    await vi.waitFor(() => {
      expect(directory.source.getSnapshot().find(action => action.id === 'open-in-app.directory/reveal')?.disabled).toBe(true)
    })

    const file = b.registry.resolve({ kind: 'file', value: { sessionId: SessionId('s1'), path: 'src/main.ts' } } as never)
    await file.ready
    expect(file.source.getSnapshot().map(action => action.id)).toEqual([
      'open-in-app.file/reveal', 'open-in-app.file/open', 'open-in-app.file/copyPath',
    ])

    const url = b.registry.resolve({ kind: 'url', value: { url: 'https://example.com' } } as never)
    await url.ready
    expect(url.source.getSnapshot().map(action => action.id)).toEqual(['open-in-app.url/external', 'open-in-app.url/copy'])

    for (const occurrence of [session, directory, file, url]) occurrence.dispose()
    expect(b.failed).not.toHaveBeenCalled()
  } finally { await b.fiber.dispose() }
})

function capturedIcon(src?: string): PropsRuntime<'contextMenu.icon'>['icon'] {
  return { key: 'open-in-app.application', ...(src === undefined ? {} : { src }) }
}

it('renders the captured application image or the native-open glyph', () => {
  const captured = render(<ContextMenuApplicationIcon icon={capturedIcon('data:image/png,AA')} />)
  expect(captured.container.querySelector('img')?.getAttribute('src')).toBe('data:image/png,AA')
  expect(captured.container.querySelector('img')?.getAttribute('width')).toBe('14')
  cleanup()
  const glyph = render(<ContextMenuApplicationIcon icon={capturedIcon()} />)
  expect(glyph.container.querySelector('img')).toBeNull()
  expect(Object.keys(CONTEXT_MENU_ICONS)).toEqual([
    'open-in-app.reveal', 'open-in-app.copy', 'open-in-app.external',
  ])
})
