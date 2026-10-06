/**
 * The manager store: what it reads, how actions cross the wire, which
 * outcomes become toasts, and how the install run folds its output.
 */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type {
  BundleInfo, ChangeResult, CommunityPluginEntry, CommunityPluginSnapshot, ManagementError, PluginEntryId, PluginInfo,
  PluginInstallRequestId, PluginUpdateSnapshot,
} from '@qilin/api-remotes/client'
import { RemoteError } from '@qilin/client-test-runtime'
import type { HostObservable } from '@qilin/client-ui-slots'
import type { ConfigLedger } from '../src/client/config-ledger.ts'
import {
  asksMirror, githubRecoveryRegistry, offeredRegistries, packageView, PluginManagerController, registryKey, rowKey, sortPackages, updatable,
  type InstallState,
} from '../src/client/manager-store.ts'

const INCOMPATIBLE = { name: 'qilin-late', version: '2.0.0', runtimeVersion: '0.1.0', peers: { '@qilin/session': '^0.2.0' } }
const ROW_ENTRY = 'include:sidebar' as PluginEntryId

const BUNDLE: BundleInfo = {
  name: 'qilin-better-sidebar',
  version: '0.16.0',
  description: 'A sidebar.',
  enabled: false,
  installed: true,
  optional: false,
  audience: 'both',
  updatable: true,
  removable: true,
  rows: [{ rowId: 'sidebar', moduleName: 'qilin-better-sidebar', entryId: ROW_ENTRY }, { rowId: 'theme', moduleName: 'qilin-better-sidebar/theme' }],
  overrides: [],
}

const PLUGINS: PluginInfo[] = [
  { entryId: ROW_ENTRY, moduleName: 'qilin-better-sidebar', enabled: true, fiberPhase: 'active', patchId: 'sidebar' },
  { entryId: 'include:core' as PluginEntryId, moduleName: '@qilin/base', enabled: true, fiberPhase: 'active', readOnlyReason: 'management-required' },
]

/** What the check answers for a registry name. */
const INSPECTED = { status: 'accepted' as const, kind: 'registry' as const, name: 'qilin-better-sidebar', version: '1.0.0', bundle: true, registry: null }

/** What the Host answers for the registries it asks, and the fastest one it probed. */
const REGISTRIES = { registry: null, fallbackRegistries: [], resolved: 'https://registry.npmjs.org/' }

const FIRST: CommunityPluginEntry = {
  fullName: 'acme/qilin-remote', description: 'A remote.', stars: 12, updatedAt: '2025-01-02T03:04:05Z', url: 'https://github.com/acme/qilin-remote',
}

const SECOND: CommunityPluginEntry = {
  fullName: 'acme/qilin-tool', description: null, stars: 1, updatedAt: '', url: 'https://github.com/acme/qilin-tool',
}

const APPLIED: ChangeResult = { changed: true, application: 'applied', stage: 'enable', target: 'qilin-better-sidebar' }

/** A change the Host could not apply, with the refusal it names. */
function failed(error?: ManagementError, packageResult?: ChangeResult['packageResult']): ChangeResult {
  return {
    changed: false, application: 'failed', stage: 'enable', target: 'qilin-better-sidebar',
    ...error === undefined ? {} : { error }, ...packageResult === undefined ? {} : { packageResult },
  }
}

function ok<T>(value: T) {
  return { ok: true as const, value }
}

