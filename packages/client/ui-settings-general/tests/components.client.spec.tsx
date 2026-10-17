// @vitest-environment jsdom
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, RemoteError } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { GeneralSectionComponentProps } from '../src/client/GeneralSection.tsx'
import { GeneralSection } from '../src/client/GeneralSection.tsx'
import { CloseLabel, HeaderContent } from '../src/client/chrome.tsx'
import type { HeaderContentProps } from '../src/client/chrome.tsx'
import { SettingsDocumentAction } from '../src/client/SettingsDocumentAction.tsx'
import { DeveloperToolsRow } from '../src/client/DeveloperToolsRow.tsx'
import { SettingsDescribeMirror } from '@qilin-agent/client-ui-settings/src/client/settings-mirror.ts'
import { SettingsDocumentStore } from '../src/client/settings-document-store.ts'
import { en, zh } from '../src/client/locales.ts'
import { CurrentVersionRow } from '../src/client/CurrentVersionRow.tsx'
import { HostReleasePrompt } from '../src/client/HostReleasePrompt.tsx'
import type { ClientReleaseChange } from '@qilin-agent/client-modules/client'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

/** Store over a real mirror derived from the same scripted context. */
function derivedDocumentStore(remote: object) {
  const ctx = { remote } as never
  return new SettingsDocumentStore(ctx, new SettingsDescribeMirror(ctx))
}

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

// The seat's key domain is settings ∪ common; the stub answers from the
// package dictionary and falls back to the key like the real chain.
const t: HeaderContentProps['t'] = key => (en as Record<string, string>)[key] ?? key

// Global standard kit stubs: none of these components consume the hooks.
const unusedHook = (() => { throw new Error('unused by settings-general components') }) as never
type AttentionSnapshot = Parameters<Parameters<HeaderContentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: HeaderContentProps['useSessionStatus'] = selector => selector(noAttention)
const kit = {
  useSessions: unusedHook, useSessionStatus,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource, useRemoteAccess, useWorkspaces: unusedHook,
}

describe('chrome content', () => {
  it('HeaderContent and CloseLabel render their translated text', () => {
    render(<HeaderContent {...kit} t={t} />)
    render(<CloseLabel {...kit} t={t} />)
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })
})

describe('GeneralSection', () => {
  function mount() {
    const renderSlot = vi.fn(
      ((key: string) => <div data-testid={`slot-${key}`} />) as GeneralSectionComponentProps['renderSlot'],
    )
    const props: GeneralSectionComponentProps = { ...kit, renderSlot, close: vi.fn() }
    const view = render(<GeneralSection {...props} />)
    return { view, renderSlot }
  }

  it('renders the item slot as the section body', () => {
    const { renderSlot } = mount()
    expect(renderSlot).toHaveBeenCalledWith('settings.general.item', {})
    expect(screen.getByTestId('slot-settings.general.item')).toBeTruthy()
  })
})

it('toggles coding tools using the accepted setting and disables duplicate writes', async () => {
  const state = createSnapshotStore(false)
  let finish!: () => void
  const setEnabled = vi.fn((enabled: boolean) => new Promise<void>((resolve) => {
    finish = () => { state.set(enabled); resolve() }
  }))
  render(<DeveloperToolsRow {...kit} t={t} useDeveloperTools={bindSnapshotSelector(state)} setEnabled={setEnabled} />)
  const toggle = screen.getByRole('switch', { name: 'Show coding view' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  expect(setEnabled).toHaveBeenCalledWith(true)
  expect(toggle.hasAttribute('disabled')).toBe(true)
  finish()
  await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
  expect(toggle.hasAttribute('disabled')).toBe(false)
})

it('reports a failed coding-tool write and allows retry', async () => {
  const state = createSnapshotStore(false)
  const setEnabled = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async (enabled: boolean) => { state.set(enabled) })
  render(<DeveloperToolsRow {...kit} t={t} useDeveloperTools={bindSnapshotSelector(state)} setEnabled={setEnabled} />)
  const toggle = screen.getByRole('switch', { name: 'Show coding view' })
  fireEvent.click(toggle)
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Please try again.')
  expect(toggle.hasAttribute('disabled')).toBe(false)
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
  expect(screen.queryByRole('alert')).toBeNull()
})

describe('SettingsDocumentAction', () => {
  it('appears only for a file-backed provider and requests its Host-owned document', async () => {
    const openDocument = vi.fn(() => Promise.resolve({
      ok: true as const, value: { opened: true as const },
    }))
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        })),
        openSettingsDocument: openDocument,
      },
    })
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    const action = await screen.findByRole('button', { name: 'Open configuration file' })
    fireEvent.click(action)
    await waitFor(() => { expect(openDocument).toHaveBeenCalledWith() })
  })

  it('stays absent without a document and follows a mirror refresh to available', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { writable: true, hasDocument: false, namespaces: [] } })
      .mockResolvedValueOnce({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } })
    const ctx = { remote: { settings: { describe, openSettingsDocument: vi.fn() } } } as never
    const mirror = new SettingsDescribeMirror(ctx)
    const controller = new SettingsDocumentStore(ctx, mirror)
    const first = render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(screen.queryByRole('button', { name: 'Open configuration file' })).toBeNull()
    first.unmount()
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    // A remount alone re-reads nothing; availability moves with the mirror's
    // own refresh (a document commit or reconnect in production).
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(describe).toHaveBeenCalledTimes(1)
    await mirror.load()
    expect(await screen.findByRole('button', { name: 'Open configuration file' })).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(2)
  })

  it('keeps the action available and reports a native-open failure', async () => {
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        })),
        openSettingsDocument: vi.fn(() => Promise.resolve({
          ok: false as const,
          error: new RemoteError('gateway/internal', 'xdg-open missing', {}),
        })),
      },
    })
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open configuration file' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open configuration file')
    expect(screen.getByRole('button', { name: 'Open configuration file' })).toBeTruthy()
  })

  it('reports a mirror failure that held no answer as an unavailable document', async () => {
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: false as const,
          error: new RemoteError('gateway/internal', 'settings unavailable', {}),
        })),
        openSettingsDocument: vi.fn(),
      },
    })
    await controller.load()

    // No document could be located, and the reader is told why instead of
    // being shown a spinner forever.
    expect(controller.store.getSnapshot()).toEqual({
      status: 'unavailable', opening: false, error: 'settings unavailable',
    })
    controller.dispose()
  })

  it('drops an open gesture until a document is loaded, then collapses concurrent ones', async () => {
    const openDocument = vi.fn(() => Promise.resolve({ ok: true as const, value: { opened: true as const } }))
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        })),
        openSettingsDocument: openDocument,
      },
    })

    // Nothing is loaded yet, so there is no document to open.
    await controller.open()
    expect(openDocument).not.toHaveBeenCalled()

    await controller.load()
    const first = controller.open()
    const second = controller.open()
    await Promise.all([first, second])
    expect(openDocument).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', opening: false, error: null })
    controller.dispose()
  })
})

