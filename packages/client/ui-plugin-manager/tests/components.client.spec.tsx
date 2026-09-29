// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginEntryId, PluginRegistries } from '@qilin/api-remotes/client'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import { createSnapshotStore } from '@qilin/client-store'
import type { ReactNode } from 'react'
import { PluginManagerPage } from '../src/client/PluginManagerPage.tsx'
import type { PluginManagerPageProps } from '../src/client/PluginManagerPage.tsx'
import type { ConfigLedger } from '../src/client/config-ledger.ts'
import { rowKey, type InstallState, type PackageRow, type PackageView, type PluginManagerState } from '../src/client/manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const translate = (dict: typeof en): PluginManagerPageProps['t'] => ((key: PluginManagerLocaleKey, params?: Record<string, string>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    dict[key],
  )) as PluginManagerPageProps['t']

const t = translate(en)

function pkg(overrides: Partial<PackageView> = {}): PackageView {
  return {
    name: 'qilin-better-sidebar',
    version: '0.16.0',
    installed: true,
    optional: false,
    updatable: true,
    enabled: true,
    rows: [],
    ...overrides,
  }
}

function row(overrides: Partial<PackageRow> = {}): PackageRow {
  return { entryId: 'include:sidebar' as PluginEntryId, rowId: 'sidebar', moduleName: 'qilin-better-sidebar', enabled: true, phase: 'active', ...overrides }
}

const INCOMPATIBLE = { name: 'qilin-late', version: '2.0.0', runtimeVersion: '0.1.0', peers: { '@qilin/session': '^0.2.0', '@qilin/tools': '^0.2.0' } }
/** The English sentence an incompatibility of {@link INCOMPATIBLE}, optionally renamed, reads as. */
const incompatibleText = (name = INCOMPATIBLE.name): string => en.reasonIncompatibleVersion
  .replace('{plugin}', `${name}@2.0.0`).replace('{runtime}', '0.1.0').replace('{peers}', '@qilin/session ^0.2.0, @qilin/tools ^0.2.0')

const IDLE_INSTALL: InstallState = {
  open: false, spec: '', phase: 'idle', registries: null, registry: { kind: 'offered', registry: null }, registryOpen: false,
  registryError: false, attempts: null, inputError: null, subject: null, runs: [], detailsOpen: false,
  installed: null, restartRequired: false, failure: null, approvedBuilds: [], enabling: false,
}

const READY: PluginManagerState = {
  status: 'ready',
  packages: [],
  busy: [],
  notice: null,
  install: IDLE_INSTALL,
  confirm: null,
  highlight: null,
  updates: { status: 'idle', entries: [], reason: '' },
  catalog: { status: 'idle', query: '', page: 1, entries: [], hasMore: false, reason: '' },
}

/** Configuration entries a test supplies: what each slot cell renders, by `<slot>:<cell>`, the view asked for, and its owner props. */
type SlotBodies = Record<string, (
  view: 'summary' | 'page',
  owner: { form?: unknown; onDismiss?: () => void; onOpenDetails?: () => void },
) => ReactNode>

const NO_CONFIG: ConfigLedger = { items: [], bundles: new Set(), rows: new Set() }

function renderTab(
  state: Partial<PluginManagerState> = {}, config: Partial<ConfigLedger> = {}, bodies: SlotBodies = {},
  namespaces: readonly { ns: string }[] = [],
  extra: Partial<PluginManagerPageProps> = {},
) {
  const store = createSnapshotStore<PluginManagerState>({ ...READY, ...state })
  const ledger = createSnapshotStore<ConfigLedger>({ ...NO_CONFIG, ...config })
  const actions = {
    ensure: vi.fn(),
    refresh: vi.fn(),
    openInstall: vi.fn(),
    closeInstall: vi.fn(),
    editInstallSpec: vi.fn(),
    runInstall: vi.fn(),
    cancelInstall: vi.fn(),
    cancelInstallAndClose: vi.fn(),
    toggleInstallDetails: vi.fn(),
    approveBuildsAndRetry: vi.fn(),
    enableInstalled: vi.fn(),
    clearHighlight: vi.fn(),
    setEnabled: vi.fn(),
    uninstall: vi.fn(),
    confirm: vi.fn(),
    cancelConfirm: vi.fn(),
    setRowEnabled: vi.fn(),
    dismissNotice: vi.fn(),
    checkUpdates: vi.fn(),
    dismissUpdates: vi.fn(),
    updatePackage: vi.fn(),
    catalog: vi.fn(),
    installCatalogSpec: vi.fn(),
    toggleRegistryOptions: vi.fn(),
    chooseRegistry: vi.fn(),
    changeRegistry: vi.fn(),
    useGithubMirror: vi.fn(),
  }
  const configurations = createSnapshotStore<{ view?: { namespaces: readonly { ns: string }[] } }>({ view: { namespaces } })
  const configForm = vi.fn(() => ({
    getSnapshot: () => ({ status: 'ready', value: {}, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }),
    mutate: vi.fn(),
  }))
  const props = {
    t,
    ...actions,
    configForm,
    ...extra,
    usePluginManager: bindSnapshotSelector(store),
    useConfigLedger: bindSnapshotSelector(ledger),
    useConfigurations: bindSnapshotSelector(configurations),
    renderSlot: (name: string, owner: { view: 'summary' | 'page'; form?: unknown }, opts: { only?: string; entryKey?: string }) =>
      bodies[`${name}:${opts.only ?? opts.entryKey ?? ''}`]?.(owner.view, owner) ?? null,
  } as PluginManagerPageProps
  const { rerender } = render(<PluginManagerPage {...props} />)
  return {
    store,
    actions,
    configForm,
    set: (next: Partial<PluginManagerState>) => { act(() => { store.set({ ...store.getSnapshot(), ...next }) }) },
    setLanguage: (dict: typeof en) => { rerender(<PluginManagerPage {...props} t={translate(dict)} />) },
  }
}