function refused(code: string, message: string, details: object = {}) {
  // The double's code map is keyed by literal codes; a spec-chosen string stands in.
  return { ok: false as const, error: new RemoteError(code as never, message, details as never) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/** A configuration ledger with nothing registered, as the page binds it beside the store. */
const NO_CONFIG: HostObservable<ConfigLedger> = {
  getSnapshot: () => ({ items: [], bundles: new Set(), rows: new Set() }),
  subscribe: () => () => {},
}

function bench(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const inventory = { list: overrides.inventory ?? vi.fn(() => Promise.resolve(ok({ entries: [], managementAvailable: true }))) }
  const plugins = {
    listBundles: vi.fn(() => Promise.resolve(ok([BUNDLE]))),
    listPlugins: vi.fn(() => Promise.resolve(ok(PLUGINS))),
    inspect: vi.fn(() => Promise.resolve(ok(INSPECTED))),
    installBundle: vi.fn(() => Promise.resolve(ok({ ...APPLIED, bundle: 'qilin-new' }))),
    cancelInstall: vi.fn(() => Promise.resolve(ok({ status: 'cancelled' }))),
    removeBundle: vi.fn(() => Promise.resolve(ok(APPLIED))),
    setBundleEnabled: vi.fn(() => Promise.resolve(ok(APPLIED))),
    setAudience: vi.fn(() => Promise.resolve(ok(APPLIED))),
    setPluginEnabled: vi.fn(() => Promise.resolve(ok(APPLIED))),
    checkUpdates: vi.fn(() => Promise.resolve(ok({ entries: [] }))),
    catalog: vi.fn(() => Promise.resolve(ok({ entries: [], page: 1, hasMore: false }))),
    registries: vi.fn(() => Promise.resolve(ok(REGISTRIES))),
    ...overrides,
  }
  const configForms = {
    describe: vi.fn(() => ({ getSnapshot: () => ({ view: undefined }), subscribe: () => () => {} })),
    get: vi.fn(() => ({ getSnapshot: () => ({ status: 'ready', value: undefined, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }), mutate: vi.fn() })),
  }
  const ctx = {
    remote: {
      pluginManager: plugins, pluginInventory: inventory,
      pluginRegistryProbe: { fastest: overrides.probeFastest ?? vi.fn(() => Promise.resolve(ok(null))) },
    },
    configForms,
  } as never
  const controller = new PluginManagerController(ctx)
  const face = controller.inject(NO_CONFIG, text => typeof text === 'string' ? text : text.en)
  const state = () => controller.getSnapshot()
  /** The request id of the run the dialog just handed to the Host. */
  const started = async (): Promise<PluginInstallRequestId> => {
    await vi.waitFor(() => { expect(state().install.phase).toBe('starting') })
    return state().install.requestId as PluginInstallRequestId
  }
  return { plugins, inventory, controller, face, state, started, configForms }
}


const MIRROR = 'https://registry.npmmirror.com/'
const OFFICIAL = 'https://registry.npmjs.org/'

describe('registryKey and offeredRegistries', () => {
  it('compares pnpm\'s own registry by the URL it names, and a registry that does not parse as written', () => {
    expect(registryKey(null, OFFICIAL)).toBe(OFFICIAL)
    expect(registryKey(null, null)).toBe('')
    expect(registryKey('https://REGISTRY.npmmirror.com', null)).toBe(MIRROR)
    expect(registryKey('not a url', null)).toBe('not a url')
  })

  it('offers the Host\'s registry, its fallbacks, and pnpm\'s own once each', () => {
    expect(offeredRegistries({ registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL })).toEqual([null, MIRROR])
    // pnpm's own configuration already names a fallback: the entry standing for it is not offered twice.
    expect(offeredRegistries({ registry: MIRROR, fallbackRegistries: [MIRROR, OFFICIAL], resolved: OFFICIAL })).toEqual([MIRROR, OFFICIAL])
    // Nothing read yet: only pnpm's own entry.
    expect(offeredRegistries(null)).toEqual([null])
  })
})

describe('registry recovery', () => {
  const base: InstallState = {
    open: true, spec: 'github:acme/x', phase: 'failed', registries: { registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL },
    registry: { kind: 'offered', registry: null }, registryOpen: false, registryError: false, audience: 'both', attempts: null,
    inputError: null, runs: [], detailsOpen: false, installed: null, installedVersion: null, restartRequired: false,
    approvedBuilds: [], enabling: false,
    subject: { spec: 'github:acme/x', status: 'accepted', kind: 'git', bundle: null, registry: null, host: 'github.com' },
    failure: { reason: 'unreachable', kind: 'network', failedAt: 'spec-host' },
  }

  it('offers the mirror only for a GitHub connection failure the Host laid at the spec host', () => {
    expect(githubRecoveryRegistry(base)).toBe(MIRROR)
    expect(githubRecoveryRegistry({ ...base, phase: 'running' })).toBeUndefined()
    expect(githubRecoveryRegistry({ ...base, failure: { reason: 'x', kind: 'network', failedAt: 'registry' } })).toBeUndefined()
    expect(githubRecoveryRegistry({ ...base, failure: { reason: 'x', kind: 'integrity', failedAt: 'spec-host' } })).toBeUndefined()
    expect(githubRecoveryRegistry({ ...base, subject: { spec: 'gitlab:a/b', status: 'accepted', kind: 'git', bundle: null, registry: null, host: 'gitlab.com' } })).toBeUndefined()
    // The configured set no longer holds the mirror.
    expect(githubRecoveryRegistry({ ...base, registries: { registry: null, fallbackRegistries: [], resolved: OFFICIAL } })).toBeUndefined()
    // A subdomain of the GitHub host counts as GitHub.
    expect(githubRecoveryRegistry({ ...base, subject: { spec: 's', status: 'accepted', kind: 'git', bundle: null, registry: null, host: 'GHE.github.com:8443' } })).toBe(MIRROR)
  })

  it('reads whether the choice already asks npmmirror, offered or typed', () => {
    expect(asksMirror({ ...base, registry: { kind: 'offered', registry: MIRROR } })).toBe(true)
    expect(asksMirror({ ...base, registry: { kind: 'custom', url: ' https://REGISTRY.npmmirror.com ' } })).toBe(true)
    expect(asksMirror({ ...base, registry: { kind: 'offered', registry: null } })).toBe(false)
    // Nothing read yet: the choice compares against itself alone.
    expect(asksMirror({ ...base, registries: null, registry: { kind: 'offered', registry: MIRROR } })).toBe(true)
    expect(asksMirror({ ...base, registries: null, registry: { kind: 'offered', registry: null } })).toBe(false)
    expect(githubRecoveryRegistry({ ...base, registries: null })).toBeUndefined()
  })
})

describe('PluginManagerController registry choice', () => {
  /** Open the dialog and wait for the registry read it starts. */
  async function opened(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
    const benchResult = bench(overrides)
    await benchResult.controller.load()
    benchResult.face.openInstall()
    await vi.waitFor(() => { expect(benchResult.state().install.registries).not.toBeNull() })
    return benchResult
  }

  it('starts from the registry the Host asks first and folds the options on request', async () => {
    const { face, state, plugins } = await opened()
    expect(state().install.registry).toEqual({ kind: 'offered', registry: null })
    expect(plugins.registries).toHaveBeenCalledTimes(1)
    face.toggleRegistryOptions()
    expect(state().install.registryOpen).toBe(true)
    face.toggleRegistryOptions()
    expect(state().install.registryOpen).toBe(false)
    // The shared configuration form is resolved through the face.
    expect(face.configForm('bash')).toBeDefined()
    // A choice is only possible while the spec is still editable.
    face.chooseRegistry({ kind: 'offered', registry: 'https://npm.corp.example/' })
    expect(state().install.registry).toEqual({ kind: 'offered', registry: 'https://npm.corp.example/' })
    // Change-registry does nothing outside the failed screen, nor does the mirror recovery
    // when no GitHub failure offered it, and a choice made after the spec left the editable
    // phase is dropped.
    face.changeRegistry()
    expect(state().install.registryOpen).toBe(false)
    face.useGithubMirror()
    expect(state().install.spec).toBe('')
    face.editInstallSpec('qilin-x')
    face.runInstall()
    expect(state().install.phase).toBe('checking')
    face.chooseRegistry({ kind: 'offered', registry: null })
    expect(state().install.registry).toEqual({ kind: 'offered', registry: 'https://npm.corp.example/' })
  })

  it('reconciles the registry last used: kept when offered, typed when the Host no longer offers it', async () => {
    const mirrored = { registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }
    let answer = mirrored
    const { controller, face, state, plugins } = bench({ registries: vi.fn(() => Promise.resolve(ok(answer))) })
    await controller.load()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    face.chooseRegistry({ kind: 'offered', registry: MIRROR })
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    // A later dialog starts from what was used and takes the entry the Host offers for it.
    face.closeInstall()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registry).toEqual({ kind: 'offered', registry: MIRROR }) })
    face.closeInstall()
    // A registry the Host no longer offers becomes the typed one.
    answer = { registry: null, fallbackRegistries: [], resolved: OFFICIAL }
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registry).toEqual({ kind: 'custom', url: MIRROR }) })
  })

  it('shows each bundle\'s recorded audience, and the dialog choice rides the install and edits through the Host', async () => {
    const coded: BundleInfo = { ...BUNDLE, name: 'qilin-coded', audience: 'coding' }
    const { plugins, controller, face, state } = bench({ listBundles: vi.fn(() => Promise.resolve(ok([BUNDLE, coded]))) })
    await controller.load()
    expect(state().packages.map(pkg => pkg.audience)).toEqual(['both', 'coding'])
    // The spec screen starts at both; a choice made after the spec left the editable phase is dropped.
    expect(state().install.audience).toBe('both')
    face.openInstall()
    face.chooseAudience('coding')
    expect(state().install.audience).toBe('coding')
    face.editInstallSpec('qilin-x')
    face.runInstall()
    expect(state().install.phase).toBe('checking')
    face.chooseAudience('general')
    expect(state().install.audience).toBe('coding')
    await vi.waitFor(() => { expect(plugins.installBundle).toHaveBeenCalledOnce() })
    const requestId = state().install.requestId as PluginInstallRequestId
    expect(plugins.installBundle).toHaveBeenCalledWith('qilin-x', { enabled: false, requestId, registry: null, audience: 'coding' })
    // The detail page's control edits a bundle's audience through the Host.
    face.setAudience('qilin-coded', 'general')
    await vi.waitFor(() => { expect(plugins.setAudience).toHaveBeenCalledWith('qilin-coded', 'general') })
  })

  it('leaves a refused registry read alone, and a dialog closed during the read', async () => {
    const refusedRead = bench({ registries: vi.fn(() => Promise.resolve(refused('boom', 'no'))) })
    await refusedRead.controller.load()
    refusedRead.face.openInstall()
    await vi.waitFor(() => { expect(refusedRead.state().install.registry).toEqual({ kind: 'offered', registry: null }) })
    await Promise.resolve()
    expect(refusedRead.state().install.registries).toBeNull()
    // A read that settles after the dialog closed changes nothing.
    const gate = deferred<ReturnType<typeof ok<typeof REGISTRIES>>>()
    const { face, state } = bench({ registries: vi.fn(() => gate.promise) })
    face.openInstall()
    face.closeInstall()
    gate.resolve(ok(REGISTRIES))
    await Promise.resolve()
    expect(state().install.registries).toBeNull()
    expect(state().install.open).toBe(false)
  })

  it('starts from the fastest public registry the probe answers, and only while nothing is remembered', async () => {
    const mirrored = { registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }
    const probed = await opened({
      registries: vi.fn(() => Promise.resolve(ok(mirrored))),
      probeFastest: vi.fn(() => Promise.resolve(ok(MIRROR))),
    })
    expect(probed.state().install.registry).toEqual({ kind: 'offered', registry: MIRROR })
    // A slower answer than the mirror leaves pnpm's own entry chosen.
    const slower = await opened({
      registries: vi.fn(() => Promise.resolve(ok(mirrored))),
      probeFastest: vi.fn(() => Promise.resolve(ok('https://npm.corp.example/'))),
    })
    expect(slower.state().install.registry).toEqual({ kind: 'offered', registry: null })
    // A private default is nobody's recommendation: the probe is never asked.
    const privateDefault = await opened({
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: 'https://npm.corp.example/' }))),
      probeFastest: vi.fn(() => Promise.resolve(ok(MIRROR))),
    })
    expect(privateDefault.state().install.registry).toEqual({ kind: 'offered', registry: null })
    // A configured mirror is the Host's own first choice: nothing to recommend over it.
    const configured = await opened({
      registries: vi.fn(() => Promise.resolve(ok({ registry: MIRROR, fallbackRegistries: [MIRROR], resolved: OFFICIAL }))),
      probeFastest: vi.fn(() => Promise.resolve(ok(MIRROR))),
    })
    expect(configured.state().install.registry).toEqual({ kind: 'offered', registry: MIRROR })
    // A pnpm registry that does not parse receives no recommendation either.
    const unreadable = await opened({
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: 'not a url' }))),
      probeFastest: vi.fn(() => Promise.resolve(ok(MIRROR))),
    })
    expect(unreadable.state().install.registry).toEqual({ kind: 'offered', registry: null })
  })

  it('refuses a typed registry that is not an http(s) URL before asking the Host, and asks the chosen one', async () => {
    const { face, state, plugins } = await opened()
    face.chooseRegistry({ kind: 'custom', url: 'npm.corp.example' })
    face.editInstallSpec('qilin-x')
    face.runInstall()
    expect(state().install.registryError).toBe(true)
    expect(plugins.inspect).not.toHaveBeenCalled()
    face.chooseRegistry({ kind: 'custom', url: ' https://npm.corp.example ' })
    expect(state().install.registryError).toBe(false)
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    expect(plugins.inspect).toHaveBeenCalledWith('qilin-x', { registry: 'https://npm.corp.example' }, expect.anything())
  })

  it('keeps a manual choice made before the registry list arrives, and a read that lands after the run started', async () => {
    const gate = deferred<ReturnType<typeof ok<typeof REGISTRIES>>>()
    const { face, state, controller, plugins } = bench({ registries: vi.fn(() => gate.promise) })
    await controller.load()
    face.openInstall()
    // The person picks before the Host answers: the arriving list must not replace it.
    face.chooseRegistry({ kind: 'offered', registry: 'https://npm.corp.example/' })
    face.editInstallSpec('qilin-x')
    face.runInstall()
    expect(state().install.phase).toBe('checking')
    gate.resolve(ok(REGISTRIES))
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    expect(state().install.registry).toEqual({ kind: 'offered', registry: 'https://npm.corp.example/' })
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    // A read whose probes settle after the run started changes no choice.
    expect(state().install.registry).toEqual({ kind: 'offered', registry: 'https://npm.corp.example/' })
  })

  it('drops a check whose registry read settles after the dialog closed', async () => {
    const gate = deferred<ReturnType<typeof ok<typeof REGISTRIES>>>()
    const { face, state, controller, plugins } = bench({ registries: vi.fn(() => gate.promise) })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('qilin-x')
    face.runInstall()
    // The check waits for the read; closing the dialog drops it before the read lands.
    face.closeInstall()
    gate.resolve(ok(REGISTRIES))
    await Promise.resolve()
    await Promise.resolve()
    expect(plugins.inspect).not.toHaveBeenCalled()
    expect(state().install.open).toBe(false)
  })

  it('leaves a probe that settles after the run started, and a read a newer dialog replaced', async () => {
    const probeGate = deferred<ReturnType<typeof ok<string | null>>>()
    const { face, state, controller, plugins } = bench({
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }))),
      probeFastest: vi.fn(() => probeGate.promise),
    })
    await controller.load()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    // A typed registry is not the read's own choice, so the check does not wait for the probe.
    face.chooseRegistry({ kind: 'custom', url: 'https://npm.corp.example/' })
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    await vi.waitFor(() => { expect(state().install.phase).toBe('starting') })
    // The probe settles while the Host already runs the installation: no choice changes.
    probeGate.resolve(ok(MIRROR))
    await Promise.resolve()
    expect(state().install.registry).toEqual({ kind: 'custom', url: 'https://npm.corp.example/' })
    // A dialog opened again replaces the read of the one before it.
    const slow = deferred<ReturnType<typeof ok<typeof REGISTRIES>>>()
    const racing = bench({ registries: vi.fn(() => slow.promise) })
    await racing.controller.load()
    racing.face.openInstall()
    racing.face.closeInstall()
    racing.face.openInstall()
    await racing.controller.load()
    slow.resolve(ok(REGISTRIES))
    await Promise.resolve()
    expect(racing.state().install.open).toBe(true)
  })

  it('lists the registries its answer names even when no attempt was announced', async () => {
    const { face, state, controller, plugins } = bench({
      installBundle: vi.fn(() => Promise.resolve(ok({ ...APPLIED, bundle: 'qilin-new', registries: [null, MIRROR] }))),
    })
    await controller.load()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    face.editInstallSpec('qilin-new')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(plugins.installBundle).toHaveBeenCalledTimes(1)
    expect(state().install.attempts).toEqual({ registries: [null, MIRROR], total: 2 })
  })

  it('returns from the failed screen to the spec when the registry is changed there', async () => {
    const { face, state, controller } = bench({
      installBundle: vi.fn(() => Promise.resolve(ok({
        ...APPLIED, application: 'failed', failedAt: 'registry',
        packageResult: { exitCode: 1, output: 'ERR', truncated: false, logPath: '/l', kind: 'network' },
      }))),
    })
    await controller.load()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    face.editInstallSpec('fallen')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    face.changeRegistry()
    expect(state().install).toMatchObject({ phase: 'idle', spec: 'fallen', registryOpen: true, failure: null })
  })

  it('checks a spec whose dialog already read its registries, and keeps a lost answer worded', async () => {
    const { face, state, plugins } = await opened()
    // The read settled before the run: the check goes straight to the Host.
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    // An answer the transport never delivered settles as a failure without registry detail.
    const lost = bench({ installBundle: vi.fn(() => Promise.resolve(refused('lost', 'no answer'))) })
    await lost.controller.load()
    lost.face.openInstall()
    await vi.waitFor(() => { expect(lost.state().install.registries).not.toBeNull() })
    lost.face.editInstallSpec('qilin-x')
    lost.face.runInstall()
    await vi.waitFor(() => { expect(lost.state().install.phase).toBe('failed') })
    expect(lost.state().install.failure).toEqual({ reason: 'no answer' })
  })

  it('carries the registries a refused check asked into the field error', async () => {
    const { face, state } = await opened({
      inspect: vi.fn(() => Promise.resolve(ok({ status: 'refused', problem: 'network', reason: 'offline', registries: [null, MIRROR] }))),
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }))),
    })
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.inputError).not.toBeNull() })
    expect(state().install.inputError).toEqual({ problem: 'network', reason: 'offline', registries: [null, MIRROR] })
  })

  it('tracks each attempt the Host announces and every registry its answer names', async () => {
    const gate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { face, state, controller, started } = bench({
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }))),
      installBundle: vi.fn(() => gate.promise),
      // The spec starts from a registry the dialog already read.
      probeFastest: vi.fn(() => Promise.resolve(ok(null))),
    })
    await controller.load()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    face.editInstallSpec('fallen')
    face.runInstall()
    const requestId = await started()
    // A phase without an attempt leaves the list alone.
    controller.installProgress({ requestId, phase: 'installing' })
    expect(state().install.attempts).toBeNull()
    controller.installProgress({ requestId, phase: 'installing', attempt: { registry: null, index: 1, total: 2 } })
    expect(state().install.attempts).toEqual({ registries: [null], total: 2 })
    controller.installProgress({ requestId, phase: 'installing', attempt: { registry: MIRROR, index: 2, total: 2 } })
    expect(state().install.attempts).toEqual({ registries: [null, MIRROR], total: 2 })
    gate.resolve(ok({
      ...APPLIED, application: 'failed', registries: [null, MIRROR], failedAt: 'registry',
      packageResult: { exitCode: 1, output: 'ERR', truncated: false, logPath: '/l', kind: 'network' },
    }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.failure).toMatchObject({ kind: 'network', failedAt: 'registry' })
    expect(state().install.attempts).toEqual({ registries: [null, MIRROR], total: 2 })
    // From the failed screen the registry options reopen over a fresh spec.
    face.changeRegistry()
    expect(state().install).toMatchObject({ phase: 'idle', spec: 'fallen', registryOpen: true, failure: null })
  })

  it('offers the mainland mirror after a GitHub connection failure, keeping a spec that already asks it', async () => {
    const subject = { status: 'accepted' as const, kind: 'git' as const, bundle: null, registry: null, host: 'github.com' }
    const { face, state, plugins } = bench({
      registries: vi.fn(() => Promise.resolve(ok({ registry: null, fallbackRegistries: [MIRROR], resolved: OFFICIAL }))),
      inspect: vi.fn(() => Promise.resolve(ok(subject))),
      installBundle: vi.fn(() => Promise.resolve(ok({
        ...APPLIED, application: 'failed', failedAt: 'spec-host',
        packageResult: { exitCode: 1, output: 'git failed', truncated: false, logPath: '/l', kind: 'network' },
      }))),
    })
    face.ensure()
    await Promise.resolve()
    face.openInstall()
    await vi.waitFor(() => { expect(state().install.registries).not.toBeNull() })
    face.editInstallSpec('github:acme/qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(githubRecoveryRegistry(state().install)).toBe(MIRROR)
    face.useGithubMirror()
    expect(state().install).toMatchObject({ phase: 'idle', spec: '', mirrorRecovery: true })
    expect(state().install.registry).toEqual({ kind: 'offered', registry: MIRROR })
    // Asking again keeps the choice that already asks the mirror.
    face.changeRegistry()
    face.chooseRegistry({ kind: 'custom', url: MIRROR })
    face.editInstallSpec('github:acme/qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    face.useGithubMirror()
    expect(state().install.registry).toEqual({ kind: 'custom', url: MIRROR })
    expect(plugins.inspect).toHaveBeenCalledTimes(2)
  })
})