describe('current version', () => {
  it.each([
    ['Current version: 1.2.3-rc.4', en],
    ['当前版本：1.2.3-rc.4', zh],
  ])('renders the localized release label %s', (expected, dictionary) => {
    vi.stubEnv('QILIN_CLIENT_VERSION', '1.2.3-rc.4')
    const translate: HeaderContentProps['t'] = (key, params) => {
      let text = (dictionary as Record<string, string>)[key] ?? key
      for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value))
      return text
    }
    render(<CurrentVersionRow {...kit} t={translate} />)
    expect(screen.getByText(expected)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('omits the row when a partial build has no version metadata', () => {
    vi.stubEnv('QILIN_CLIENT_VERSION', undefined)
    const view = render(<CurrentVersionRow {...kit} t={t} />)
    expect(view.container.textContent).toBe('')
  })
})

describe('Host release prompt', () => {
  type PromptProps = Parameters<typeof HostReleasePrompt>[0]

  function mount(change: ClientReleaseChange | undefined, options: { reload?: () => void } = {}) {
    const dismissRelease = vi.fn()
    const reloadPage = vi.fn(options.reload)
    const useReleaseChange: PromptProps['useReleaseChange'] = selector => selector(change)
    const props: PromptProps = { ...kit, useReleaseChange, dismissRelease, reloadPage, t }
    const view = render(<HostReleasePrompt {...props} />)
    return { view, dismissRelease, reloadPage }
  }

  it('stays absent while the Host serves the page boot release', () => {
    const { view } = mount(undefined)
    expect(view.container.childElementCount).toBe(0)
  })

  it('names both ends of the transition and reloads only on the explicit action', () => {
    const change: ClientReleaseChange = {
      page: { version: '1.0.0', commit: 'aaaaaaa' },
      previous: { version: '0.9.0', commit: '9999999' },
      host: { version: '1.0.0', commit: 'bbbbbbb' },
    }
    const { view, dismissRelease, reloadPage } = mount(change)
    expect(view.getByText('Service version changed')).toBeTruthy()
    // Versions differ between the two releases the Host served, so that row names versions…
    expect(view.getByText('0.9.0')).toBeTruthy()
    expect(view.getByText('1.0.0')).toBeTruthy()
    // …while the page row compares against its boot release and names the differing commit.
    expect(view.getByText('aaaaaaa')).toBeTruthy()
    expect(view.getByText('bbbbbbb')).toBeTruthy()
    // The footer action and the dialog's close control both keep the page.
    const keep = view.getAllByRole('button', { name: 'Not now' })
    expect(keep).toHaveLength(2)
    for (const button of keep) fireEvent.click(button)
    expect(dismissRelease).toHaveBeenCalledTimes(2)
    expect(reloadPage).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Reload to load the new version' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('falls back to the unknown label for a release the Host did not publish', () => {
    const change: ClientReleaseChange = { page: undefined, previous: undefined, host: { version: '2.0.0' } }
    const { view } = mount(change)
    // Both rows start at a release the Host never published, and both end at the connected one.
    expect(view.getAllByText('Unknown')).toHaveLength(2)
    expect(view.getAllByText('2.0.0')).toHaveLength(2)
  })
})