describe('PluginManagerPage registry choice', () => {
  const MIRROR = 'https://registry.npmmirror.com/'
  const OFFICIAL = 'https://registry.npmjs.org/'
  const REGISTRIES: PluginRegistries = { registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }
  const GIT_SUBJECT = { spec: 'github:acme/qilin-x', status: 'accepted' as const, kind: 'git' as const, bundle: null, registry: null as string | null, host: 'github.com' }

  it('offers the registries under the spec, picks one, and refuses a typed address that is not http(s)', () => {
    const { actions, set } = renderTab({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES } })
    // The picker names the registry pnpm's own configuration falls back on.
    const toggle = () => screen.getByRole('button', { name: new RegExp(en.registryToggle) })
    // pnpm's own entry reads by the registry it names once the Host has read it.
    expect(toggle().textContent).toContain(en.registryOfficial)
    fireEvent.click(toggle())
    expect(actions.toggleRegistryOptions).toHaveBeenCalledTimes(1)
    set({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, registryOpen: true } })
    const panel = document.querySelector('[data-install-registry]') as HTMLElement
    expect(panel.getAttribute('aria-label')).toBe(en.registryLegend)
    const option = (name: string, host: string) => en.registryWithHost.replace('{name}', name).replace('{host}', host)
    expect(within(panel).getByLabelText(option(en.registryOfficial, 'registry.npmjs.org'))).toBeTruthy()
    expect(within(panel).getByLabelText(option(en.registryNpmmirror, 'registry.npmmirror.com'))).toBeTruthy()
    expect(within(panel).getByText(en.registryCustomHint)).toBeTruthy()
    fireEvent.click(within(panel).getByLabelText(option(en.registryNpmmirror, 'registry.npmmirror.com')))
    expect(actions.chooseRegistry).toHaveBeenCalledWith({ kind: 'offered', registry: MIRROR })
    fireEvent.click(within(panel).getAllByLabelText(en.registryCustom)[0]!)
    expect(actions.chooseRegistry).toHaveBeenCalledWith({ kind: 'custom', url: '' })
    // The typed field carries what was chosen, and its refusal is announced under it.
    set({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, registryOpen: true, registry: { kind: 'custom', url: 'npm.corp.example' }, registryError: true } })
    const field = screen.getAllByLabelText(en.registryCustom)[1] as HTMLInputElement
    expect(field.value).toBe('npm.corp.example')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe(en.registryCustomInvalid)
    fireEvent.change(field, { target: { value: 'https://npm.corp.example' } })
    expect(actions.chooseRegistry).toHaveBeenCalledWith({ kind: 'custom', url: 'https://npm.corp.example' })
    // A chosen mirror reads by name in the picker.
    set({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, registry: { kind: 'offered', registry: MIRROR } } })
    expect(toggle().textContent).toContain(en.registryNpmmirror)
  })

  it('labels a spec reopened from a GitHub mirror recovery as the package name', () => {
    renderTab({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, mirrorRecovery: true } })
    expect(screen.getByText(en.installPackageLabel)).toBeTruthy()
    expect(screen.queryByText(en.installDescription)).toBeNull()
  })

  it('words a check no registry answered with every registry it asked', () => {
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'qilin-x',
        inputError: { problem: 'network', reason: 'offline', registries: [null, MIRROR] },
      },
    })
    expect(screen.getByRole('alert').textContent)
      .toBe(en.installProblemNetworkAll.replace('{registries}', `${en.registryOfficial}${en.registryListSeparator}${en.registryNpmmirror}`))
  })

  it('names the registry each attempt asks while installing, and words a failure all of them explain', () => {
    const run = { jobId: 'j1', command: 'pnpm add fallen', cwd: '/p', output: 'x\n' }
    const { set } = renderTab({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'fallen', phase: 'running', subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        runs: [run], attempts: { registries: [null, MIRROR], total: 2 },
      },
    })
    expect(screen.getByText(en.installAttempt.replace('{previous}', en.registryOfficial).replace('{registry}', en.registryNpmmirror).replace('{index}', '2').replace('{total}', '2'))).toBeTruthy()
    set({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'fallen', phase: 'failed', detailsOpen: true,
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        runs: [{ ...run, exitCode: 1 }, { jobId: 'j2', command: 'pnpm add fallen --registry=mirror', cwd: '/p', output: 'y\n', exitCode: 1 }],
        attempts: { registries: [null, MIRROR], total: 2 },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetworkAll.replace('{registries}', `${en.registryOfficial}${en.registryListSeparator}${en.registryNpmmirror}`))).toBeTruthy()
    expect(screen.getByText(en.installAttemptBadge.replace('{index}', '1').replace('{registry}', en.registryOfficial))).toBeTruthy()
    expect(screen.getByText(en.installAttemptBadge.replace('{index}', '2').replace('{registry}', en.registryNpmmirror))).toBeTruthy()
  })

  it('offers another registry, or the mainland mirror, from the failed screen', () => {
    const { actions, set } = renderTab({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'fallen', phase: 'failed',
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        attempts: { registries: [null, MIRROR], total: 2 },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: en.installChangeRegistry }))
    expect(actions.changeRegistry).toHaveBeenCalledTimes(1)
    // A GitHub connection failure offered the mirror instead of a plain retry.
    set({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'github:acme/qilin-x', phase: 'failed',
        subject: GIT_SUBJECT, failure: { reason: 'unreachable', kind: 'network', failedAt: 'spec-host' },
      },
    })
    expect(screen.getByText(en.installFailureNetworkHost.replace('{host}', 'github.com'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.installUseGithubMirror }))
    expect(actions.useGithubMirror).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: en.installRetry })).toBeNull()
    // The mirror is already asked: the action reads as the way to another kind of spec.
    set({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'github:acme/qilin-x', phase: 'failed',
        registry: { kind: 'custom', url: MIRROR }, subject: GIT_SUBJECT,
        failure: { reason: 'unreachable', kind: 'timeout', failedAt: 'spec-host' },
      },
    })
    expect(screen.getByRole('button', { name: en.installTryAnotherWay })).toBeTruthy()
  })


  it('names a registry whose host is its only name, and words a one-registry failure by its kind', () => {
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, registryOpen: true, registries: { registry: 'https://npm.corp.example/', fallbackRegistries: [], resolved: OFFICIAL },
        registry: { kind: 'offered', registry: 'https://npm.corp.example/' },
      },
    })
    const panel = document.querySelector('[data-install-registry]') as HTMLElement
    // The host is the name: no parenthesized host is repeated beside it.
    expect(within(panel).getByLabelText('npm.corp.example')).toBeTruthy()
    cleanup()
    // A failure no registry answered for reads by its kind alone.
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, registries: REGISTRIES, spec: 'fallen', phase: 'failed',
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetwork)).toBeTruthy()
  })

  it('submits the typed registry on Enter and edits it as it is typed', () => {
    const { actions, set } = renderTab({
      install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, registryOpen: true, spec: 'qilin-x', registry: { kind: 'custom', url: 'https://npm.corp.example' } },
    })
    const field = screen.getAllByLabelText(en.registryCustom)[1] as HTMLInputElement
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(actions.runInstall).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(field, { key: 'a' })
    expect(actions.runInstall).toHaveBeenCalledTimes(1)
    set({ install: { ...IDLE_INSTALL, open: true, registries: REGISTRIES, registryOpen: true, registry: { kind: 'custom', url: '' } } })
    fireEvent.keyDown(screen.getAllByLabelText(en.registryCustom)[1]!, { key: 'Enter' })
    expect(actions.runInstall).toHaveBeenCalledTimes(1)
  })


  it('offers activation guidance from the card switch and routes both of its actions', () => {
    const bodies: SlotBodies = {
      'plugins.bundle.activation:qilin-off': (_view: 'summary' | 'page', owner) => (
        <>
          <button type="button" onClick={() => { owner.onDismiss?.() }}>dismiss guidance</button>
          <button type="button" onClick={() => { owner.onOpenDetails?.() }}>open guidance</button>
        </>
      ),
    }
    const rendered = renderTab({ packages: [pkg({ name: 'qilin-off', enabled: false })] }, {}, bodies)
    fireEvent.click(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'off') }))
    // The Host's read turns the bundle on; the guidance then shows over the cards.
    act(() => { rendered.set({ packages: [pkg({ name: 'qilin-off', enabled: true })] }) })
    fireEvent.click(screen.getByRole('button', { name: 'dismiss guidance' }))
    expect(screen.queryByRole('button', { name: 'dismiss guidance' })).toBeNull()
    // Disabling a bundle offers nothing; enabling again opens its page from the guidance.
    fireEvent.click(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'off') }))
    act(() => { rendered.set({ packages: [pkg({ name: 'qilin-off', enabled: false })] }) })
    expect(screen.queryByRole('button', { name: 'dismiss guidance' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'off') }))
    act(() => { rendered.set({ packages: [pkg({ name: 'qilin-off', enabled: true })] }) })
    fireEvent.click(screen.getByRole('button', { name: 'open guidance' }))
    expect(document.querySelector('[data-plugin-detail="qilin-off"]')).toBeTruthy()
  })

  it('words a failure that asked one registry, and one whose Host list was never read', () => {
    // Every registry failed, and the Host never listed them: the names fall back to the entries' defaults.
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'fallen', phase: 'failed', registries: null,
        attempts: { registries: [null, MIRROR], total: 2 },
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetworkAll.replace('{registries}', `${en.registryDefault}${en.registryListSeparator}${en.registryNpmmirror}`))).toBeTruthy()
    cleanup()
    // A registry that never answered reads the same way, and one registry asked is not an
    // "every registry" sentence.
    cleanup()
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'fallen', phase: 'failed', registries: REGISTRIES,
        attempts: { registries: [null, MIRROR], total: 2 },
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        failure: { reason: 'ERR', kind: 'timeout', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetworkAll.replace('{registries}', `${en.registryOfficial}${en.registryListSeparator}${en.registryNpmmirror}`))).toBeTruthy()
    cleanup()
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'fallen', phase: 'failed',
        attempts: { registries: [null], total: 1 },
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetwork)).toBeTruthy()
  })

  it('words a failure no attempt list explains by its kind', () => {
    renderTab({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'fallen', phase: 'failed',
        subject: { spec: 'fallen', status: 'accepted', kind: 'registry', name: 'fallen', bundle: true, registry: null },
        failure: { reason: 'ERR', kind: 'network', failedAt: 'registry' },
      },
    })
    expect(screen.getByText(en.installFailureNetwork)).toBeTruthy()
  })

  it('reveals a bundle through the navigation channel the tab registers', () => {
    const registerOpen = vi.fn()
    renderTab({ packages: [pkg()] }, {}, {}, [], { registerOpen })
    // The channel's reveal opens the bundle's page; an unknown name falls back to the cards.
    const reveal = registerOpen.mock.calls[0]![0] as (name: string) => void
    act(() => { reveal('qilin-better-sidebar') })
    expect(document.querySelector('[data-plugin-detail="qilin-better-sidebar"]')).toBeTruthy()
  })

  it('hands a contributed page the shared configuration form only for a namespace the Host serves', () => {
    const bodies: SlotBodies = { 'plugins.item:bash': (_view: 'summary' | 'page', owner) => owner.form === undefined ? null : <form aria-label="shared form" /> }
    const served = renderTab({ packages: [] }, { items: [{ id: 'bash', label: 'Shell' }] }, bodies, [{ ns: 'bash' }])
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'Shell') }))
    expect(screen.getByRole('form', { name: 'shared form' })).toBeTruthy()
    expect(served.configForm).toHaveBeenCalledWith('bash')
    cleanup()
    // A namespace the Host does not serve leaves the contribution without a form.
    renderTab({ packages: [] }, { items: [{ id: 'bash', label: 'Shell' }] }, bodies)
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'Shell') }))
    expect(screen.queryByRole('form', { name: 'shared form' })).toBeNull()
  })
})