describe('packageView', () => {
  it('joins a bundle with the entries its rows run as', () => {
    expect(packageView(BUNDLE, PLUGINS)).toEqual({
      name: 'qilin-better-sidebar', version: '0.16.0', description: 'A sidebar.',
      installed: true, optional: false, audience: 'both', updatable: true, enabled: false,
      rows: [
        { rowId: 'sidebar', moduleName: 'qilin-better-sidebar', entryId: ROW_ENTRY, enabled: true, phase: 'active' },
        { rowId: 'theme', moduleName: 'qilin-better-sidebar/theme', enabled: false, phase: null },
      ],
    })
    // A row the inventory no longer lists, a protected row, and a bundle the Host cannot read.
    const protectedBundle: BundleInfo = {
      name: '@qilin/base', enabled: true, installed: false, optional: false, audience: 'both', updatable: false, removable: false,
      readOnlyReason: 'management-required',
      error: { code: 'operation-error', diagnostic: 'broken' },
      rows: [{ rowId: 'core', moduleName: '@qilin/base', entryId: 'include:core' as PluginEntryId }, { rowId: 'gone', moduleName: 'x', entryId: 'include:gone' as PluginEntryId }],
      overrides: [],
    }
    expect(packageView(protectedBundle, PLUGINS)).toEqual({
      name: '@qilin/base', installed: false, optional: false, audience: 'both', updatable: false, enabled: true,
      readOnlyReason: 'management-required',
      error: { code: 'operation-error', diagnostic: 'broken' },
      rows: [
        { rowId: 'core', moduleName: '@qilin/base', entryId: 'include:core', enabled: true, phase: 'active', readOnlyReason: 'management-required' },
        { rowId: 'gone', moduleName: 'x', entryId: 'include:gone', enabled: false, phase: null },
      ],
    })
  })
})

