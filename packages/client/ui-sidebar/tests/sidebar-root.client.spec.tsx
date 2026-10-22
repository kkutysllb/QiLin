// @vitest-environment jsdom
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Tooltip } from '@qilin-agent/client-ui-primitives'
import type { ReactNode } from 'react'
import type {
  SidebarFooterActionOwnerProps, SidebarPanelMetadata, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import type { MainPanelId } from '@qilin-agent/client-ui-layout/client'
import type { ShortcutCatalogEntry } from '@qilin-agent/client-shortcuts/client'
import { contextMenuHook } from '@qilin-agent/client-test-runtime'
import { HeaderLeadingControls, type HeaderLeadingControlsProps } from '../src/client/HeaderLeadingControls.tsx'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@qilin-agent/client-locale/src/locales/en.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const useContextMenu = contextMenuHook()
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true
const useSessionAccess: GlobalStandardProps['useSessionAccess'] = () => true
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key =>
  (en as Record<string, string>)[key] ?? (commonEn as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platform
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
type AttentionSnapshot = Parameters<Parameters<SidebarRootComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: SidebarRootComponentProps['useSessionStatus'] = selector => selector(noAttention)

/** One catalog row as the shortcuts registry publishes it. */
const shortcutRow = (id: string, keys: readonly string[], aria: string): ShortcutCatalogEntry => ({
  id: id as ShortcutCatalogEntry['id'],
  label: id,
  aliases: [],
  keys,
  aria,
  binding: null,
  modified: false,
  conflicts: [],
  issue: null,
})

/** The panel rows a composition contributes to the shell's navigation list. */
const panelRows = (...sections: Array<string | undefined>): readonly SidebarPanelMetadata[] =>
  sections.map((section, index) => ({
    id: `panel${index}` as MainPanelId,
    order: index,
    label: `Panel ${index}`,
    section,
  }))

function mountShell({
  collapsed = false, width = 300, drawer = false,
  panels = [], shortcuts = [], entryActions = false,
}: {
  collapsed?: boolean
  width?: number
  drawer?: boolean
  panels?: readonly SidebarPanelMetadata[]
  shortcuts?: readonly ShortcutCatalogEntry[]
  entryActions?: boolean
} = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  const trackEntryClick = vi.fn()
  const selectPanel = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let accountOwner: SidebarFooterActionOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width, drawer }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width} drawer={current.drawer}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={selectPanel} setPinned={() => {}} trackEntryClick={trackEntryClick}
      usePanels={selector => selector(panels)} useShortcuts={selector => selector(shortcuts)}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(entryActions)}
      useResource={useResource} useRemoteAccess={useRemoteAccess} useSessionAccess={useSessionAccess} useWorkspaces={neverHook}
      useContextMenu={useContextMenu}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.toggle.badge') return null
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.account') {
          accountOwner = owner
          return <div data-testid="account-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.panellist.actions') {
          const actions = owner as unknown as {
            entries?: readonly { id: string }[]
            onOpen?: (id: string) => void
          }
          return <>{actions.entries?.map(entry => (
            <button key={entry.id} type="button" onClick={() => { actions.onOpen?.(entry.id) }}>{entry.id}</button>
          ))}</>
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    view,
    startSession,
    toggleSidebar,
    trackEntryClick,
    selectPanel,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    accountOwner: () => {
      if (accountOwner === undefined) throw new Error('account owner not rendered')
      return accountOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

/** Render the shell with no brand/seat packages, as the badge cases need. */
function renderBareShell(): void {
  render(<SidebarRoot
    collapsed={false} width={300}
    useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
    usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])} useShortcuts={selector => selector([])}
    useResource={useResource} useRemoteAccess={useRemoteAccess} useWorkspaces={neverHook}
    startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
    renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
      options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
  />)
}
describe('SidebarRoot shell', () => {
  it('routes the More menu to official panel analytics and selection', () => {
    const b = mountShell({
      entryActions: true,
      panels: [
        { id: 'schedules' as SidebarPanelMetadata['id'], order: 1, label: 'Schedules', section: 'extension' },
        { id: 'plain' as SidebarPanelMetadata['id'], order: 2, label: 'Plain', section: 'extension' },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: t('panels.more') }))
    fireEvent.click(screen.getByRole('button', { name: 'schedules' }))
    expect(b.trackEntryClick).toHaveBeenCalledWith({ menu_name: 'cron', position: 'sidebar_more' })
    expect(b.selectPanel).toHaveBeenCalledWith('schedules')
    // A panel with no official category still opens without analytics.
    fireEvent.click(screen.getByRole('button', { name: 'plain' }))
    expect(b.trackEntryClick).not.toHaveBeenCalledWith({ menu_name: 'plain', position: 'sidebar_more' })
    expect(b.selectPanel).toHaveBeenCalledWith('plain')
  })

  it('keeps the More launcher on the collapsed rail', () => {
    const b = mountShell({
      collapsed: true,
      entryActions: true,
      panels: [{ id: 'schedules' as SidebarPanelMetadata['id'], order: 1, label: 'Schedules', section: 'extension' }],
    })
    const more = screen.getByRole('button', { name: t('panels.more') })
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'schedules' }))
    expect(b.selectPanel).toHaveBeenCalledWith('schedules')
  })

  it('reports a collapsed new session from the Windows titlebar', () => {
    document.documentElement.setAttribute('data-windows-titlebar', '')
    try {
      const b = mountShell({ collapsed: true })
      for (const button of screen.getAllByRole('button', { name: 'New session' })) fireEvent.click(button)
      expect(b.trackEntryClick).toHaveBeenCalledWith({ menu_name: 'new_session', position: 'titlebar' })
      b.trackEntryClick.mockClear()
      fireEvent.click(screen.getAllByRole('button', { name: 'New session' })[0]!)
    } finally {
      document.documentElement.removeAttribute('data-windows-titlebar')
    }
    const expanded = mountShell({ collapsed: false })
    for (const button of screen.getAllByRole('button', { name: 'New session' })) fireEvent.click(button)
    // The expanded sidebar hosts the controls, so the report names the sidebar surface.
    expect(expanded.trackEntryClick).toHaveBeenCalledWith({ menu_name: 'new_session', position: 'sidebar' })
  })

  it('routes New Session (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders generic brand fallbacks when no package fills the slots', () => {
    vi.stubEnv('QILIN_CLIENT_COMMIT_HASH', '0123456')
    vi.stubEnv('QILIN_CLIENT_GIT_DIRTY', 'true')
    vi.stubEnv('QILIN_CLIENT_VERSION', '1.2.3-rc.4')
    const { container } = render(<SidebarRoot
      collapsed={false} width={300} drawer={false}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} setPinned={() => {}} trackEntryClick={() => {}}
      usePanels={selector => selector([])} useShortcuts={selector => selector([])}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(false)}
      useResource={useResource} useRemoteAccess={useRemoteAccess} useSessionAccess={useSessionAccess} useWorkspaces={neverHook}
      useContextMenu={useContextMenu}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('QiLin Agent')).toBeTruthy()
    // The badge shows the version; the commit and dirty suffixes ride its tooltip.
    const badge = screen.getByText('1.2.3-rc.4')
    expect(badge.getAttribute('title')).toBe('1.2.3-rc.4-0123456-dirty')
    expect(badge.parentElement?.textContent).toBe('QiLin Agent1.2.3-rc.4')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it.each([
    [{ QILIN_CLIENT_VERSION: '1.2.3' }, '1.2.3', '1.2.3'],
    [{ QILIN_CLIENT_COMMIT_HASH: 'abcdef0', QILIN_CLIENT_VERSION: '1.2.3' }, '1.2.3', '1.2.3-abcdef0'],
    [{ QILIN_CLIENT_PRODUCT_VERSION: '0.1.2', QILIN_CLIENT_VERSION: '3.0.5' }, '0.1.2', '0.1.2（引擎 3.0.5）'],
    [{ QILIN_CLIENT_PRODUCT_VERSION: '0.1.2', QILIN_CLIENT_VERSION: '0.1.2' }, '0.1.2', '0.1.2'],
    // KStock patch (K36): a product label names the delivery surface on the chip.
    [{ QILIN_CLIENT_PRODUCT_LABEL: '桌面端：', QILIN_CLIENT_PRODUCT_VERSION: '2.1.1', QILIN_CLIENT_VERSION: '3.1.7-rc.1' }, '桌面端：2.1.1', '桌面端：2.1.1（引擎 3.1.7-rc.1）'],
  ])('omits unavailable build-version suffixes from %j', (environment, version, detail) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)
    render(<SidebarRoot
      collapsed={false} width={300} drawer={false}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} setPinned={() => {}} trackEntryClick={() => {}}
      usePanels={selector => selector([])} useShortcuts={selector => selector([])}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(false)}
      useResource={useResource} useRemoteAccess={useRemoteAccess} useSessionAccess={useSessionAccess} useWorkspaces={neverHook}
      useContextMenu={useContextMenu}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('QiLin Agent')).toBeTruthy()
    expect(screen.getByText(version).getAttribute('title')).toBe(detail)
  })

  it('reads a product surface label ahead of the desktop marker (K36)', () => {
    vi.stubEnv('QILIN_CLIENT_PRODUCT_LABEL', '桌面端：')
    vi.stubEnv('QILIN_CLIENT_PRODUCT_VERSION', '2.1.1')
    vi.stubEnv('QILIN_CLIENT_VERSION', '3.1.7-rc.1')
    ;(window as Window & { qilinDesktop?: unknown }).qilinDesktop = {}
    renderBareShell()

    // One surface name on the chip: the product label replaces the marker's.
    const badge = screen.getByText('桌面端：2.1.1')
    expect(badge.getAttribute('title')).toBe('桌面端：2.1.1（引擎 3.1.7-rc.1）')
    delete (window as Window & { qilinDesktop?: unknown }).qilinDesktop
  })

  it('falls back to the desktop marker label when the build names no surface', () => {
    vi.stubEnv('QILIN_CLIENT_VERSION', '1.2.3')
    ;(window as Window & { qilinDesktop?: unknown }).qilinDesktop = {}
    renderBareShell()

    expect(screen.getByText('Desktop 1.2.3').getAttribute('title')).toBe('Desktop·1.2.3')
    delete (window as Window & { qilinDesktop?: unknown }).qilinDesktop
  })

  it('retains the local-build fallback without complete build metadata', () => {
    render(<SidebarRoot
      collapsed={false} width={300} drawer={false}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} setPinned={() => {}} trackEntryClick={() => {}}
      usePanels={selector => selector([])} useShortcuts={selector => selector([])}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(false)}
      useResource={useResource} useRemoteAccess={useRemoteAccess} useSessionAccess={useSessionAccess} useWorkspaces={neverHook}
      useContextMenu={useContextMenu}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('QiLin Agent')).toBeTruthy()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings and account seats ride the same wide flag.
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.accountOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.accountOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })

  it('shows only the badge bubble while the rail badge is hovered inside the toggle', () => {
    vi.useFakeTimers()
    render(<SidebarRoot
      collapsed width={56} drawer={false}
      useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} setPinned={() => {}} trackEntryClick={() => {}}
      usePanels={selector => selector([])} useShortcuts={selector => selector([])}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(false)}
      useResource={useResource} useRemoteAccess={useRemoteAccess} useSessionAccess={useSessionAccess} useWorkspaces={neverHook}
      useContextMenu={useContextMenu}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((key: string) => key === 'sidebar.toggle.badge'
        ? <Tooltip label="Update — V1.2.3"><span data-testid="badge" /></Tooltip>
        : null) as SidebarRootComponentProps['renderSlot']}
    />)
    const toggle = screen.getByRole('button', { name: 'Open sidebar' })
    fireEvent.pointerEnter(toggle)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    // The badge's own bubble replaces the toggle's rather than stacking on it,
    // even after the toggle's longer hover delay has elapsed.
    fireEvent.pointerEnter(screen.getByTestId('badge'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getAllByRole('tooltip').map(bubble => bubble.textContent)).toEqual(['Update — V1.2.3'])
    fireEvent.pointerLeave(screen.getByTestId('badge'), { relatedTarget: toggle })
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    fireEvent.pointerLeave(toggle)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

it('presents a drawer as a dialog and hands focus back to the opener when it closes', () => {
  const opener = document.createElement('button')
  opener.setAttribute('data-sidebar-opener', '')
  document.body.append(opener)
  try {
    const shell = mountShell({ drawer: true, collapsed: false })
    const dialog = shell.view.container.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe(t('navigation.label'))
    expect(dialog.getAttribute('data-shortcut-modal')).toBe('sidebar')
    // Focus inside the retained drawer moves to the page-level opener on close.
    const newSession = screen.getAllByRole('button', { name: 'New session' })[0]!
    act(() => { newSession.focus() })
    expect(document.activeElement).toBe(newSession)
    shell.rerender({ collapsed: true })
    expect(document.activeElement).toBe(opener)
    // A collapsed drawer keeps its own rail toggle as the handoff target.
    shell.rerender({ drawer: false, collapsed: false })
    const toggle = shell.view.container.querySelector('[data-sidebar-toggle]') as HTMLElement
    act(() => { toggle.focus() })
    shell.rerender({ drawer: false, collapsed: true })
    expect(document.activeElement).toBe(toggle)
  } finally {
    opener.remove()
  }
})

it('shows the composed shortcut hints on the new-session capsule and the header controls', () => {
  document.documentElement.dataset.platform = 'darwin'
  const shell = mountShell({
    shortcuts: [shortcutRow('sidebar.left.toggle', ['⌘B'], 'Meta+B'), shortcutRow('session.new', ['⌘N'], 'Meta+N')],
  })
  // Expanded, the capsule carries its inline key chip.
  expect(screen.getByText('⌘N')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'New session' })[0]?.getAttribute('aria-keyshortcuts')).toBe('Meta+N')

  // The header occupant resolves the same two rows into its own hints.
  const props = {
    toggleSidebar: shell.toggleSidebar,
    startSession: shell.startSession,
    useShortcuts: (selector: (rows: readonly ShortcutCatalogEntry[]) => unknown) =>
      selector([shortcutRow('sidebar.left.toggle', ['⌘B'], 'Meta+B'), shortcutRow('session.new', ['⌘N'], 'Meta+N')]),
    t,
  } as HeaderLeadingControlsProps
  const header = render(<HeaderLeadingControls {...props} />)
  const trafficLights = within(header.container)
  expect(trafficLights.getByRole('button', { name: en['toggle.open'] }).getAttribute('aria-keyshortcuts')).toBe('Meta+B')
  expect(trafficLights.getByRole('button', { name: en['session.new.label'] }).getAttribute('aria-keyshortcuts')).toBe('Meta+N')
})