describe('PluginManagerPage', () => {
  it('asks the store once mounted and renders the loading, unavailable, error, and empty states', () => {
    const { actions, set } = renderTab({ status: 'loading' })
    expect(actions.ensure).toHaveBeenCalledTimes(1)
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.addPlugin })).toHaveProperty('disabled', true)
    set({ status: 'unavailable' })
    expect(screen.getByRole('status').textContent).toBe(en.unavailable)
    set({ status: 'error' })
    expect(screen.getByRole('alert').textContent).toBe(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.refresh).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect(actions.refresh).toHaveBeenCalledTimes(2)
    set({ status: 'ready' })
    expect(screen.getByText(en.empty)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.addPlugin }))
    expect(actions.openInstall).toHaveBeenCalledTimes(1)
  })

  it('lists the installed bundles as cards, the installation\'s offered ones as official, and tags a problem the Host reports', () => {
    const { actions } = renderTab({
      packages: [
        pkg({ description: 'A sidebar.' }),
        pkg({ name: 'qilin-broken', enabled: false, error: { code: 'not-bundle' } }),
        pkg({ name: '@qilin/web-app', installed: false }),
        pkg({ name: 'qilin-protected', readOnlyReason: 'management-required' }),
        pkg({ name: '@acme/qilin-tool', enabled: false }),
        // Selected by the profile but not a bundle: a problem the person can switch off, in the profile's own group.
        pkg({ name: 'qilin-selected', installed: false, error: { code: 'not-bundle' } }),
        pkg({ name: '@qilin/experimental-agent-team-profile', installed: false, optional: true, enabled: false }),
      ],
      busy: ['qilin-protected'],
    })
    const cards = screen.getAllByRole('listitem')
    // The Official group comes first.
    expect(cards.map(card => card.getAttribute('data-plugin-package'))).toEqual([
      '@qilin/experimental-agent-team-profile', 'qilin-better-sidebar', 'qilin-broken', 'qilin-protected', '@acme/qilin-tool', 'qilin-selected',
    ])
    expect(cards.map(card => card.getAttribute('data-plugin-status'))).toEqual(['disabled', 'running', 'problem', 'running', 'disabled', 'problem'])
    // Each group heads with its title and its bare count; the official bundle carries its beta tag, no official tag.
    expect(screen.getByRole('heading', { name: en.bundlesTitle })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.officialTitle })).toBeTruthy()
    expect([...document.querySelectorAll('[data-plugin-count]')].map(count => count.textContent)).toEqual(['1', '5'])
    expect(screen.getAllByText(en.statusBeta)).toHaveLength(1)
    // A scoped name reads without its scope and harness prefix.
    expect(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'tool') })).toHaveProperty('disabled', false)
    expect(screen.getByText('A sidebar.')).toBeTruthy()
    expect(screen.getAllByText(en.statusProblem)).toHaveLength(2)
    // The switch acts on the bundle; a bundle the Host cannot read stays off, a protected one stays as it is.
    fireEvent.click(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'better-sidebar') }))
    expect(actions.setEnabled).toHaveBeenCalledWith('qilin-better-sidebar', false)
    expect(screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'broken') })).toHaveProperty('disabled', true)
    const locked = screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'protected') })
    expect(locked).toHaveProperty('disabled', true)
    expect(locked.getAttribute('title')).toBe(en.reasonManagementRequired)
  })

  it('omits built-in profile dependencies from cards and counts while retaining optional and third-party bundles', () => {
    renderTab({
      packages: [
        ...[
          '@qilin/base',
          '@qilin/web-app',
          '@qilin/headless',
          '@qilin/sdk-app',
          '@qilin/acp-app',
          '@qilin/sdk-minimal',
        ].map(name => pkg({ name })),
        pkg({ name: '@acme/qilin-base', readOnlyReason: 'management-required' }),
        pkg({ name: 'qilin-better-sidebar' }),
        pkg({ name: '@qilin/experimental-agent-team-profile', installed: false, optional: true }),
      ],
    })
    expect(screen.getAllByRole('listitem').map(card => card.getAttribute('data-plugin-package'))).toEqual([
      '@qilin/experimental-agent-team-profile', '@acme/qilin-base', 'qilin-better-sidebar',
    ])
    expect([...document.querySelectorAll('[data-plugin-count]')].map(count => count.textContent)).toEqual(['1', '2'])
  })

  it('lists a shipped template layer the Host cannot read, which no ownership lets upgrade', () => {
    // A shipped layer the profile does not own reaches the list only through the
    // problem the Host reports; it is not profile-installed, optional, or updatable.
    renderTab({
      packages: [pkg({
        name: '@qilin/web-brand', installed: false, updatable: false,
        error: { code: 'operation-error', diagnostic: 'Unreadable bundle' },
      })],
    })
    expect(screen.getAllByRole('listitem').map(card => card.getAttribute('data-plugin-package'))).toEqual(['@qilin/web-brand'])
    expect(screen.getByText(en.statusProblem)).toBeTruthy()
  })

  it('shows a card for a shipped layer the profile owns and locks its layer switch with the reason', () => {
    renderTab({
      packages: [pkg({ name: 'dsh-animations', installed: false, optional: false, version: '1.2.3', readOnlyReason: 'shipped-layer' })],
    })
    // The layer is not profile-installed and not optional, so it reaches the list
    // only through `updatable`.
    const card = screen.getByRole('listitem')
    expect(card.getAttribute('data-plugin-package')).toBe('dsh-animations')
    const toggle = screen.getByRole('switch', { name: en.enableToggle.replace('{name}', 'dsh-animations') })
    expect(toggle).toHaveProperty('disabled', true)
    expect(toggle.getAttribute('title')).toBe(en.reasonShippedLayer)
    // Its page states the reason in full: the layer arrives with the release, and
    // a shipped layer offers no uninstall.
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'dsh-animations') }))
    const detail = document.querySelector('[data-plugin-detail]') as HTMLElement
    expect(within(detail).getByText(en.versionTag.replace('{version}', '1.2.3'))).toBeTruthy()
    expect(within(detail).getByRole('status').textContent).toBe(en.reasonShippedLayer)
    expect(within(detail).queryByRole('button', { name: en.uninstallLabel.replace('{name}', 'dsh-animations') })).toBeNull()
  })

  it.each([false, true])('shows an empty list for built-in bundles with errors and installed=%s', (installed) => {
    renderTab({
      packages: ['@qilin/base', '@qilin/web-app'].map(name => pkg({
        name, installed, error: { code: 'operation-error', diagnostic: 'Unreadable bundle' },
      })),
    })
    expect(screen.getByText(en.empty)).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(document.querySelectorAll('[data-plugin-count]')).toHaveLength(0)
  })

  it('opens an official bundle\'s page with its beta tag and no uninstall, and switches it on', () => {
    const { actions } = renderTab({
      packages: [pkg({ name: '@qilin/experimental-agent-team-profile', installed: false, optional: true, enabled: false })],
    })
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', en.builtinAgentTeamTitle) }))
    const detail = document.querySelector('[data-plugin-detail]') as HTMLElement
    expect(within(detail).getByText(en.statusBeta)).toBeTruthy()
    expect(within(detail).queryByRole('button', { name: en.uninstallLabel.replace('{name}', en.builtinAgentTeamTitle) })).toBeNull()
    fireEvent.click(within(detail).getByRole('switch', { name: en.enableToggle.replace('{name}', en.builtinAgentTeamTitle) }))
    expect(actions.setEnabled).toHaveBeenCalledExactlyOnceWith('@qilin/experimental-agent-team-profile', true)
  })

  it.each([
    ['agent-team-profile', 'builtinAgentTeamTitle', 'builtinAgentTeamDescription'],
    ['auto-review', 'builtinAutoReviewTitle', 'builtinAutoReviewDescription'],
    ['voice-input-bundle', 'builtinVoiceInputTitle', 'builtinVoiceInputDescription'],
  ] as const)('localizes %s across cards, details, switches, and uninstall confirmation', (suffix, titleKey, descriptionKey) => {
    const name = `@qilin/experimental-${suffix}`
    const { actions, set, setLanguage } = renderTab({ packages: [pkg({ name, description: 'Original metadata.' })] })
    const assertCard = (dict: typeof en) => {
      expect(screen.getByRole('button', { name: dict.openDetail.replace('{name}', dict[titleKey]) }).textContent).toBe(dict[titleKey])
      expect(screen.getByText(dict[descriptionKey])).toBeTruthy()
      expect(screen.getByRole('switch', { name: dict.enableToggle.replace('{name}', dict[titleKey]) })).toBeTruthy()
      expect(screen.queryByText('Original metadata.')).toBeNull()
    }
    assertCard(en)
    setLanguage(zh)
    assertCard(zh)
    fireEvent.click(screen.getByRole('switch', { name: zh.enableToggle.replace('{name}', zh[titleKey]) }))
    expect(actions.setEnabled).toHaveBeenCalledExactlyOnceWith(name, false)
    fireEvent.click(screen.getByRole('button', { name: zh.openDetail.replace('{name}', zh[titleKey]) }))
    for (const dict of [zh, en]) {
      setLanguage(dict)
      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(dict[titleKey])
      expect(screen.getByText(dict[descriptionKey])).toBeTruthy()
      expect(document.querySelector('[data-plugin-name]')?.textContent).toBe(name)
      expect(screen.getByRole('switch', { name: dict.enableToggle.replace('{name}', dict[titleKey]) })).toBeTruthy()
      expect(screen.getByRole('button', { name: dict.uninstallLabel.replace('{name}', dict[titleKey]) })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: en.uninstallLabel.replace('{name}', en[titleKey]) }))
    expect(actions.uninstall).toHaveBeenCalledExactlyOnceWith(name)
    set({ confirm: { action: 'uninstall', packageName: name } })
    for (const dict of [en, zh]) {
      setLanguage(dict)
      expect(screen.getByRole('dialog', { name: dict.confirmUninstallTitle.replace('{name}', dict[titleKey]) })).toBeTruthy()
    }
  })

  describe('configuration pages', () => {
    const bodies: SlotBodies = {
      'plugins.item:bash': view => view === 'summary' ? 'Limits every command.' : <form aria-label="bash form" />,
      'plugins.bundle.config:qilin-better-sidebar': view => view === 'page' ? <form aria-label="sidebar form" /> : null,
      'plugins.row.config:qilin-better-sidebar#sidebar': view => view === 'summary' ? 'The sidebar row.' : <form aria-label="row form" />,
    }

    it('lists an official plugin after the official bundles with its summary, and opens its page', () => {
      renderTab(
        { packages: [pkg({ name: '@qilin/experimental-agent-team-profile', installed: false, optional: true, enabled: false })] },
        { items: [{ id: 'bash', label: 'Shell' }] },
        bodies,
      )
      const official = document.querySelector('[data-plugin-group="official"]') as HTMLElement
      expect(within(official).getAllByRole('listitem').map(card => card.getAttribute('data-plugin-item') ?? card.getAttribute('data-plugin-package')))
        .toEqual(['@qilin/experimental-agent-team-profile', 'bash'])
      expect(document.querySelector('[data-plugin-count]')?.textContent).toBe('2')
      expect(within(official).getByText('Limits every command.')).toBeTruthy()
      // An official plugin has no switch of its own: the Host composes it.
      expect(within(official).queryByRole('switch', { name: en.enableToggle.replace('{name}', 'Shell') })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'Shell') }))
      const detail = document.querySelector('[data-plugin-item-detail="bash"]') as HTMLElement
      expect(within(detail).getByRole('heading', { level: 3 }).textContent).toBe('Shell')
      expect(within(detail).getByText('Limits every command.')).toBeTruthy()
      expect(within(detail).getByRole('form', { name: 'bash form' })).toBeTruthy()
      fireEvent.click(within(detail).getByRole('button', { name: en.backToList }))
      expect(document.querySelector('[data-plugin-item-detail]')).toBeNull()
      expect(screen.getByRole('heading', { name: en.officialTitle })).toBeTruthy()
    })

    it('counts an official plugin as content: the empty line waits for a page with nothing at all', () => {
      renderTab({ packages: [] }, { items: [{ id: 'bash', label: 'Shell' }] }, bodies)
      expect(screen.queryByText(en.empty)).toBeNull()
      expect(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'Shell') })).toBeTruthy()
    })

    it('renders a bundle\'s own configuration on its page, and no configure control on a row without one', () => {
      renderTab({ packages: [pkg({ rows: [row()] })] }, { bundles: new Set(['qilin-better-sidebar']) }, bodies)
      fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'better-sidebar') }))
      const detail = document.querySelector('[data-plugin-detail]') as HTMLElement
      expect(within(detail).getByRole('form', { name: 'sidebar form' })).toBeTruthy()
      expect(within(detail).queryByRole('button', { name: en.configureRow.replace('{name}', 'sidebar') })).toBeNull()
    })

    it('opens a row\'s configuration page from its configure control and leads back to the bundle', () => {
      const theme = row({ rowId: 'theme', moduleName: 'qilin-better-sidebar/theme', entryId: 'include:theme' as PluginEntryId })
      renderTab({ packages: [pkg({ rows: [row(), theme] })] }, { rows: new Set(['qilin-better-sidebar#sidebar']) }, bodies)
      fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'better-sidebar') }))
      expect(screen.queryByRole('button', { name: en.configureRow.replace('{name}', 'theme') })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: en.configureRow.replace('{name}', 'sidebar') }))
      const page = document.querySelector('[data-plugin-row-detail="qilin-better-sidebar#sidebar"]') as HTMLElement
      expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe('sidebar')
      expect(within(page).getByText('qilin-better-sidebar')).toBeTruthy()
      expect(within(page).getByText('The sidebar row.')).toBeTruthy()
      expect(within(page).getByRole('form', { name: 'row form' })).toBeTruthy()
      fireEvent.click(within(page).getByRole('button', { name: en.backToPackage.replace('{name}', 'better-sidebar') }))
      expect(document.querySelector('[data-plugin-row-detail]')).toBeNull()
      expect(document.querySelector('[data-plugin-detail="qilin-better-sidebar"]')).toBeTruthy()
    })
  })

  it('preserves metadata for another scope with the same short name', () => {
    const name = '@acme/qilin-experimental-agent-team-profile'
    const { setLanguage } = renderTab({ packages: [pkg({ name, description: 'Third-party description.' })] })
    setLanguage(zh)
    fireEvent.click(screen.getByRole('button', { name: zh.openDetail.replace('{name}', 'experimental-agent-team-profile') }))
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('experimental-agent-team-profile')
    expect(screen.getByText('Third-party description.')).toBeTruthy()
    expect(document.querySelector('[data-plugin-name]')?.textContent).toBe(name)
  })

  it('opens a guide under the field and drops an example into it', () => {
    const { actions } = renderTab({ install: { ...IDLE_INSTALL, open: true } })
    expect(screen.queryByText(en.installGuideIntro)).toBeNull()
    const toggle = screen.getByRole('button', { name: en.installGuideToggle })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: en.installGuideHide }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(en.installGuideIdNote)).toBeTruthy()
    expect(screen.getByText(en.installGuideGitExample)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.installGuideFillAria.replace('{example}', en.installGuideIdExample) }))
    expect(actions.editInstallSpec).toHaveBeenCalledExactlyOnceWith(en.installGuideIdExample)
    fireEvent.click(screen.getByRole('button', { name: en.installGuideHide }))
    expect(screen.queryByText(en.installGuideIntro)).toBeNull()
  })

  it('opens a bundle\'s page with its facts and rows, and uninstalls from it', () => {
    const { actions, set } = renderTab({
      packages: [pkg({
        description: 'A sidebar.',
        rows: [row(), row({ rowId: 'theme', moduleName: 'qilin-better-sidebar/theme', entryId: 'include:theme' as PluginEntryId, enabled: false, phase: null })],
      })],
    })
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'better-sidebar') }))
    const detail = document.querySelector('[data-plugin-detail="qilin-better-sidebar"]') as HTMLElement
    expect(within(detail).getByRole('heading', { level: 3 }).textContent).toBe('better-sidebar')
    // The version sits beside the name as a tag; the crumb only leads back.
    expect(within(detail).getByText('v0.16.0')).toBeTruthy()
    // The full package name stays visible under the short name.
    expect(document.querySelector('[data-plugin-name]')?.textContent).toBe('qilin-better-sidebar')
    expect(within(detail).getByRole('button', { name: en.backToList }).textContent).toBe(en.crumbRoot)
    expect(within(detail).getByText('A sidebar.')).toBeTruthy()
    // The rows, in order, with their state and their module.
    const rows = within(detail).getAllByRole('listitem').filter(item => item.hasAttribute('data-plugin-row'))
    expect(rows.map(item => item.getAttribute('data-plugin-row'))).toEqual(['include:sidebar', 'include:theme'])
    expect(rows[1]?.getAttribute('data-state')).toBe('off')
    expect(within(detail).getByText(en.partsCountTotal.replace('{count}', '2'), { exact: false })).toBeTruthy()
    expect(within(detail).getByText('qilin-better-sidebar/theme')).toBeTruthy()
    expect(within(detail).getByText(en.rowPhaseActive)).toBeTruthy()
    expect(within(detail).getByText(en.partOff)).toBeTruthy()
    fireEvent.click(within(detail).getByRole('button', { name: en.uninstallLabel.replace('{name}', 'better-sidebar') }))
    expect(actions.uninstall).toHaveBeenCalledWith('qilin-better-sidebar')
    fireEvent.click(within(detail).getByRole('switch', { name: en.enableToggle.replace('{name}', 'better-sidebar') }))
    expect(actions.setEnabled).toHaveBeenCalledWith('qilin-better-sidebar', false)
    // A problem and a protection the Host reports read on the page in the dictionary's words; the page leaves with the crumb.
    set({ packages: [pkg({ error: { code: 'operation-error', diagnostic: 'unreadable' }, readOnlyReason: 'management-required' })] })
    expect(within(detail).getByText(`${en.reasonLabel}: unreadable`)).toBeTruthy()
    expect(within(detail).getByText(en.reasonManagementRequired)).toBeTruthy()
    expect(within(detail).getByRole('button', { name: en.uninstallLabel.replace('{name}', 'better-sidebar') })).toHaveProperty('disabled', true)
    expect(within(detail).getByText(en.partsEmpty)).toBeTruthy()
    set({ packages: [pkg({ error: { code: 'not-bundle' } })] })
    expect(within(detail).getByText(`${en.reasonLabel}: ${en.reasonNotBundle}`)).toBeTruthy()
    set({ packages: [pkg({ error: { code: 'operation-error' } })] })
    expect(within(detail).getByText(`${en.reasonLabel}: ${en.reasonOperationError}`)).toBeTruthy()
    // An incompatibility reads from its structured packages in the dictionary's words, one sentence per package.
    set({ packages: [pkg({ error: { code: 'incompatible-version', incompatible: [INCOMPATIBLE, { ...INCOMPATIBLE, name: 'other' }] } })] })
    expect(within(detail).getByText(`${en.reasonLabel}: ${incompatibleText()} ${incompatibleText('other')}`)).toBeTruthy()
    set({ packages: [pkg({ error: { code: 'incompatible-version' } })] })
    expect(within(detail).getByText(`${en.reasonLabel}: ${en.reasonIncompatibleVersionUnnamed}`)).toBeTruthy()
    fireEvent.click(within(detail).getByRole('button', { name: en.backToList }))
    expect(document.querySelector('[data-plugin-detail]')).toBeNull()
    // A bundle without a description or a version says so; one that leaves the list drops back to the cards.
    const { version: _version, ...unversioned } = pkg()
    set({ packages: [unversioned] })
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'better-sidebar') }))
    expect(screen.getByText(en.noDescription)).toBeTruthy()
    expect(screen.queryByText(en.versionTag.replace('{version}', '0.16.0'))).toBeNull()
    set({ packages: [] })
    expect(document.querySelector('[data-plugin-detail]')).toBeNull()
    expect(screen.getByText(en.empty)).toBeTruthy()
  })

  it('switches the rows of a bundle that is on, filters a long list, and locks what the Host will not address', () => {
    const rows = Array.from({ length: 12 }, (_row, index): PackageRow => {
      const live = row({
        rowId: `row-${String(index)}`, entryId: `include:row-${String(index)}` as PluginEntryId,
        ...index === 1 ? { readOnlyReason: 'unaddressable' as const } : {},
        ...index === 3 ? { phase: 'failed' as const } : {},
        ...index === 4 ? { phase: 'loading' as const } : {},
      })
      if (index !== 2) return live
      // The third row has no live entry: nothing to switch.
      const { entryId: _entryId, ...unmounted } = live
      return { ...unmounted, enabled: false, phase: null }
    })
    const { actions, set } = renderTab({ packages: [pkg({ rows })], busy: [rowKey('include:row-5')] })
    fireEvent.click(screen.getByRole('button', { name: en.openDetail.replace('{name}', 'better-sidebar') }))
    const detail = document.querySelector('[data-plugin-detail]') as HTMLElement
    expect(within(detail).getByText(`${en.partsCountTotal.replace('{count}', '12')} · ${en.partsCountRunning.replace('{count}', '9')} · ${en.partsCountOff.replace('{count}', '1')} · ${en.partsCountFailed.replace('{count}', '1')}`)).toBeTruthy()
    fireEvent.click(within(detail).getByRole('switch', { name: en.partToggle.replace('{name}', 'row-0') }))
    expect(actions.setRowEnabled).toHaveBeenCalledWith('include:row-0', false)
    // A protected row, a row without a live entry, and a row with a write in flight cannot be switched.
    const locked = within(detail).getByRole('switch', { name: en.partToggle.replace('{name}', 'row-1') })
    expect(locked).toHaveProperty('disabled', true)
    expect(locked.getAttribute('title')).toBe(en.reasonUnaddressable)
    expect(within(detail).getByRole('switch', { name: en.partToggle.replace('{name}', 'row-2') })).toHaveProperty('disabled', true)
    fireEvent.click(within(detail).getByRole('switch', { name: en.partToggle.replace('{name}', 'row-2') }))
    expect(actions.setRowEnabled).toHaveBeenCalledTimes(1)
    expect(within(detail).getByRole('switch', { name: en.partToggle.replace('{name}', 'row-5') })).toHaveProperty('disabled', true)
    expect(within(detail).getByText(en.rowPhaseFailed)).toBeTruthy()
    expect(within(detail).getByText(en.rowPhaseLoading)).toBeTruthy()
    expect(document.querySelector('[data-plugin-row="include:row-3"]')?.getAttribute('data-state')).toBe('failed')
    // A long list gets a filter; nothing matching says so.
    const filter = within(detail).getByRole('searchbox', { name: en.partsFilter })
    fireEvent.change(filter, { target: { value: 'ROW-1' } })
    expect(within(detail).getAllByRole('listitem').filter(item => item.hasAttribute('data-plugin-row'))).toHaveLength(3)
    fireEvent.change(filter, { target: { value: 'nothing' } })
    expect(within(detail).getByText(en.partsFilterEmpty)).toBeTruthy()
    fireEvent.change(filter, { target: { value: '' } })
    // A bundle that is off shows its rows without switches.
    set({ packages: [pkg({ enabled: false, rows: rows.slice(0, 2).map(item => ({ ...item, enabled: false, phase: null })) })] })
    expect(within(detail).queryByRole('switch', { name: en.partToggle.replace('{name}', 'row-0') })).toBeNull()
    expect(within(detail).getAllByText(en.partOff)).toHaveLength(2)
    // A row without a fiber, on a bundle that is on, reads idle.
    set({ packages: [pkg({ rows: [row({ phase: null })] })] })
    expect(within(detail).getByText(en.rowStateIdle)).toBeTruthy()
  })

  it('takes a spec, checks it, and words what the check refused', () => {
    const { actions, set } = renderTab({ install: { ...IDLE_INSTALL, open: true } })
    expect(screen.getByText(en.installDescription)).toBeTruthy()
    const install = () => screen.getByRole('button', { name: en.installRun })
    expect(install()).toHaveProperty('disabled', true)
    const field = screen.getByRole('textbox', { name: en.installSpecLabel })
    fireEvent.change(field, { target: { value: 'qilin-x' } })
    expect(actions.editInstallSpec).toHaveBeenCalledWith('qilin-x')
    expect(document.querySelector('[data-terminal]')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()

    set({ install: { ...IDLE_INSTALL, open: true, spec: ' qilin-x ' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: en.installSpecLabel }), { key: 'Enter' })
    fireEvent.click(install())
    expect(actions.runInstall).toHaveBeenCalledTimes(2)
    // The check keeps the field and the button inert.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'checking' } })
    expect(screen.getByRole('textbox', { name: en.installSpecLabel })).toHaveProperty('disabled', true)
    const checking = screen.getByRole('button', { name: en.installChecking })
    expect(checking).toHaveProperty('disabled', true)
    fireEvent.keyDown(screen.getByRole('textbox', { name: en.installSpecLabel }), { key: 'Enter' })
    expect(actions.runInstall).toHaveBeenCalledTimes(2)

    // Each refusal reads under the field.
    const problems: [string, string][] = [
      ['invalid-spec', en.installProblemInvalid.replace('{reason}', 'r')],
      ['already-installed', en.installProblemInstalled],
      ['not-found', en.installProblemNotFound],
      ['not-a-package', en.installProblemNotPackage],
      ['not-a-bundle', en.installProblemNotBundle.replace('{reason}', 'r')],
      ['network', en.installProblemNetwork],
      ['unknown', en.installProblemUnknown.replace('{reason}', 'r')],
    ]
    for (const [problem, sentence] of problems) {
      set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', inputError: { problem: problem as never, reason: 'r' } } })
      expect(screen.getByRole('alert').textContent).toBe(sentence)
      expect(screen.getByRole('textbox', { name: en.installSpecLabel }).getAttribute('aria-invalid')).toBe('true')
    }
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(actions.closeInstall).toHaveBeenCalledTimes(1)
  })

  it('shows the subject while installing, folds the pnpm output behind the details, and stops through the Host', () => {
    const subject = { spec: 'qilin-x', status: 'accepted', kind: 'registry', name: 'qilin-x', version: '1.4.2', description: 'A sidebar.', bundle: true, registry: null } as const
    const run = { jobId: 'j1', command: 'pnpm add qilin-x', cwd: '/home/u/.qilin/profiles/web', output: 'Progress: resolved \x1b[96m1\x1b[39m\n' }
    const { actions, set } = renderTab({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'running', subject, runs: [run] } })
    expect(screen.getByRole('status').textContent).toBe(en.installingTitle)
    expect(screen.getByText('qilin-x')).toBeTruthy()
    expect(screen.getByText('A sidebar.')).toBeTruthy()
    expect(screen.getByText(en.installVersion.replace('{version}', '1.4.2'))).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    // The output stays folded until asked for.
    expect(document.querySelector('[data-terminal]')).toBeNull()
    const details = screen.getByRole('button', { name: en.installDetailsShow })
    expect(details.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(details)
    expect(actions.toggleInstallDetails).toHaveBeenCalledTimes(1)
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'running', subject, runs: [run], detailsOpen: true } })
    expect(screen.getByRole('button', { name: en.installDetailsHide }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(en.installLocation.replace('{dir}', '/home/u/.qilin/profiles/web'))).toBeTruthy()
    // The run streams as a terminal: its command line, its coloured output so far, the running label.
    expect(screen.getByText('pnpm add qilin-x')).toBeTruthy()
    const terminal = document.querySelector('[data-terminal]') as HTMLElement
    expect(terminal.hasAttribute('data-running')).toBe(true)
    expect(within(terminal).getByText('1').getAttribute('style')).toContain('--dsw-static-blue-500')
    expect(within(terminal).getByText(en.terminalRunning)).toBeTruthy()
    // A long log folds its middle behind an expand control, so the dialog keeps its height while pnpm talks.
    const lines = Array.from({ length: 15 }, (_line, index) => `line ${String(index + 1)}`).join('\n')
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'running', subject, detailsOpen: true, runs: [{ ...run, output: `${lines}\n` }] } })
    expect(screen.queryByText('line 8')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.terminalExpandAria.replace('{n}', '3') }))
    expect(screen.getByText('line 8')).toBeTruthy()
    // Before the first chunk there is no location to name.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'running', subject, detailsOpen: true } })
    expect(screen.getByText(en.terminalNoOutput)).toBeTruthy()
    // Cancel and the back control each ask the Host to stop the run; the close control asks too, and closes once the Host confirms.
    fireEvent.click(screen.getByRole('button', { name: en.installCancel }))
    fireEvent.click(screen.getByRole('button', { name: en.installEditAria }))
    expect(actions.cancelInstall).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: en.close })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.installCloseCancels }))
    expect(actions.cancelInstallAndClose).toHaveBeenCalledOnce()
    expect(actions.closeInstall).not.toHaveBeenCalled()
  })

  it('waits with the Host through starting, stopping, and applying, and words an unconfirmed stop', () => {
    const subject = { spec: 'slow', status: 'accepted', kind: 'registry', name: 'slow', bundle: true, registry: null } as const
    const { actions, set } = renderTab({ install: { ...IDLE_INSTALL, open: true, spec: 'slow', phase: 'starting', subject } })
    // Before the Host acknowledges the run there is nothing to stop: cancel, back, and close all wait.
    expect(screen.getByRole('status').textContent).toBe(en.installStarting)
    expect(screen.getByRole('button', { name: en.installCancel })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.installEditAria })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.close })).toHaveProperty('disabled', true)
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'slow', phase: 'running', subject } })
    fireEvent.click(screen.getByRole('button', { name: en.installCancel }))
    fireEvent.click(screen.getByRole('button', { name: en.installEditAria }))
    expect(actions.cancelInstall).toHaveBeenCalledTimes(2)
    // While the Host stops the run the terminal reads as cancelled rather than failed.
    set({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'slow', phase: 'cancelling', subject, detailsOpen: true,
        runs: [{ jobId: 'j', command: 'pnpm add slow', cwd: '/p', output: '', exitCode: null }],
      },
    })
    expect(screen.getByRole('status').textContent).toBe(en.installCancelling)
    expect(screen.getByRole('button', { name: en.installCancelling })).toHaveProperty('disabled', true)
    expect(within(document.querySelector('[data-terminal]') as HTMLElement).getByText(en.installCancelledShort)).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'slow', phase: 'applying', subject } })
    expect(screen.getByRole('status').textContent).toBe(en.installApplying)
    expect(screen.getByRole('button', { name: en.installCancel })).toHaveProperty('disabled', true)
    // A stop the Host could not confirm says so over the running screen.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'slow', phase: 'running', subject, failure: { reason: 'offline', cancelUnconfirmed: true } } })
    expect(screen.getByRole('alert').textContent).toContain('offline')
    expect(screen.getByRole('button', { name: en.installCancel })).toHaveProperty('disabled', false)
  })

  it('offers to enable what a finished install added, and says when it waits for a restart', () => {
    const subject = { spec: '/plugins/qilin-x', status: 'accepted', kind: 'path', name: 'qilin-x', bundle: true, registry: null } as const
    const { actions, set } = renderTab({
      install: {
        ...IDLE_INSTALL,
        open: true,
        spec: '/plugins/qilin-x',
        phase: 'done',
        subject,
        runs: [{ jobId: 'j1', command: 'pnpm add /plugins/qilin-x', cwd: '/p', output: 'Done in 1s\n', exitCode: 0 }],
        installed: 'qilin-x',
      },
    })
    expect(screen.getByText(en.installedTitle)).toBeTruthy()
    // A path without a description reads by its kind.
    expect(screen.getByText('qilin-x')).toBeTruthy()
    expect(screen.getByText(en.installSubjectPath)).toBeTruthy()
    expect(screen.queryByText(en.installDoneRestart)).toBeNull()
    // No way back to the spec from here; enabling is the one action.
    expect(screen.queryByRole('button', { name: en.installEditAria })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.installEnableNow }))
    expect(actions.enableInstalled).toHaveBeenCalledTimes(1)
    set({ install: { ...IDLE_INSTALL, open: true, spec: '/plugins/qilin-x', phase: 'done', subject, installed: 'qilin-x', restartRequired: true, enabling: true } })
    expect(screen.getByRole('button', { name: en.installEnableNow })).toHaveProperty('disabled', true)
    expect(screen.getByText(en.installDoneRestart)).toBeTruthy()

    // A run that named no bundle leaves only Done.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'done', subject: { spec: 'qilin-x', status: 'accepted', kind: 'registry', name: 'qilin-x', bundle: true, registry: null } } })
    expect(screen.getByText(en.installDoneNothing)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.installEnableNow })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.installClose }))
    expect(actions.closeInstall).toHaveBeenCalledTimes(1)
  })

  it('asks to allow the scripts a blocked install left pending, retries with them, and says what was allowed', () => {
    const subject = { spec: 'qilin-x', status: 'accepted', kind: 'registry', name: 'qilin-x', bundle: true, registry: null } as const
    const { actions, set } = renderTab({
      install: {
        ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'failed', subject,
        failure: { reason: 'ERR', kind: 'build-blocked', pendingBuilds: ['native', '@scope/other'] },
      },
    })
    expect(screen.getByText(en.installFailureBuildBlocked)).toBeTruthy()
    const group = screen.getByRole('group', { name: en.installApprovalTitle })
    expect(within(group).getByText('native')).toBeTruthy()
    expect(within(group).getByText('@scope/other')).toBeTruthy()
    expect(within(group).getByText(en.installApprovalCaution)).toBeTruthy()
    // Plain retry would fail the same way, so only the approval is offered.
    expect(screen.queryByRole('button', { name: en.installRetry })).toBeNull()
    fireEvent.click(within(group).getByRole('button', { name: en.installApproveAndRetry }))
    expect(actions.approveBuildsAndRetry).toHaveBeenCalledTimes(1)
    // Without the pending names the failure reads as the manual instruction, and plain retry is back.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'failed', subject, failure: { reason: 'ERR', kind: 'build-blocked' } } })
    expect(screen.getByText(en.installFailureBuildBlockedManual)).toBeTruthy()
    expect(screen.queryByRole('group', { name: en.installApprovalTitle })).toBeNull()
    expect(screen.getByRole('button', { name: en.installRetry })).toBeTruthy()
    // The installed screen says which scripts were allowed.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'qilin-x', phase: 'done', subject, installed: 'qilin-x', approvedBuilds: ['native'] } })
    expect(screen.getByText(en.installDoneApproved.replace('{names}', 'native'))).toBeTruthy()
  })

  it('words a failed install by its kind, else in the Host\'s words, and retries it', () => {
    const subject = { spec: 'github:a/b', status: 'accepted', kind: 'git', bundle: null, registry: null } as const
    const { actions, set } = renderTab({
      install: {
        ...IDLE_INSTALL,
        open: true,
        spec: 'github:a/b',
        phase: 'failed',
        subject,
        detailsOpen: true,
        runs: [{ jobId: 'j1', command: 'pnpm add github:a/b', cwd: '/p', output: 'ERR\n', exitCode: 1 }],
        failure: { reason: 'ERR\n', kind: 'network' },
      },
    })
    expect(screen.getByRole('alert').textContent).toBe(en.installFailedTitle)
    expect(screen.getByText(en.installFailureNetwork)).toBeTruthy()
    // A git spec without a manifest reads by its address and kind.
    expect(screen.getByText('github:a/b')).toBeTruthy()
    expect(screen.getByText(en.installSubjectGit)).toBeTruthy()
    expect(screen.getByText(en.terminalExitCode.replace('{code}', '1'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.installRetry }))
    expect(actions.runInstall).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: en.installEditAria }))
    expect(actions.cancelInstall).toHaveBeenCalledTimes(1)

    const kinds: [string, string][] = [
      ['pnpm-missing', en.installFailurePnpmMissing], ['timeout', en.installFailureTimeout],
      ['not-found', en.installFailureNotFound], ['no-matching-version', en.installFailureNoMatchingVersion],
      ['disk-full', en.installFailureDiskFull], ['permission', en.installFailurePermission],
      ['build-blocked', en.installFailureBuildBlockedManual], ['integrity', en.installFailureIntegrity], ['unknown', en.installFailureGeneric],
    ]
    for (const [kind, sentence] of kinds) {
      set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: 'r', kind: kind as never } } })
      expect(screen.getByText(sentence)).toBeTruthy()
    }
    // A failure without a kind reads by its code, else in the Host's words; without words, or without a failure at all, generically.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: '', code: 'not-bundle' } } })
    expect(screen.getByText(en.reasonNotBundle)).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: 'ERR_PNPM_ADDING_TO_ROOT', code: 'operation-error' } } })
    expect(screen.getByText('ERR_PNPM_ADDING_TO_ROOT')).toBeTruthy()
    // A compatibility refusal outranks the kind pnpm's exit was classified as.
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed',
      failure: { reason: '', code: 'incompatible-version', incompatible: [INCOMPATIBLE], kind: 'unknown' } } })
    expect(screen.getByText(incompatibleText())).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: '', code: 'incompatible-version' } } })
    expect(screen.getByText(en.reasonIncompatibleVersionUnnamed)).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: 'the transport said so' } } })
    expect(screen.getByText('the transport said so')).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: { reason: '' } } })
    expect(screen.getByText(en.installFailureGeneric)).toBeTruthy()
    set({ install: { ...IDLE_INSTALL, open: true, spec: 'x', phase: 'failed', failure: null } })
    expect(screen.getByText(en.installFailureGeneric)).toBeTruthy()
    // A tarball spec reads by its kind too.
    set({ install: { ...IDLE_INSTALL, open: true, spec: '/p/x.tgz', phase: 'failed', subject: { spec: '/p/x.tgz', status: 'accepted', kind: 'tarball', bundle: null, registry: null }, failure: null } })
    expect(screen.getByText(en.installSubjectTarball)).toBeTruthy()
  })

  it('scrolls to and marks the package an install enabled, then lets the mark go', () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true })
    try {
      const { actions, set } = renderTab({ packages: [pkg()] })
      // A package the list does not show has nothing to scroll to; the mark still times out.
      set({ highlight: 'missing' })
      expect(scrollIntoView).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2_400) })
      expect(actions.clearHighlight).toHaveBeenCalledTimes(1)
      set({ highlight: 'qilin-better-sidebar' })
      expect(document.querySelector('[data-plugin-package="qilin-better-sidebar"]')?.hasAttribute('data-plugin-highlight')).toBe(true)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
      act(() => { vi.advanceTimersByTime(2_400) })
      expect(actions.clearHighlight).toHaveBeenCalledTimes(2)
      set({ highlight: null })
      expect(document.querySelector('[data-plugin-package="qilin-better-sidebar"]')?.hasAttribute('data-plugin-highlight')).toBe(false)
    } finally {
      if (descriptor === undefined) delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
      else Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor)
      vi.useRealTimers()
    }
  })

  it('marks a card without a scrollIntoView to call', () => {
    vi.useFakeTimers()
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    try {
      const { set } = renderTab({ packages: [pkg()] })
      set({ highlight: 'qilin-better-sidebar' })
      expect(document.querySelector('[data-plugin-package="qilin-better-sidebar"]')?.hasAttribute('data-plugin-highlight')).toBe(true)
    } finally {
      if (descriptor !== undefined) Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor)
      vi.useRealTimers()
    }
  })

  it('confirms an uninstall by the package\'s title and runs the action through it', () => {
    const { actions, set } = renderTab({
      packages: [pkg(), pkg({ name: 'qilin-other' })],
      confirm: { action: 'uninstall', packageName: 'qilin-better-sidebar' },
    })
    expect(screen.getByRole('dialog', { name: en.confirmUninstallTitle.replace('{name}', 'better-sidebar') })).toBeTruthy()
    expect(screen.getByText(en.confirmUninstallDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(actions.cancelConfirm).toHaveBeenCalledTimes(1)
    set({ confirm: { action: 'uninstall', packageName: 'qilin-other' } })
    expect(screen.getByRole('dialog', { name: en.confirmUninstallTitle.replace('{name}', 'other') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.confirmUninstall }))
    expect(actions.confirm).toHaveBeenCalledTimes(1)
  })

  it('words every notice as a toast that dismisses itself', () => {
    vi.useFakeTimers()
    try {
      const { actions, set } = renderTab({ notice: { kind: 'restart', packageName: 'x', seq: 1 } })
      expect(screen.getByRole('alert').textContent).toContain(en.restartNotice)
      set({ notice: { kind: 'overridden', packageName: 'pkg-1', seq: 2 } })
      expect(screen.getByRole('alert').textContent).toContain(en.overriddenNotice.replace('{name}', 'pkg-1'))
      set({ notice: { kind: 'cancelled', seq: 3 } })
      expect(screen.getByRole('alert').textContent).toContain(en.installCancelled)
      // A failure names what was being done; a refusal is worded by its code, a silent one generically.
      set({ notice: { kind: 'failed', action: 'enable', reason: 'the tree rejected it', packageName: 'pkg-1', seq: 4 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedEnable.replace('{reason}', 'the tree rejected it'))
      set({ notice: { kind: 'failed', action: 'uninstall', code: 'bundle-in-use', reason: '', packageName: 'pkg-1', seq: 5 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedUninstall.replace('{reason}', en.reasonBundleInUse))
      set({ notice: { kind: 'failed', action: 'enable', code: 'incompatible-version', incompatible: [INCOMPATIBLE], reason: '', packageName: 'pkg-1', seq: 5 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedEnable.replace('{reason}', incompatibleText()))
      set({ notice: { kind: 'failed', action: 'rowDisable', code: 'operation-error', reason: 'EACCES', packageName: 'pkg-1', seq: 6 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedRowDisable.replace('{reason}', 'EACCES'))
      set({ notice: { kind: 'failed', action: 'disable', reason: '', packageName: 'pkg-1', seq: 7 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedDisable.replace('{reason}', en.reasonOperationError))
      set({ notice: { kind: 'failed', action: 'rowEnable', reason: 'x', packageName: 'pkg-1', seq: 8 } })
      expect(screen.getByRole('alert').textContent).toContain(en.failedRowEnable.replace('{reason}', 'x'))
      // No button to press: the toast retires on its own and the store forgets it.
      expect(screen.queryByRole('button', { name: /got it/i })).toBeNull()
      expect(actions.dismissNotice).not.toHaveBeenCalled()
      // The hold grows with the text, up to eight seconds, then the fade.
      act(() => { vi.advanceTimersByTime(8_000 + 1_000) })
      expect(actions.dismissNotice).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('checks for updates from the toolbar and lists the layers with a newer version', () => {
    const { actions, set } = renderTab()
    // The check block is absent until the toolbar asks for one.
    expect(document.querySelector('[data-plugin-updates]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.checkUpdates }))
    expect(actions.checkUpdates).toHaveBeenCalledTimes(1)
    set({ updates: { status: 'checking', entries: [], reason: '' } })
    expect(screen.getByText(en.updatesChecking)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.checkUpdates })).toHaveProperty('disabled', true)
    set({ updates: { status: 'ready', entries: [], reason: '' } })
    expect(screen.getByText(en.updatesCurrent)).toBeTruthy()
    set({ updates: { status: 'failed', entries: [], reason: 'offline' } })
    expect(screen.getByRole('alert').textContent).toBe(en.updatesFailed.replace('{reason}', 'offline'))
    set({
      busy: ['qilin-better-sidebar'],
      updates: {
        status: 'ready',
        reason: '',
        entries: [
          { name: 'qilin-better-sidebar', currentVersion: '0.16.0', latestVersion: '0.17.0' },
          { name: 'qilin-unknown', currentVersion: null, latestVersion: '2.0.0' },
        ],
      },
    })
    expect(screen.getByText(en.updatesVersions.replace('{current}', '0.16.0').replace('{latest}', '0.17.0'))).toBeTruthy()
    expect(screen.getByText(en.updatesVersions.replace('{current}', en.versionUnknown).replace('{latest}', '2.0.0'))).toBeTruthy()
    expect(screen.getByRole('button', { name: en.updateLabel.replace('{name}', 'qilin-better-sidebar') })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: en.updateLabel.replace('{name}', 'qilin-unknown') }))
    expect(actions.updatePackage).toHaveBeenCalledExactlyOnceWith('qilin-unknown')
    fireEvent.click(screen.getByRole('button', { name: en.updatesClose }))
    expect(actions.dismissUpdates).toHaveBeenCalledTimes(1)
  })

  it('searches the plugin catalog and hands a repository to the install dialog', () => {
    const { actions, set } = renderTab()
    const panel = document.querySelector('[data-plugin-catalog]') as HTMLElement
    expect(screen.getByText(en.catalogIdle)).toBeTruthy()
    const search = within(panel).getByRole('searchbox', { name: en.catalogSearchLabel })
    fireEvent.change(search, { target: { value: 'sidebar' } })
    fireEvent.submit(search.closest('form') as HTMLFormElement)
    expect(actions.catalog).toHaveBeenCalledExactlyOnceWith('sidebar', 1)
    set({ catalog: { status: 'searching', query: 'sidebar', page: 1, entries: [], hasMore: false, reason: '' } })
    expect(screen.getByText(en.catalogSearching)).toBeTruthy()
    set({ catalog: { status: 'ready', query: 'sidebar', page: 1, entries: [], hasMore: false, reason: '' } })
    expect(screen.getByText(en.catalogEmpty)).toBeTruthy()
    set({ catalog: { status: 'failed', query: 'sidebar', page: 1, entries: [], hasMore: false, reason: 'offline' } })
    expect(screen.getByRole('alert').textContent).toBe(en.catalogFailed.replace('{reason}', 'offline'))
    set({
      catalog: {
        status: 'ready', query: 'sidebar', page: 1, hasMore: true, reason: '',
        entries: [
          { fullName: 'acme/qilin-remote', description: 'A remote.', stars: 12, updatedAt: '2025-01-02T03:04:05Z', url: 'https://github.com/acme/qilin-remote' },
          { fullName: 'acme/qilin-bare', description: null, stars: 0, updatedAt: '', url: 'https://github.com/acme/qilin-bare' },
        ],
      },
    })
    const link = within(panel).getByRole('link', { name: en.catalogOpen.replace('{name}', 'acme/qilin-remote') })
    expect(link.getAttribute('href')).toBe('https://github.com/acme/qilin-remote')
    expect(within(panel).getByText('A remote.')).toBeTruthy()
    expect(within(panel).getByText(en.catalogStars.replace('{count}', '12'))).toBeTruthy()
    expect(within(panel).getByText(en.catalogStars.replace('{count}', '0'))).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: en.catalogInstallLabel.replace('{name}', 'acme/qilin-remote') }))
    expect(actions.installCatalogSpec).toHaveBeenCalledExactlyOnceWith('https://github.com/acme/qilin-remote')
    fireEvent.click(within(panel).getByRole('button', { name: en.catalogMore }))
    expect(actions.catalog).toHaveBeenLastCalledWith('sidebar', 2)
  })
})