describe('sortPackages', () => {
  it('orders packages by the short name a person reads, not by the Host order or enablement', async () => {
    const plain = { enabled: true, installed: true, optional: false, audience: 'both' as const, updatable: true, removable: true, rows: [], overrides: [] }
    const zeta: BundleInfo = { ...plain, name: 'qilin-zeta' }
    const alpha: BundleInfo = { ...plain, name: '@acme/qilin-alpha', enabled: false }
    const views = [zeta, BUNDLE, alpha].map(bundle => packageView(bundle, PLUGINS))
    expect(sortPackages(views).map(pkg => pkg.name)).toEqual(['@acme/qilin-alpha', 'qilin-better-sidebar', 'qilin-zeta'])
    // The store lists what it read in that order, whatever the Host's order.
    const { state, controller } = bench({ listBundles: vi.fn(() => Promise.resolve(ok([zeta, BUNDLE, alpha]))) })
    await controller.load()
    expect(state().packages.map(pkg => pkg.name)).toEqual(['@acme/qilin-alpha', 'qilin-better-sidebar', 'qilin-zeta'])
  })
})

describe('PluginManagerController', () => {
  it('starts idle, reads the inventory then the bundles and entries on first use, and folds concurrent loads', async () => {
    const gate = deferred<ReturnType<typeof ok<BundleInfo[]>>>()
    const { plugins, inventory, face, state, controller } = bench({
      listBundles: vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(ok([BUNDLE])),
    })
    expect(state().status).toBe('idle')
    face.ensure()
    face.ensure()
    await Promise.resolve()
    expect(state().status).toBe('loading')
    const mid = controller.load()
    gate.resolve(ok([BUNDLE]))
    await mid
    expect(state().status).toBe('ready')
    expect(state().packages).toEqual([packageView(BUNDLE, PLUGINS)])
    expect(inventory.list).toHaveBeenCalledTimes(2)
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    expect(plugins.listPlugins).toHaveBeenCalledTimes(2)
    face.ensure()
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
  })

  it('reports a Host without a managed profile as unavailable and keeps the last packages across a failed read', async () => {
    const { inventory, plugins, face, state, controller } = bench()
    await controller.load()
    expect(state().packages).toHaveLength(1)
    inventory.list.mockResolvedValueOnce(ok({ entries: [] }))
    await controller.load()
    expect(state()).toMatchObject({ status: 'unavailable', packages: [] })
    inventory.list.mockResolvedValueOnce(refused('gateway/internal', 'offline'))
    await controller.load()
    expect(state().status).toBe('error')
    await controller.load()
    expect(state().status).toBe('ready')
    plugins.listPlugins.mockResolvedValueOnce(refused('gateway/internal', 'offline') as never)
    await controller.load()
    expect(state()).toMatchObject({ status: 'error', packages: [packageView(BUNDLE, PLUGINS)] })
    plugins.listBundles.mockResolvedValueOnce(refused('gateway/internal', 'offline') as never)
    await controller.load()
    expect(state().status).toBe('error')
    face.refresh()
    await vi.waitFor(() => { expect(state().status).toBe('ready') })
  })

  it('enables a bundle, marks it busy meanwhile, and says when a restart is needed or a layer overrides it', async () => {
    const gate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller } = bench({
      setBundleEnabled: vi.fn()
        .mockReturnValueOnce(gate.promise)
        .mockResolvedValueOnce(ok({ ...APPLIED, application: 'restart-required' }))
        .mockResolvedValueOnce(ok({ ...APPLIED, application: 'overridden' })),
    })
    await controller.load()
    face.setEnabled(BUNDLE.name, true)
    face.setEnabled(BUNDLE.name, true)
    await Promise.resolve()
    expect(state().busy).toEqual([BUNDLE.name])
    expect(plugins.setBundleEnabled).toHaveBeenCalledExactlyOnceWith(BUNDLE.name, true)
    gate.resolve(ok(APPLIED))
    await vi.waitFor(() => { expect(state().busy).toEqual([]) })
    expect(state().notice).toBeNull()
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    face.setEnabled(BUNDLE.name, false)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'restart', packageName: BUNDLE.name, seq: 1 }) })
    face.setEnabled(BUNDLE.name, false)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'overridden', packageName: BUNDLE.name, seq: 2 }) })
  })

  it('turns a change the Host could not apply, or a refused answer, into a notice carrying its code and words', async () => {
    const { face, state, controller } = bench({
      setBundleEnabled: vi.fn()
        .mockResolvedValueOnce(ok(failed({ code: 'operation-error', diagnostic: 'the tree rejected it' })))
        .mockResolvedValueOnce(refused('gateway/internal', 'offline'))
        .mockRejectedValueOnce(new Error('transport down'))
        .mockRejectedValueOnce('odd')
        .mockResolvedValueOnce(ok(failed({ code: 'bundle-in-use' })))
        .mockResolvedValueOnce(ok(failed()))
        .mockResolvedValueOnce(ok({ ...failed(), application: 'cancelled' }))
        .mockResolvedValueOnce(ok(failed({ code: 'incompatible-version', incompatible: [INCOMPATIBLE] }))),
    })
    await controller.load()
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'enable', code: 'operation-error', reason: 'the tree rejected it', packageName: BUNDLE.name, seq: 1 }) })
    face.setEnabled(BUNDLE.name, false)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'disable', reason: 'offline', packageName: BUNDLE.name, seq: 2 }) })
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'enable', reason: 'transport down', packageName: BUNDLE.name, seq: 3 }) })
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'enable', reason: 'odd', packageName: BUNDLE.name, seq: 4 }) })
    // A refusal keeps its code with no words of its own; a failure without a code has neither.
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'enable', code: 'bundle-in-use', reason: '', packageName: BUNDLE.name, seq: 5 }) })
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'enable', reason: '', packageName: BUNDLE.name, seq: 6 }) })
    // A change the Host stopped is said in passing.
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'cancelled', seq: 7 }) })
    // An incompatibility keeps the packages it names for the page to word.
    face.setEnabled(BUNDLE.name, true)
    await vi.waitFor(() => {
      expect(state().notice).toEqual({
        kind: 'failed', action: 'enable', code: 'incompatible-version', incompatible: [INCOMPATIBLE], reason: '', packageName: BUNDLE.name, seq: 8,
      })
    })
    face.dismissNotice()
    expect(state().notice).toBeNull()
  })

  it('always asks before uninstalling, and cancelling runs nothing', async () => {
    const { plugins, face, state, controller } = bench()
    await controller.load()
    face.uninstall(BUNDLE.name)
    expect(state().confirm).toEqual({ action: 'uninstall', packageName: BUNDLE.name })
    face.cancelConfirm()
    expect(state().confirm).toBeNull()
    face.confirm()
    expect(plugins.removeBundle).not.toHaveBeenCalled()
    face.uninstall(BUNDLE.name)
    face.confirm()
    expect(state().confirm).toBeNull()
    await vi.waitFor(() => { expect(plugins.removeBundle).toHaveBeenCalledExactlyOnceWith(BUNDLE.name) })
    await vi.waitFor(() => { expect(state().busy).toEqual([]) })
    // A refused removal names the action it was.
    plugins.removeBundle.mockResolvedValueOnce(ok({ ...failed(), stage: 'remove', error: { code: 'not-removable' } }) as never)
    face.uninstall(BUNDLE.name)
    face.confirm()
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'uninstall', code: 'not-removable', reason: '', packageName: BUNDLE.name, seq: 1 }) })
  })

  it('switches rows under their own busy keys and reports what the Host said', async () => {
    const gate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller } = bench({
      setPluginEnabled: vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValueOnce(ok(failed({ code: 'unaddressable' }))),
    })
    await controller.load()
    face.setRowEnabled(ROW_ENTRY, false)
    face.setRowEnabled(ROW_ENTRY, false)
    await Promise.resolve()
    expect(state().busy).toEqual([rowKey(ROW_ENTRY)])
    expect(plugins.setPluginEnabled).toHaveBeenCalledExactlyOnceWith(ROW_ENTRY, false)
    gate.resolve(ok(APPLIED))
    await vi.waitFor(() => { expect(state().busy).toEqual([]) })
    face.setRowEnabled(ROW_ENTRY, true)
    await vi.waitFor(() => { expect(state().notice).toEqual({ kind: 'failed', action: 'rowEnable', code: 'unaddressable', reason: '', packageName: ROW_ENTRY, seq: 1 }) })
  })

  it('checks the spec, hands the run to the Host, and folds the chunks that carry its request id', async () => {
    const gate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller, started } = bench({ installBundle: vi.fn().mockReturnValueOnce(gate.promise) })
    await controller.load()
    face.runInstall()
    expect(plugins.inspect).not.toHaveBeenCalled()
    face.openInstall()
    expect(state().install).toMatchObject({ open: true, spec: '', phase: 'idle', inputError: null, subject: null })
    face.editInstallSpec('  qilin-new ')
    face.runInstall()
    face.runInstall()
    expect(state().install.phase).toBe('checking')
    // Neither typing nor a second run reaches the Host while it checks.
    face.editInstallSpec('other')
    expect(state().install.spec).toBe('  qilin-new ')
    // The dialog's registry read settles first; the check then asks the registry it settled on.
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    expect(plugins.inspect).toHaveBeenCalledWith('qilin-new', { registry: null }, expect.any(AbortSignal))
    const requestId = await started()
    expect(state().install.subject).toEqual({ spec: 'qilin-new', ...INSPECTED })
    expect(plugins.installBundle).toHaveBeenCalledTimes(1)
    expect(plugins.installBundle).toHaveBeenCalledWith('qilin-new', { enabled: false, requestId, registry: null, audience: 'both' })
    // The Host's acknowledgement makes the run stoppable; a chunk of another request is not this run's.
    controller.installProgress({ requestId, phase: 'installing' })
    expect(state().install.phase).toBe('running')
    controller.appendLog({ requestId: 'other' as PluginInstallRequestId, jobId: 'j1', argv: [], cwd: '/p', stream: 'stdout', text: 'x' })
    expect(state().install.runs).toEqual([])
    const argv = ['pnpm', 'add', 'qilin-new']
    controller.appendLog({ requestId, jobId: 'j1', argv, cwd: '/p', stream: 'stdout', text: 'Progress\n' })
    // A second run of the same install is its own terminal; a later chunk lands on the run it names.
    controller.appendLog({ requestId, jobId: 'j2', argv: ['pnpm', 'remove', 'lib'], cwd: '/p', stream: 'stdout', text: '- lib\n', exitCode: 0 })
    controller.appendLog({ requestId, jobId: 'j1', argv, cwd: '/p', stream: 'stderr', text: 'Done\n' })
    expect(state().install.runs).toEqual([
      { jobId: 'j1', command: 'pnpm add qilin-new', cwd: '/p', output: 'Progress\nDone\n' },
      { jobId: 'j2', command: 'pnpm remove lib', cwd: '/p', output: '- lib\n', exitCode: 0 },
    ])
    face.toggleInstallDetails()
    expect(state().install.detailsOpen).toBe(true)
    gate.resolve(ok({ ...APPLIED, bundle: 'qilin-new' }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(state().install).toMatchObject({ installed: 'qilin-new', restartRequired: false, detailsOpen: true })
    // The finished install settled its run; a trailing last chunk still lands
    // on it, while a chunk for a run the dialog never saw is dropped.
    controller.appendLog({ requestId, jobId: 'j1', argv, cwd: '/p', stream: 'stdout', text: '', exitCode: 0 })
    controller.appendLog({ requestId, jobId: 'j3', argv, cwd: '/p', stream: 'stdout', text: 'stray' })
    expect(state().install.runs).toEqual([
      { jobId: 'j1', command: 'pnpm add qilin-new', cwd: '/p', output: 'Progress\nDone\n', exitCode: 0 },
      { jobId: 'j2', command: 'pnpm remove lib', cwd: '/p', output: '- lib\n', exitCode: 0 },
    ])
    await vi.waitFor(() => { expect(plugins.listBundles).toHaveBeenCalledTimes(2) })
    // Cancelling from the finished screen does nothing, nor does the Host's late progress; a new spec after it starts over.
    face.cancelInstall()
    controller.installProgress({ requestId, phase: 'applying' })
    expect(state().install.phase).toBe('done')
    face.editInstallSpec('another')
    expect(state().install).toMatchObject({ phase: 'idle', spec: 'another', runs: [], installed: null, subject: null })
    face.closeInstall()
    expect(state().install.open).toBe(false)
  })

  it('refuses a spec the list already shows without asking the Host, and words what the Host refused', async () => {
    const { plugins, face, state, controller } = bench({
      inspect: vi.fn()
        .mockResolvedValueOnce(ok({ status: 'refused', problem: 'not-found', reason: 'E404' }))
        .mockResolvedValueOnce(ok({ status: 'refused', problem: 'not-a-bundle', reason: 'plain declares no qilin.bundle' }))
        .mockResolvedValueOnce(refused('gateway/internal', 'offline')),
    })
    await controller.load()
    face.openInstall()
    face.editInstallSpec(BUNDLE.name)
    face.runInstall()
    expect(plugins.inspect).not.toHaveBeenCalled()
    expect(state().install).toMatchObject({ phase: 'idle', inputError: { problem: 'already-installed', reason: BUNDLE.name } })
    // Typing clears the refusal.
    face.editInstallSpec('nope')
    expect(state().install.inputError).toBeNull()
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.inputError).toEqual({ problem: 'not-found', reason: 'E404' }) })
    expect(state().install.phase).toBe('idle')
    expect(plugins.installBundle).not.toHaveBeenCalled()
    face.editInstallSpec('plain')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.inputError).toEqual({ problem: 'not-a-bundle', reason: 'plain declares no qilin.bundle' }) })
    // A refused answer, rather than a refused spec, reads as unknown with the transport's words.
    face.editInstallSpec('x')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.inputError).toEqual({ problem: 'unknown', reason: 'offline' }) })
  })

  it('leaves the check or the failed screen for the spec at once', async () => {
    const inspectGate = deferred<ReturnType<typeof ok<typeof INSPECTED>>>()
    const droppedGate = deferred<ReturnType<typeof ok<typeof INSPECTED>>>()
    const { plugins, face, state, controller } = bench({
      inspect: vi.fn()
        .mockReturnValueOnce(inspectGate.promise)
        .mockReturnValueOnce(droppedGate.promise)
        .mockResolvedValue(ok(INSPECTED)),
      installBundle: vi.fn().mockResolvedValue(ok(failed({ code: 'operation-error', diagnostic: 'ERR' }, { exitCode: 1, output: 'ERR', truncated: false, logPath: '/l', kind: 'network' }))),
    })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(1) })
    const checkSignal = (plugins.inspect.mock.calls[0] as unknown[])[2] as AbortSignal
    face.cancelInstall()
    expect(checkSignal.aborted).toBe(true)
    expect(state().install).toMatchObject({ open: true, phase: 'idle', spec: 'qilin-x', inputError: null })
    // The settlement of the dropped check changes nothing.
    inspectGate.resolve(ok(INSPECTED))
    await Promise.resolve()
    await Promise.resolve()
    expect(state().install.phase).toBe('idle')
    expect(plugins.installBundle).not.toHaveBeenCalled()
    // Closing during a check drops it too.
    face.runInstall()
    await vi.waitFor(() => { expect(plugins.inspect).toHaveBeenCalledTimes(2) })
    face.closeInstall()
    expect(state().install.open).toBe(false)
    expect((plugins.inspect.mock.calls[1] as unknown[])[2]).toMatchObject({ aborted: true })
    droppedGate.resolve(ok(INSPECTED))
    // From the failed screen the same control goes back to the spec.
    face.openInstall()
    face.editInstallSpec('qilin-x')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.failure).toEqual({ reason: 'ERR', code: 'operation-error', kind: 'network' })
    face.cancelInstall()
    expect(state().install).toMatchObject({ open: true, phase: 'idle', spec: 'qilin-x', failure: null, subject: null })
  })

  it('asks the Host to stop a run, keeps the spec once it confirms, and forgets the stopped run', async () => {
    const first = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const second = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const cancellation = deferred<ReturnType<typeof ok<{ status: 'cancelled' }>>>()
    const { plugins, face, state, controller, started } = bench({
      installBundle: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      cancelInstall: vi.fn().mockReturnValueOnce(cancellation.promise),
    })
    face.openInstall()
    face.editInstallSpec('slow')
    face.runInstall()
    const requestId = await started()
    // Before the Host acknowledges the run there is nothing to stop, and the dialog cannot close.
    face.cancelInstall()
    face.closeInstall()
    expect(plugins.cancelInstall).not.toHaveBeenCalled()
    expect(state().install).toMatchObject({ open: true, phase: 'starting' })
    controller.installProgress({ requestId, phase: 'installing' })
    face.cancelInstall()
    face.cancelInstall()
    face.closeInstall()
    face.openInstall()
    expect(plugins.cancelInstall).toHaveBeenCalledExactlyOnceWith(requestId)
    expect(state().install).toMatchObject({ phase: 'cancelling', open: true, spec: 'slow' })
    // A queued start cannot undo the request to stop; the Host's own cancelling phase is the same.
    controller.installProgress({ requestId, phase: 'installing' })
    controller.installProgress({ requestId, phase: 'cancelling' })
    expect(state().install.phase).toBe('cancelling')
    cancellation.resolve(ok({ status: 'cancelled' }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('idle') })
    // The spec is offered again, the run is forgotten, and a toast says the Host stopped it.
    expect(state().install).toMatchObject({ open: true, spec: 'slow', subject: null, runs: [] })
    expect(state().install.requestId).toBeUndefined()
    expect(state().notice).toEqual({ kind: 'cancelled', seq: 1 })
    face.runInstall()
    const nextId = await started()
    expect(nextId).not.toBe(requestId)
    // The stopped run's answer, progress, and chunks belong to a request the dialog no longer has.
    first.resolve(ok({ ...failed(), application: 'cancelled' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(state().install).toMatchObject({ requestId: nextId, phase: 'starting' })
    controller.installProgress({ requestId, phase: 'applying' })
    controller.appendLog({ requestId, jobId: 'old', argv: [], cwd: '/p', stream: 'stdout', text: 'late' })
    expect(state().install).toMatchObject({ phase: 'starting', runs: [] })
    second.resolve(ok({ ...APPLIED, application: 'restart-required', bundle: 'slow' }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(state().install).toMatchObject({ installed: 'slow', restartRequired: true })
  })

  it.each(['too-late', 'not-running', 'offline'] as const)('keeps a stop the Host answered %s apart from a stopped run', async (status) => {
    const pending = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller, started } = bench({
      installBundle: vi.fn().mockReturnValue(pending.promise),
      cancelInstall: vi.fn().mockResolvedValue(status === 'offline' ? refused('gateway/internal', 'offline') : ok({ status })),
    })
    face.openInstall()
    face.editInstallSpec('slow')
    face.runInstall()
    const requestId = await started()
    controller.installProgress({ requestId, phase: 'installing' })
    face.cancelInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe(status === 'too-late' ? 'applying' : 'running') })
    expect(plugins.cancelInstall).toHaveBeenCalledOnce()
    // A stop the Host did not confirm says so over the running screen, with the transport's words when it has them.
    expect(state().install.failure).toEqual(
      status === 'too-late' ? null : { reason: status === 'offline' ? 'offline' : '', cancelUnconfirmed: true },
    )
    // The Host's own word that it stopped the run still ends it.
    pending.resolve(ok({ ...failed(), application: 'cancelled' }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('idle') })
    expect(state().install).toMatchObject({ open: true, spec: 'slow', failure: null })
    expect(state().notice).toEqual({ kind: 'cancelled', seq: 1 })
  })

  it.each(['cancelled', 'too-late'] as const)('closes the dialog once the Host confirms the stop its close control asked for, and stays on %s', async (status) => {
    const pending = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller, started } = bench({
      installBundle: vi.fn().mockReturnValue(pending.promise),
      cancelInstall: vi.fn().mockResolvedValue(ok({ status })),
    })
    // Before a run exists there is nothing to stop, and the dialog stays as it is.
    face.openInstall()
    face.cancelInstallAndClose()
    expect(state().install).toMatchObject({ open: true, phase: 'idle' })
    face.editInstallSpec('slow')
    face.runInstall()
    const requestId = await started()
    controller.installProgress({ requestId, phase: 'installing' })
    face.cancelInstallAndClose()
    expect(state().install.phase).toBe('cancelling')
    if (status === 'cancelled') {
      await vi.waitFor(() => { expect(state().install).toMatchObject({ open: false, phase: 'idle', spec: '' }) })
      expect(state().notice).toEqual({ kind: 'cancelled', seq: 1 })
    } else {
      await vi.waitFor(() => { expect(state().install.phase).toBe('applying') })
      expect(state().install.open).toBe(true)
    }
    expect(plugins.cancelInstall).toHaveBeenCalledExactlyOnceWith(requestId)
    pending.resolve(ok({ ...failed(), application: 'cancelled' }))
  })

  it.each([false, true])('drops a stop the Host confirms once the run settled, or after disposal (%s)', async (dispose) => {
    const answer = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const cancellation = deferred<ReturnType<typeof ok<{ status: 'cancelled' }>>>()
    const { face, state, controller, started } = bench({
      installBundle: vi.fn().mockReturnValue(answer.promise),
      cancelInstall: vi.fn().mockReturnValue(cancellation.promise),
    })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('slow')
    face.runInstall()
    controller.installProgress({ requestId: await started(), phase: 'installing' })
    face.cancelInstall()
    expect(state().install.phase).toBe('cancelling')
    if (dispose) controller.dispose()
    answer.resolve(ok({ ...APPLIED, bundle: 'slow' }))
    if (!dispose) await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    cancellation.resolve(ok({ status: 'cancelled' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(state().install.phase).toBe(dispose ? 'cancelling' : 'done')
    expect(state().notice).toBeNull()
  })

  it('enables what a finished install added from its screen, closes, and marks it in the list', async () => {
    const { plugins, face, state, controller } = bench({
      installBundle: vi.fn()
        .mockResolvedValueOnce(ok({ ...APPLIED, bundle: 'qilin-a' }))
        .mockResolvedValueOnce(ok({ ...APPLIED, bundle: 'qilin-a' }))
        .mockResolvedValueOnce(ok({ ...APPLIED, application: 'overridden' })),
      setBundleEnabled: vi.fn()
        .mockResolvedValueOnce(ok({ ...APPLIED, application: 'restart-required' }))
        .mockResolvedValueOnce(ok(failed({ code: 'operation-error', diagnostic: 'the tree rejected it' }))),
    })
    await controller.load()
    face.enableInstalled()
    expect(plugins.setBundleEnabled).not.toHaveBeenCalled()
    face.openInstall()
    face.editInstallSpec('qilin-a')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    face.enableInstalled()
    face.enableInstalled()
    expect(state().install.enabling).toBe(true)
    await vi.waitFor(() => { expect(state().install.open).toBe(false) })
    expect(plugins.setBundleEnabled).toHaveBeenCalledExactlyOnceWith('qilin-a', true)
    // A restart it waits for is said in passing; the list marks it.
    expect(state().notice).toEqual({ kind: 'restart', packageName: 'qilin-a', seq: 1 })
    expect(state().highlight).toBe('qilin-a')
    face.clearHighlight()
    face.clearHighlight()
    expect(state().highlight).toBeNull()

    // A refusal toasts it and still closes.
    face.openInstall()
    face.editInstallSpec('qilin-a')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    face.enableInstalled()
    await vi.waitFor(() => { expect(state().install.open).toBe(false) })
    expect(plugins.setBundleEnabled).toHaveBeenCalledTimes(2)
    expect(state().notice).toEqual({ kind: 'failed', action: 'enable', code: 'operation-error', reason: 'the tree rejected it', packageName: 'qilin-a', seq: 2 })
    expect(state().highlight).toBe('qilin-a')

    // An install that named no bundle has nothing to enable or mark: the screen just closes.
    face.openInstall()
    face.editInstallSpec('lib')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(state().install.installed).toBeNull()
    face.enableInstalled()
    await vi.waitFor(() => { expect(state().install.open).toBe(false) })
    expect(plugins.setBundleEnabled).toHaveBeenCalledTimes(2)
    expect(state().highlight).toBeNull()
  })

  it('offers the scripts a blocked run left pending, and retries the same spec with them allowed', async () => {
    const gates: ReturnType<typeof deferred<Awaited<ReturnType<typeof ok<ChangeResult>> | ReturnType<typeof refused>>>>[] = []
    const { face, state, controller, plugins, started } = bench({
      installBundle: vi.fn(() => {
        const gate = deferred<Awaited<ReturnType<typeof ok<ChangeResult>> | ReturnType<typeof refused>>>()
        gates.push(gate)
        return gate.promise
      }),
    })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('x')
    // Before the failed screen offers anything, the action does nothing.
    face.approveBuildsAndRetry()
    face.runInstall()
    const first = await started()
    gates[0]!.resolve(ok({
      ...failed({ code: 'operation-error', diagnostic: 'ERR_PNPM_IGNORED_BUILDS' },
        { exitCode: 1, output: 'ERR_PNPM_IGNORED_BUILDS', truncated: false, logPath: '/l', kind: 'build-blocked' }),
      pendingBuilds: ['native'],
    }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.failure).toEqual({ reason: 'ERR_PNPM_IGNORED_BUILDS', code: 'operation-error', kind: 'build-blocked', pendingBuilds: ['native'] })
    // The retry keeps the subject the check produced and carries the approved names under a new request id.
    face.approveBuildsAndRetry()
    const second = await started()
    expect(second).not.toBe(first)
    expect(plugins.installBundle).toHaveBeenLastCalledWith('x', { enabled: false, requestId: second, approvedBuilds: ['native'], registry: null, audience: 'both' })
    expect(state().install).toMatchObject({ subject: { spec: 'x', name: 'qilin-better-sidebar' }, failure: null })
    gates[1]!.resolve(ok({ ...APPLIED, bundle: 'qilin-better-sidebar', approvedBuilds: ['native'] }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(state().install).toMatchObject({ installed: 'qilin-better-sidebar', approvedBuilds: ['native'] })
    expect(plugins.installBundle).toHaveBeenCalledTimes(2)
  })

  it('drops an enable from the installed screen that settles after disposal', async () => {
    const enableGate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller } = bench({ setBundleEnabled: vi.fn().mockReturnValueOnce(enableGate.promise) })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('qilin-a')
    face.runInstall()
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    face.enableInstalled()
    expect(plugins.setBundleEnabled).toHaveBeenCalledWith('qilin-new', true)
    const before = state()
    controller.dispose()
    enableGate.resolve(ok(APPLIED))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(state()).toBe(before)
  })

  it('settles an install while reads run beside it', async () => {
    const gate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { plugins, face, state, controller, started } = bench({ installBundle: vi.fn().mockReturnValueOnce(gate.promise) })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('pkg')
    face.runInstall()
    await started()
    // The Host announces the change before the run answers; the read it triggers must not drop the answer.
    await controller.load()
    gate.resolve(ok({ ...APPLIED, bundle: 'pkg' }))
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
    expect(plugins.listBundles).toHaveBeenCalledTimes(3)
  })

  it('keeps the Host words and kind of a failed install, and settles a run whose last chunk never came', async () => {
    // Every run waits on its own gate, so chunks can land while it is installing.
    const gates: ReturnType<typeof deferred<Awaited<ReturnType<typeof ok<ChangeResult>> | ReturnType<typeof refused>>>>[] = []
    const { face, state, controller, plugins, started } = bench({
      installBundle: vi.fn(() => {
        const gate = deferred<Awaited<ReturnType<typeof ok<ChangeResult>> | ReturnType<typeof refused>>>()
        gates.push(gate)
        return gate.promise
      }),
    })
    const argv = ['pnpm', 'add', 'x']
    await controller.load()
    face.openInstall()
    face.editInstallSpec('x')
    let requestId = '' as PluginInstallRequestId
    const installing = async (): Promise<void> => {
      face.runInstall()
      requestId = await started()
    }
    const answer = (value: ReturnType<typeof ok<ChangeResult>> | ReturnType<typeof refused>): void => {
      gates[gates.length - 1]?.resolve(value)
    }
    // No chunk arrived: the Host's words are the reason, and there is no run; the kind is kept.
    await installing()
    answer(ok(failed({ code: 'operation-error', diagnostic: 'ERR_PNPM' }, { exitCode: 1, output: 'ERR_PNPM', truncated: false, logPath: '/l', kind: 'network' })))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.runs).toEqual([])
    expect(state().install.failure).toEqual({ reason: 'ERR_PNPM', code: 'operation-error', kind: 'network' })
    expect(state().install.subject).toEqual({ spec: 'x', ...INSPECTED })
    // A refused answer, not a failed change, keeps the transport's words and settles the run without an exit code.
    await installing()
    controller.appendLog({ requestId, jobId: 'j', argv, cwd: '/p', stream: 'stderr', text: 'streamed' })
    answer(refused('gateway/internal', 'offline'))
    await vi.waitFor(() => { expect(state().install.failure).toEqual({ reason: 'offline' }) })
    expect(state().install.runs).toEqual([{ jobId: 'j', command: 'pnpm add x', cwd: '/p', output: 'streamed', exitCode: null }])
    // A pnpm failure settles the open run with the code the answer names.
    await installing()
    controller.appendLog({ requestId, jobId: 'j', argv, cwd: '/p', stream: 'stdout', text: 'Done' })
    answer(ok(failed({ code: 'operation-error', diagnostic: 'tail' }, { exitCode: 7, output: 'tail', truncated: false, logPath: '/l', kind: 'unknown' })))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.runs).toEqual([{ jobId: 'j', command: 'pnpm add x', cwd: '/p', output: 'Done', exitCode: 7 }])
    // A failure after pnpm carries no package result: a run whose last chunk came keeps its own exit code, one still open settles without.
    await installing()
    controller.appendLog({ requestId, jobId: 'j', argv, cwd: '/p', stream: 'stdout', text: 'partial', exitCode: 0 })
    controller.appendLog({ requestId, jobId: 'k', argv, cwd: '/p', stream: 'stdout', text: 'open' })
    answer(ok(failed({ code: 'not-bundle' })))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.runs).toEqual([
      { jobId: 'j', command: 'pnpm add x', cwd: '/p', output: 'partial', exitCode: 0 },
      { jobId: 'k', command: 'pnpm add x', cwd: '/p', output: 'open', exitCode: null },
    ])
    expect(state().install.failure).toEqual({ reason: '', code: 'not-bundle' })
    // An incompatibility keeps the packages it names.
    await installing()
    answer(ok(failed({ code: 'incompatible-version', incompatible: [INCOMPATIBLE] })))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.failure).toEqual({ reason: '', code: 'incompatible-version', incompatible: [INCOMPATIBLE] })
    // A failure the Host does not explain has neither code nor words.
    await installing()
    answer(ok(failed()))
    await vi.waitFor(() => { expect(state().install.phase).toBe('failed') })
    expect(state().install.failure).toEqual({ reason: '' })
    expect(plugins.installBundle).toHaveBeenCalledTimes(6)
    // Editing the spec after a failure starts over too.
    face.editInstallSpec('y')
    expect(state().install).toMatchObject({ phase: 'idle', spec: 'y', runs: [], failure: null })
  })

  it('drops every late settlement after disposal', async () => {
    const enableGate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const installGate = deferred<ReturnType<typeof ok<ChangeResult>>>()
    const { face, state, controller, started } = bench({
      setBundleEnabled: vi.fn().mockReturnValueOnce(enableGate.promise),
      installBundle: vi.fn().mockReturnValueOnce(installGate.promise),
    })
    await controller.load()
    face.openInstall()
    face.editInstallSpec('x')
    face.runInstall()
    await started()
    face.setEnabled(BUNDLE.name, true)
    const before = state()
    controller.dispose()
    enableGate.resolve(ok(APPLIED))
    installGate.resolve(ok(APPLIED))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(state()).toBe(before)
    await controller.load()
    expect(state()).toBe(before)
    face.setEnabled(BUNDLE.name, false)
    expect(state()).toBe(before)
  })

  it('drops a read that settles after disposal', async () => {
    const gate = deferred<ReturnType<typeof ok<{ entries: never[]; managementAvailable: boolean }>>>()
    const { state, controller } = bench({ inventory: vi.fn().mockReturnValueOnce(gate.promise) })
    const loading = controller.load()
    await Promise.resolve()
    const before = state()
    controller.dispose()
    gate.resolve(ok({ entries: [], managementAvailable: true }))
    await loading
    expect(state()).toBe(before)
  })

  it('drops a bundle read that settles after disposal', async () => {
    const gate = deferred<ReturnType<typeof ok<BundleInfo[]>>>()
    const { state, controller } = bench({ listBundles: vi.fn().mockReturnValueOnce(gate.promise) })
    const loading = controller.load()
    await vi.waitFor(() => { expect(state().status).toBe('loading') })
    await Promise.resolve()
    const before = state()
    controller.dispose()
    gate.resolve(ok([BUNDLE]))
    await loading
    expect(state()).toBe(before)
  })

  it('reads the registry update check once, filters what it found, and words a failure', async () => {
    const gate = deferred<ReturnType<typeof ok<PluginUpdateSnapshot>>>()
    const { plugins, face, state, controller } = bench({
      checkUpdates: vi.fn()
        .mockReturnValueOnce(gate.promise)
        .mockResolvedValueOnce(refused('gateway/internal', 'offline'))
        .mockRejectedValueOnce(new Error('transport down')),
    })
    await controller.load()
    expect(state().updates).toEqual({ status: 'idle', entries: [], reason: '' })
    face.checkUpdates()
    face.checkUpdates()
    expect(state().updates.status).toBe('checking')
    // A second press while the check runs does not reach the Host.
    expect(plugins.checkUpdates).toHaveBeenCalledTimes(1)
    gate.resolve(ok({ entries: [
      { name: 'qilin-better-sidebar', currentVersion: '0.16.0', latestVersion: '0.17.0' },
      { name: 'qilin-current', currentVersion: '2.0.0', latestVersion: '2.0.0' },
      { name: 'qilin-unknown', currentVersion: '1.0.0', latestVersion: null },
    ] }))
    await vi.waitFor(() => { expect(state().updates.status).toBe('ready') })
    expect(state().updates).toEqual({
      status: 'ready',
      reason: '',
      entries: [{ name: 'qilin-better-sidebar', currentVersion: '0.16.0', latestVersion: '0.17.0' }],
    })
    // The results go away without asking the Host again.
    face.dismissUpdates()
    expect(state().updates).toEqual({ status: 'idle', entries: [], reason: '' })
    // A refused answer and a transport failure keep their words in the block.
    face.checkUpdates()
    await vi.waitFor(() => { expect(state().updates).toEqual({ status: 'failed', entries: [], reason: 'offline' }) })
    face.checkUpdates()
    await vi.waitFor(() => { expect(state().updates).toEqual({ status: 'failed', entries: [], reason: 'transport down' }) })
  })

  it('upgrades a layer through the install path, keeps its place, and drops the row it moved', async () => {
    const { plugins, face, state, controller } = bench({
      installBundle: vi.fn().mockResolvedValue(ok({ ...APPLIED, application: 'restart-required' })),
      checkUpdates: vi.fn().mockResolvedValue(ok({ entries: [{ name: BUNDLE.name, currentVersion: '0.16.0', latestVersion: '0.17.0' }] })),
    })
    await controller.load()
    face.checkUpdates()
    await vi.waitFor(() => { expect(state().updates.entries).toHaveLength(1) })
    face.updatePackage(BUNDLE.name)
    await vi.waitFor(() => { expect(state().busy).toEqual([]) })
    // The layer keeps the profile composition it had; only its version moves.
    expect(plugins.installBundle).toHaveBeenCalledExactlyOnceWith(`${BUNDLE.name}@latest`, { enabled: false })
    expect(state().updates.entries).toEqual([])
    expect(state().notice).toEqual({ kind: 'restart', packageName: BUNDLE.name, seq: 1 })
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
  })

  it('names a failed upgrade and leaves the row it could not move', async () => {
    const { face, state, controller } = bench({
      installBundle: vi.fn().mockResolvedValue(ok(failed({ code: 'operation-error', diagnostic: 'ERR_PNPM' }))),
      checkUpdates: vi.fn().mockResolvedValue(ok({ entries: [{ name: BUNDLE.name, currentVersion: '0.16.0', latestVersion: '0.17.0' }] })),
    })
    await controller.load()
    face.checkUpdates()
    await vi.waitFor(() => { expect(state().updates.entries).toHaveLength(1) })
    face.updatePackage(BUNDLE.name)
    await vi.waitFor(() => {
      expect(state().notice).toEqual({ kind: 'failed', action: 'update', code: 'operation-error', reason: 'ERR_PNPM', packageName: BUNDLE.name, seq: 1 })
    })
    expect(state().updates.entries).toEqual([{ name: BUNDLE.name, currentVersion: '0.16.0', latestVersion: '0.17.0' }])
  })

  it('searches the catalog, appends a later page, and keeps the words of a failed search', async () => {
    const gate = deferred<ReturnType<typeof ok<CommunityPluginSnapshot>>>()
    const { plugins, face, state, controller } = bench({
      catalog: vi.fn()
        .mockReturnValueOnce(gate.promise)
        .mockResolvedValueOnce(ok({ entries: [SECOND], page: 2, hasMore: false }))
        .mockResolvedValueOnce(refused('gateway/internal', 'offline')),
    })
    await controller.load()
    expect(state().catalog).toEqual({ status: 'idle', query: '', page: 1, entries: [], hasMore: false, reason: '' })
    face.catalog('sidebar', 1)
    face.catalog('sidebar', 1)
    expect(state().catalog).toEqual({ status: 'searching', query: 'sidebar', page: 1, entries: [], hasMore: false, reason: '' })
    expect(plugins.catalog).toHaveBeenCalledTimes(1)
    gate.resolve(ok({ entries: [FIRST], page: 1, hasMore: true }))
    await vi.waitFor(() => { expect(state().catalog.status).toBe('ready') })
    expect(state().catalog).toEqual({ status: 'ready', query: 'sidebar', page: 1, entries: [FIRST], hasMore: true, reason: '' })
    // A later page appends to what the first one answered.
    face.catalog('sidebar', 2)
    await vi.waitFor(() => { expect(state().catalog.entries).toEqual([FIRST, SECOND]) })
    expect(state().catalog).toMatchObject({ status: 'ready', page: 2, hasMore: false })
    // A search that starts over replaces the results, and a failure reports its own words.
    face.catalog('other', 1)
    await vi.waitFor(() => { expect(state().catalog).toMatchObject({ status: 'failed', query: 'other', reason: 'offline', entries: [] }) })
  })

  it('opens the install dialog with a catalog repository and leaves a run in flight alone', async () => {
    const check = deferred<ReturnType<typeof ok<typeof INSPECTED>>>()
    const { face, state } = bench({ inspect: vi.fn().mockReturnValueOnce(check.promise) })
    face.installCatalogSpec('https://github.com/acme/qilin-remote')
    expect(state().install).toMatchObject({ open: true, phase: 'idle', spec: 'https://github.com/acme/qilin-remote', subject: null })
    face.closeInstall()
    face.openInstall()
    face.editInstallSpec('slow')
    face.runInstall()
    expect(state().install.phase).toBe('checking')
    // The Host is checking a spec already; the catalog does not steal the dialog.
    face.installCatalogSpec('https://github.com/acme/qilin-tool')
    expect(state().install.spec).toBe('slow')
    check.resolve(ok(INSPECTED))
    await vi.waitFor(() => { expect(state().install.phase).toBe('done') })
  })

  it('drops an update check and a catalog search that settle after disposal', async () => {
    const check = deferred<ReturnType<typeof ok<PluginUpdateSnapshot>>>()
    const search = deferred<ReturnType<typeof ok<CommunityPluginSnapshot>>>()
    const { face, state, controller } = bench({
      checkUpdates: vi.fn().mockReturnValueOnce(check.promise),
      catalog: vi.fn().mockReturnValueOnce(search.promise),
    })
    await controller.load()
    face.checkUpdates()
    face.catalog('sidebar', 1)
    const before = state()
    controller.dispose()
    check.resolve(ok({ entries: [] }))
    search.resolve(ok({ entries: [], page: 1, hasMore: false }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(state()).toBe(before)
  })
})

describe('manual refresh feedback', () => {
  it('keeps cached packages while a manual refresh reads and ignores repeated refreshes without a success notice', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const { plugins, inventory, face, state, controller } = bench()
    await controller.load()
    const packages = state().packages
    const gate = deferred<ReturnType<typeof ok<BundleInfo[]>>>()
    plugins.listBundles.mockReturnValueOnce(gate.promise)
    face.refresh()
    expect(state()).toMatchObject({ status: 'ready', refreshStatus: 'refreshing', notice: null })
    expect(state().packages).toBe(packages)
    await vi.advanceTimersByTimeAsync(0)
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    face.refresh()
    face.refresh()
    gate.resolve(ok([{ ...BUNDLE, version: '0.17.0' }]))
    await vi.advanceTimersByTimeAsync(399)
    expect(state().refreshStatus).toBe('refreshing')
    await vi.advanceTimersByTimeAsync(1)
    expect(state().refreshStatus).toBe('idle')
    expect(state().packages[0]?.version).toBe('0.17.0')
    expect(state().status).toBe('ready')
    expect(state().notice).toBeNull()
    expect(inventory.list).toHaveBeenCalledTimes(2)
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    expect(plugins.listPlugins).toHaveBeenCalledTimes(2)
  })

  it.each(['refused', 'rejected'] as const)('keeps cached packages ready after a %s refresh and clears its toast when retry starts', async (failure) => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const { inventory, plugins, face, state, controller } = bench()
    await controller.load()
    const packages = state().packages
    if (failure === 'refused') inventory.list.mockResolvedValueOnce(refused('gateway/internal', 'offline'))
    else inventory.list.mockRejectedValueOnce(new Error('transport down'))
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state().refreshStatus).toBe('idle')
    expect(state()).toMatchObject({ status: 'ready', notice: { kind: 'refresh-failed', seq: 1 } })
    expect(state().packages).toBe(packages)
    const gate = deferred<ReturnType<typeof ok<BundleInfo[]>>>()
    plugins.listBundles.mockReturnValueOnce(gate.promise)
    face.refresh()
    expect(state()).toMatchObject({ status: 'ready', refreshStatus: 'refreshing', notice: null })
    expect(state().packages).toBe(packages)
    await vi.advanceTimersByTimeAsync(0)
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    gate.resolve(ok([BUNDLE]))
    await vi.advanceTimersByTimeAsync(400)
    expect(state().refreshStatus).toBe('idle')
    expect(state()).toMatchObject({ status: 'ready', notice: null })
    inventory.list.mockResolvedValueOnce(refused('gateway/internal', 'offline again'))
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state().notice).toEqual({ kind: 'refresh-failed', seq: 2 })
    face.dismissNotice()
    expect(state().notice).toBeNull()
  })

  it.each(['refused', 'rejected'] as const)('keeps a %s first refresh failure inline without a toast', async (failure) => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const inventory = failure === 'refused'
      ? vi.fn().mockResolvedValueOnce(refused('gateway/internal', 'offline'))
      : vi.fn().mockRejectedValueOnce(new Error('transport down'))
    const { face, state } = bench({ inventory })
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state().refreshStatus).toBe('failed')
    expect(state()).toMatchObject({ status: 'error', packages: [], notice: null })
  })

  it('treats an empty successful inventory as cached for refresh failures', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const { inventory, face, state, controller } = bench({ listBundles: vi.fn().mockResolvedValue(ok([])) })
    await controller.load()
    expect(state().packages).toEqual([])
    inventory.list.mockResolvedValueOnce(refused('gateway/internal', 'offline'))
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state().refreshStatus).toBe('idle')
    expect(state()).toMatchObject({ status: 'ready', packages: [], notice: { kind: 'refresh-failed' } })
  })

  it('forgets cached inventory when the managed profile becomes unavailable', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const { inventory, face, state, controller } = bench()
    await controller.load()
    inventory.list.mockResolvedValueOnce(ok({ entries: [], managementAvailable: false }))
    inventory.list.mockResolvedValueOnce(refused('gateway/internal', 'offline'))
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state()).toMatchObject({ status: 'unavailable', refreshStatus: 'idle', notice: null })
    // The next failed read has nothing cached: the failure shows inline, not as a toast over stale cards.
    inventory.list.mockResolvedValueOnce(ok({ entries: [], managementAvailable: true }))
    inventory.list.mockRejectedValueOnce(new Error('transport down again'))
    face.refresh()
    await vi.advanceTimersByTimeAsync(400)
    expect(state()).toMatchObject({ status: 'error', refreshStatus: 'failed', notice: null })
  })

  it('does not start the spinner for background reads', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const { plugins, state, controller } = bench()
    await controller.load()
    const gate = deferred<ReturnType<typeof ok<BundleInfo[]>>>()
    plugins.listBundles.mockReturnValueOnce(gate.promise)
    void controller.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(plugins.listBundles).toHaveBeenCalledTimes(2)
    expect(state()).toMatchObject({ status: 'ready', refreshStatus: 'idle' })
    gate.resolve(ok([BUNDLE]))
    await vi.advanceTimersByTimeAsync(0)
    expect(state()).toMatchObject({ status: 'ready', refreshStatus: 'idle' })
  })
})

describe('updatable', () => {
  it('keeps only the layers whose registry version differs from the installed one', () => {
    expect(updatable([
      { name: 'newer', currentVersion: '1.0.0', latestVersion: '1.1.0' },
      { name: 'current', currentVersion: '1.0.0', latestVersion: '1.0.0' },
      { name: 'unreadable', currentVersion: '1.0.0', latestVersion: null },
      { name: 'uninstalled', currentVersion: null, latestVersion: '0.1.0' },
    ])).toEqual([
      { name: 'newer', currentVersion: '1.0.0', latestVersion: '1.1.0' },
      { name: 'uninstalled', currentVersion: null, latestVersion: '0.1.0' },
    ])
  })
})