it('keeps both controls reachable on the macOS rail', () => {
  document.documentElement.dataset.platform = 'darwin'
  const shell = mountShell({ collapsed: true })
  const opens = screen.getAllByRole('button', { name: en['toggle.open'] })
  // The rail keeps its own toggle, and the fixed strip beside the traffic lights
  // repeats it for panel pages, which render no conversation header.
  expect(opens).toHaveLength(2)
  for (const button of opens) fireEvent.click(button)
  expect(shell.toggleSidebar).toHaveBeenCalledTimes(2)

  const starters = screen.getAllByRole('button', { name: en['session.new.label'] })
  expect(starters).toHaveLength(2)
  for (const button of starters) fireEvent.click(button)
  expect(shell.startSession).toHaveBeenCalledTimes(2)
})

it('folds a section header and remembers the fold across a reload', () => {
  // The panel list persists folded sections per account; a stored list that
  // mixes ids with foreign values keeps only the ids.
  localStorage.setItem('qilin.sidebar.folded-sections.v1', JSON.stringify(['browse', 7]))
  const shell = mountShell({ panels: panelRows('browse', 'browse', 'tools') })
  const header = screen.getByRole('button', { name: 'browse' })
  expect(header.getAttribute('aria-expanded')).toBe('false')
  // A folded section hides its rows but keeps the following section's header.
  expect(screen.queryByText('Panel 0')).toBeNull()
  expect(screen.getByText('Panel 2')).toBeTruthy()

  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('Panel 0')).toBeTruthy()
  expect(JSON.parse(localStorage.getItem('qilin.sidebar.folded-sections.v1') ?? '[]')).toEqual([])
  expect(shell.toggleSidebar).not.toHaveBeenCalled()
})

it('ignores a persisted fold list that is not a list of sections', () => {
  localStorage.setItem('qilin.sidebar.folded-sections.v1', JSON.stringify({ browse: true }))
  mountShell({ panels: panelRows('browse') })
  expect(screen.getByText('Panel 0')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'browse' }).getAttribute('aria-expanded')).toBe('true')
})

it('keeps the macOS sidebar toggle in its top strip', () => {
  document.documentElement.dataset.platform = 'darwin'
  const shell = mountShell()
  fireEvent.click(screen.getByRole('button', { name: en['toggle.collapse'] }))
  expect(shell.toggleSidebar).toHaveBeenCalledOnce()
})

it.each([undefined, 'win32', 'linux', 'darwin'])('renders the sidebar opener everywhere and New Session on macOS desktop (%s)', (platform) => {
  if (platform !== undefined) document.documentElement.dataset.platform = platform
  const toggleSidebar = vi.fn()
  const startSession = vi.fn()
  // This occupant only consumes its two actions and locale, not Session hooks.
  const props = {
    toggleSidebar,
    startSession,
    trackEntryClick: vi.fn(),
    useShortcuts: (selector: (rows: readonly never[]) => unknown) => selector([]),
    t,
  } as HeaderLeadingControlsProps
  render(<HeaderLeadingControls {...props} />)
  // Visibility is the frame's business (CSS reads data-sidebar-collapsed and
  // data-sidebar-drawer); the occupant always renders the opener it hands focus
  // back to when a drawer closes.
  fireEvent.click(screen.getByRole('button', { name: en['toggle.open'] }))
  expect(toggleSidebar).toHaveBeenCalledOnce()
  const newSession = screen.queryByRole('button', { name: en['session.new.label'] })
  if (platform !== 'darwin') {
    expect(newSession).toBeNull()
    return
  }
  fireEvent.click(newSession!)
  expect(startSession).toHaveBeenCalledOnce()
})

it('hands focus to the opener when a menu outside the column owns it', () => {
  const shell = mountShell()
  const column = shell.view.container.firstElementChild as HTMLElement
  // A collapsed column whose last focus owner controls a popup rendered outside
  // it (the shared row menu portals there): its focus handoff still runs.
  const control = document.createElement('button')
  control.setAttribute('aria-controls', 'row-menu')
  column.appendChild(control)
  const popup = document.createElement('div')
  popup.id = 'row-menu'
  const item = document.createElement('button')
  popup.appendChild(item)
  document.body.appendChild(popup)
  try {
    control.focus()
    expect(document.activeElement).toBe(control)
    item.focus()
    expect(document.activeElement).toBe(item)
    shell.rerender({ collapsed: true })
    // The controlled popup contains the focus, so the collapse is not abandoned:
    // the rail toggle takes focus back.
    expect(document.activeElement).not.toBe(item)
    expect(document.activeElement?.getAttribute('aria-label')).toBe(en['toggle.open'])
  } finally {
    popup.remove()
    control.remove()
  }
})
