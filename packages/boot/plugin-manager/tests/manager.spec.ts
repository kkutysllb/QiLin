/** Persistent manager behavior through a real profile Include and Loader. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { Context } from '@qilin/kylin'
import { expect, it, onTestFinished, vi } from 'vitest'
import {
  boot, composeEntries, getQilinRuntimeVersion, initProfile, readProfilePatches, readProfileManifest, reconcileProfilePatches,
  OPTIONAL_BUNDLES, type ProfileContext,
} from '@qilin/app-boot'
import PluginManager, { type Config, type PluginChange, type PluginInstallLogChunk, type PluginInstallProgress, type PluginInstallRequestId } from '../src/index.ts'
import Hmr from '@qilin/hmr'
import Timer from '@qilin/kylin-plugin-timer'
import type { PatchOptions } from '@qilin/kylin-plugin-include'
import { Group } from '@qilin/kylin-plugin-loader'
import * as operations from '../src/operations.ts'
import * as githubConnection from '../src/github-connection.ts'
import { parse, parseDocument } from 'yaml'

/** npm's own registry, which pnpm names without configuration. */
const OFFICIAL = 'https://registry.npmjs.org/'
/** The public mirror a shipped configuration falls back to. */
const MIRROR = 'https://registry.npmmirror.com/'

async function fixture(
  reload: 'live' | 'startup' = 'live', overlay = false, prepare?: (ctx: Context) => void, config: Config = {},
  packageManager?: ProfileContext['packageManager'], mutateProfile?: (dir: string) => void,
  profileName = 'test',
) {
  // pnpm resolves workspace roots through native realpath, including Windows 8.3 aliases.
  const home = await realpath(mkdtempSync(join(tmpdir(), 'plugin-manager-')))
  const dir = join(home, 'profiles', profileName)
  const anchor = join(home, 'package.json')
  writeFileSync(anchor, '{"name":"installation","dependencies":{}}\n')
  initProfile(dir, ['core', 'extra'])
  const bundle = (name: string, rows: unknown[]) => {
    const path = join(dir, 'node_modules', name)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', qilin: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(path, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }]))
    writeFileSync(join(path, 'plugin.mjs'), 'export function apply(ctx, config) { if (config?.fail) throw new Error("test activation failed"); ctx.provide(config?.service ?? "managedProbe", true) }\n')
  }
  bundle('core', [{ id: 'manager', name: 'cordis:manager', config }])
  bundle('extra', [{ id: 'managed', name: './plugin.mjs' }])
  // The declaration a bundle carries decides its admission, which happens while the profile loads.
  mutateProfile?.(dir)
  const manifest = readProfileManifest(profileName, dir)
  manifest.dependencies = { extra: '1.0.0' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const overlays: PatchOptions[] = overlay ? [{ id: 'managed', disabled: true }] : []
  const profile: ProfileContext = {
    name: profileName,
    ...(packageManager === undefined ? {} : { packageManager }),
    startedBundles: ['core', 'extra'],
    dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: anchor, cwd: home, home,
    overlays, telemetryDisabledEnv: undefined,
  }
  const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches(profileName, profile), (ctx) => {
    ctx.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
    prepare?.(ctx)
    ctx.provide('profileContext', profile)
    ctx.loader.builtins.manager = PluginManager
  })
  onTestFinished(async () => { await ctx.fiber.dispose(); rmSync(home, { recursive: true, force: true }) })
  // What pnpm's own configuration names is read before every registry plan; the fixture answers npm's own registry.
  const registry = vi.spyOn(operations, 'readProfileRegistry').mockResolvedValue('https://registry.npmjs.org/')
  onTestFinished(() => { registry.mockRestore() })
  let stopHmr = async () => {}
  if (reload === 'live') {
    await ctx.plugin(Timer)
    const owner = await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 })
    stopHmr = () => owner.dispose()
    await ctx.hmr.runExclusive(async () => {})
  }
  return { ctx, dir, manager: ctx.pluginManager, bundle, profile, stopHmr, overlays }
}

it('lists bundle versions and current-profile plugin targets', async () => {
  const { manager, dir } = await fixture()
  const plugins = await manager.listPlugins()
  expect(plugins.find(row => row.entryId === 'include:managed')).toMatchObject({ patchId: 'managed', enabled: true })
  expect(plugins.find(row => row.entryId === 'include:manager')?.readOnlyReason).toBe('management-required')
  expect(await manager.listBundles()).toEqual([
    {
      name: 'core', version: '1.0.0', meta: { title: 'core' }, enabled: true, installed: false, optional: false,
      updatable: true, removable: false, readOnlyReason: 'management-required',
      rows: [{ rowId: 'manager', moduleName: 'cordis:manager', entryId: 'include:manager' }], overrides: [],
    },
    {
      name: 'extra', version: '1.0.0', meta: { title: 'extra' }, enabled: true, installed: true, optional: false,
      updatable: true, removable: true, source: 'extra@1.0.0',
      rows: [{ rowId: 'managed', moduleName: pathToFileURL(join(dir, 'node_modules', 'extra', 'plugin.mjs')).href, entryId: 'include:managed' }], overrides: [],
    },
  ])
})

it('reports shipped layers locked at the layer level and owner layers switchable', async () => {
  // The shipped template locks the layer: a profile switches it off through its
  // rows, because dropping the entry would come back on the next load.
  const { manager, dir, profile } = await fixture('live', false, undefined, {}, undefined, undefined, 'web')
  const shipped = '@qilin/web-app'
  const owner = 'dsh-animations'
  for (const [name, version] of [[shipped, '3.0.4'], [owner, '1.2.3']] as const) {
    const installedDir = join(dirname(profile.installAnchor), 'node_modules', name)
    mkdirSync(installedDir, { recursive: true })
    writeFileSync(join(installedDir, 'package.json'), JSON.stringify({
      name, version, qilin: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(installedDir, 'cordis.patch.yml'), '[]\n')
  }
  const installation = JSON.parse(readFileSync(profile.installAnchor, 'utf8')) as { dependencies: Record<string, string> }
  installation.dependencies = { ...installation.dependencies, [shipped]: '3.0.4' }
  writeFileSync(profile.installAnchor, JSON.stringify(installation))
  const manifest = readProfileManifest(profile.name, dir)
  manifest.qilin = { profile: { bundles: ['core', shipped, owner] } }
  // The owner layer arrives the way a plugin-channel install writes it: listed
  // as a profile dependency, which is what makes it removable.
  manifest.dependencies = { ...manifest.dependencies, [owner]: '^1.2.3' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))

  const rows = await manager.listBundles()
  // A shipped layer moves with the installation.
  expect(rows.find(row => row.name === shipped)).toMatchObject({
    enabled: true, installed: false, optional: false, updatable: false, removable: false, readOnlyReason: 'shipped-layer',
  })
  // A retired template name installed back through the plugin channel is the
  // profile's own layer: updatable and removable, with no shipped lock.
  expect(rows.find(row => row.name === owner)).toMatchObject({
    enabled: true, installed: true, optional: false, updatable: true, removable: true,
  })
  expect(rows.find(row => row.name === owner)?.readOnlyReason).toBeUndefined()
  // A bundle the template never named keeps being switchable as a layer.
  expect(rows.find(row => row.name === 'extra')?.updatable).toBe(true)
  expect(rows.find(row => row.name === 'extra')?.readOnlyReason).toBeUndefined()
})

it('offers the registry latest for a bundle the installation supplies and the profile does not install', async () => {
  const { manager, profile } = await fixture()
  // A shipped bundle: the profile lists it without depending on it, so the
  // copy the installation carries serves until an upgrade lands in the profile.
  const anchor = profile.installAnchor
  const installation = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies: Record<string, string> }
  installation.dependencies = { ...installation.dependencies, 'shipped-anim': '1.2.3' }
  writeFileSync(anchor, JSON.stringify(installation))
  const shipped = join(dirname(anchor), 'node_modules', 'shipped-anim')
  mkdirSync(shipped, { recursive: true })
  writeFileSync(join(shipped, 'package.json'), JSON.stringify({
    name: 'shipped-anim', version: '1.2.3', qilin: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(shipped, 'cordis.patch.yml'), '[]\n')
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ latest: '1.3.0' }), { status: 200 }))
  onTestFinished(() => { vi.unstubAllGlobals() })

  expect((await manager.listBundles()).find(row => row.name === 'shipped-anim'))
    .toMatchObject({ version: '1.2.3', enabled: false, installed: false, removable: false })
  expect((await manager.checkUpdates()).entries.find(entry => entry.name === 'shipped-anim'))
    .toEqual({ name: 'shipped-anim', currentVersion: '1.2.3', latestVersion: '1.3.0' })
})

it('describes a bundle by its manifest and patch: one-liner, rows without a live entry, and the built-in rows it changes', async () => {
  const { manager, dir, bundle } = await fixture()
  bundle('described', [{ id: 'described-row', name: './plugin.mjs' }])
  writeFileSync(join(dir, 'node_modules', 'described', 'package.json'), JSON.stringify({
    name: 'described', version: '2.0.0', description: 'Describes itself.', qilin: { bundle: { patch: './cordis.patch.yml' } },
  }))
  // An anonymous row is not addressable and is left out of the rows.
  writeFileSync(join(dir, 'node_modules', 'described', 'cordis.patch.yml'), JSON.stringify([
    { insert: [{ id: 'described-row', name: './plugin.mjs' }, { name: './plugin.mjs' }] }, { id: 'managed', disabled: true }, { id: 'described-row', config: {} },
  ]))
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = { ...manifest.dependencies, described: '2.0.0' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  const moduleName = pathToFileURL(join(dir, 'node_modules', 'described', 'plugin.mjs')).href
  expect((await manager.listBundles()).find(row => row.name === 'described')).toEqual({
    name: 'described', version: '2.0.0', meta: { title: 'described', description: 'Describes itself.' },
    description: 'Describes itself.', source: 'described@2.0.0', enabled: false, installed: true, optional: false,
    updatable: true, removable: true,
    rows: [{ rowId: 'described-row', moduleName }], overrides: ['managed'],
  })
  await manager.setBundleEnabled('described', true)
  expect((await manager.listBundles()).find(row => row.name === 'described')?.rows).toEqual([
    { rowId: 'described-row', moduleName, entryId: 'include:described-row' },
  ])
  // Off again, the rows lose their entries.
  await manager.setBundleEnabled('described', false)
  expect((await manager.listBundles()).find(row => row.name === 'described')?.rows).toEqual([{ rowId: 'described-row', moduleName }])
})

it('names where each installed bundle comes from as a spec pnpm installs', async () => {
  const { manager, dir, bundle, profile } = await fixture()
  const recorded: Record<string, string> = {
    extra: '^1.0.0', tagged: 'latest', aliased: 'npm:@acme/aliased@2', jsr: 'jsr:@acme/jsr@^1', github: 'github:someone/dsh-plugin#v1',
    ssh: 'git@github.com:someone/dsh-plugin.git', deploy: 'deploy@git.corp:team/dsh-plugin.git',
    sshUrl: 'git+ssh://git@github.com/someone/dsh-plugin.git', email: 'git+http://user@example.com:secret@git.example.com/repo.git',
    tarball: 'https://cdn.example.com/dsh-x-1.0.0.tgz', token: 'https://ghp_secret@cdn.example.com/dsh-x-1.0.0.tgz',
    password: 'git+https://someone:secret@git.example.com/someone/dsh-plugin.git#main',
    relative: 'file:../plugins/relative', linked: 'link:/plugins/linked', home: 'file:~/plugins/home',
    aliasLocal: 'file:../plugins/original', shadowed: '1.0.0',
  }
  for (const name of Object.keys(recorded)) bundle(name, [])
  // Installed under a name other than its own, the package keeps that name only when the spec carries it.
  writeFileSync(join(dir, 'node_modules', 'aliasLocal', 'package.json'), JSON.stringify({ name: 'original', version: '1.0.0', qilin: { bundle: { patch: './cordis.patch.yml' } } }))
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = recorded
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  // The installation's own copy of a bundle is the one that loads, so the profile's dependency on it names nothing.
  writeFileSync(profile.installAnchor, JSON.stringify({ name: 'installation', dependencies: { shadowed: '1.0.0' } }))
  expect(Object.fromEntries((await manager.listBundles()).map(row => [row.name, row.source]))).toEqual({
    core: undefined, extra: 'extra@^1.0.0', tagged: 'tagged@latest', aliased: 'aliased@npm:@acme/aliased@2', jsr: 'jsr@jsr:@acme/jsr@^1',
    github: 'github:someone/dsh-plugin#v1', ssh: 'git@github.com:someone/dsh-plugin.git', deploy: 'deploy@git.corp:team/dsh-plugin.git',
    sshUrl: 'git+ssh://git@github.com/someone/dsh-plugin.git', email: 'git+http://git.example.com/repo.git',
    tarball: 'https://cdn.example.com/dsh-x-1.0.0.tgz', token: 'https://cdn.example.com/dsh-x-1.0.0.tgz',
    password: 'git+https://git.example.com/someone/dsh-plugin.git#main',
    relative: `file:${resolve(dir, '../plugins/relative')}`, linked: `link:${resolve(dir, '/plugins/linked')}`,
    home: `file:${resolve(homedir(), 'plugins/home')}`, aliasLocal: `aliasLocal@file:${resolve(dir, '../plugins/original')}`, shadowed: undefined,
  })
})

it('turns a plugin off and on without duplicating patch overrides', async () => {
  const { manager, dir } = await fixture()
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ changed: true, application: 'applied' })
  expect((await manager.listPlugins()).find(row => row.entryId === id)?.enabled).toBe(false)
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ changed: false, application: 'applied' })
  expect(await manager.setPluginEnabled(id, true)).toMatchObject({ changed: true, application: 'applied' })
  expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8').match(/id: managed/g)).toHaveLength(1)
})

it('retains installed dependencies when toggling a bundle and appends it when re-enabled', async () => {
  const { manager, dir, bundle } = await fixture()
  bundle('third', [])
  await manager.setBundleEnabled('third', true)
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({ changed: true, application: 'applied' })
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({ changed: false, application: 'applied' })
  expect(readProfileManifest('test', dir).dependencies).toEqual({ extra: '1.0.0' })
  expect((await manager.listPlugins()).some(row => row.patchId === 'managed')).toBe(false)
  await manager.setBundleEnabled('extra', true)
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['core', 'third', 'extra'])
})

it('reports an overlay overriding a saved plugin toggle', async () => {
  const { manager } = await fixture('live', true)
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, true)).toMatchObject({ changed: true, application: 'overridden' })
})

it('saves startup-only toggles and refuses removal of currently used packages', async () => {
  const { manager } = await fixture('startup')
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ application: 'restart-required' })
  expect((await manager.listPlugins()).find(row => row.entryId === id)?.enabled).toBe(true)
  await manager.setBundleEnabled('extra', false)
  expect(await manager.removeBundle('extra')).toMatchObject({ changed: false, application: 'failed', error: { code: 'stop-profile' } })
})

it('refuses self-disable, unknown entries and removal of installation-owned bundles', async () => {
  const { manager } = await fixture()
  const id = (await manager.listPlugins()).find(row => row.entryId === 'include:manager')!.entryId
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ changed: false, application: 'failed', error: { code: 'management-required' } })
  expect(await manager.setPluginEnabled('missing' as typeof id, true)).toMatchObject({ changed: false, application: 'failed', error: { code: 'unknown-plugin' } })
  expect(await manager.removeBundle('core')).toMatchObject({ changed: false, application: 'failed', error: { code: 'not-removable' } })
  // A name no bundle directory answers to fails with the resolver's own diagnostic.
  expect(await manager.setBundleEnabled('unknown', true)).toMatchObject({ changed: false, application: 'failed', error: { code: 'operation-error' } })
})

it('installs only valid bundle declarations and honors installation without activation', async () => {
  const { manager, dir, bundle } = await fixture()
  const initial = readProfileManifest('test', dir)
  delete initial.dependencies
  writeFileSync(join(dir, 'package.json'), JSON.stringify(initial))
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async (_context, args) => {
    const name = String(args[1])
    bundle(name, [{ id: name, name: './plugin.mjs', config: { service: name } }])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, [name]: '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  expect(await manager.installBundle('new-bundle', { enabled: false })).toMatchObject({
    changed: true, application: 'applied', stage: 'enable', target: 'new-bundle', bundle: 'new-bundle', packageResult: { exitCode: 0 },
  })
  expect((await manager.listBundles()).find(row => row.name === 'new-bundle')?.enabled).toBe(false)
  expect(await manager.setBundleEnabled('new-bundle', true)).toMatchObject({ application: 'applied' })
  expect((await manager.listPlugins()).find(row => row.patchId === 'new-bundle')?.fiberPhase).toBe('active')
  expect(await manager.installBundle('another-bundle')).toMatchObject({ application: 'applied' })
  expect((await manager.listBundles()).find(row => row.name === 'another-bundle')?.enabled).toBe(true)
})

it('refreshes runtime package resolution after an install and keeps deselected startup bundles untouched', async () => {
  const refresh = vi.fn(async () => undefined)
  const { manager, dir, bundle } = await fixture('startup', false, (ctx) => {
    ctx.provide('pluginPackages', { refresh } as unknown as Context['pluginPackages'])
  })
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async (_context, args) => {
    const name = String(args[1])
    bundle(name, [{ id: name, name: './plugin.mjs', config: { service: name } }])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, [name]: '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  expect(await manager.installBundle('new-bundle', { enabled: true })).toMatchObject({ changed: true, stage: 'enable' })
  expect(refresh).toHaveBeenCalledTimes(1)
  // A started bundle deselected for this run keeps running on the existing package table.
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({ changed: true, application: 'restart-required' })
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('refreshes runtime package resolution when live reload deselects a started bundle', async () => {
  const refresh = vi.fn(async () => undefined)
  const { manager } = await fixture('live', false, (ctx) => {
    ctx.provide('pluginPackages', { refresh } as unknown as Context['pluginPackages'])
  })
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({ application: 'applied' })
  expect(refresh).toHaveBeenCalledTimes(1)
})

it.each(['network', 'timeout'] as const)('stops a GitHub %s before pnpm and attributes it to the repository', async (kind) => {
  const { manager, dir } = await fixture()
  const connection = vi.spyOn(githubConnection, 'checkGithubConnection')
  const pnpm = vi.spyOn(operations, 'runProfilePnpm')
  onTestFinished(() => { connection.mockRestore(); pnpm.mockRestore() })
  const before = readFileSync(join(dir, 'package.json'), 'utf8')
  const failure = { exitCode: 1, output: 'GitHub check failed', truncated: false, logPath: join(dir, 'git.log'), kind }
  connection.mockResolvedValue(failure)
  expect(await manager.installBundle('https://github.com/acme/qilin-plugin.git')).toMatchObject({
    application: 'failed', changed: false, stage: 'install', failedAt: 'spec-host', packageResult: failure,
  })
  expect(pnpm).not.toHaveBeenCalled()
  expect(connection).toHaveBeenCalledWith(
    { kind: 'git', spec: 'https://github.com/acme/qilin-plugin.git', host: 'github.com' }, dir,
    expect.objectContaining({ timeoutMs: 5000 }),
  )
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
})

it('leaves non-network GitHub errors to pnpm and forwards the profile Git environment and deadline', async () => {
  const env = { GIT_CONFIG_GLOBAL: '/application/git.config' }
  const { manager, dir } = await fixture('live', false, undefined, { githubConnectionTimeoutMs: 8000 }, { command: 'pnpm', args: [], env })
  const connection = vi.spyOn(githubConnection, 'checkGithubConnection')
  const pnpm = vi.spyOn(operations, 'runProfilePnpm')
  onTestFinished(() => { connection.mockRestore(); pnpm.mockRestore() })
  connection.mockResolvedValue({ exitCode: 128, output: 'fatal: Authentication failed', truncated: false, logPath: 'git.log', kind: 'unknown' })
  const failure = { exitCode: 1, output: 'pnpm owns authentication', truncated: false, logPath: 'pnpm.log', kind: 'unknown' as const }
  pnpm.mockResolvedValue(failure)
  const result = await manager.installBundle('github:acme/qilin-private-plugin')
  expect(result.application).toBe('failed')
  expect(result.packageResult).toEqual(failure)
  expect(result.failedAt).toBeUndefined()
  expect(pnpm).toHaveBeenCalledOnce()
  expect(connection).toHaveBeenCalledWith(
    { kind: 'git', spec: 'github:acme/qilin-private-plugin', host: 'github.com' }, dir,
    expect.objectContaining({ timeoutMs: 8000, env }),
  )
})

it('cancels an active GitHub check before starting pnpm', async () => {
  const { manager } = await fixture()
  const connection = vi.spyOn(githubConnection, 'checkGithubConnection')
  const pnpm = vi.spyOn(operations, 'runProfilePnpm')
  onTestFinished(() => { connection.mockRestore(); pnpm.mockRestore() })
  const entered = Promise.withResolvers<undefined>()
  connection.mockImplementation(async (_spec, _dir, options) => {
    entered.resolve(undefined)
    await new Promise<void>((resolve) => { options.signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    return { exitCode: 1, output: 'cancelled', truncated: false, logPath: 'git.log', kind: 'unknown' }
  })
  const requestId = '824103ec-bc45-489d-bb85-5b4fe0aefc78' as PluginInstallRequestId
  const installing = manager.installBundle('github:acme/qilin-plugin', { requestId })
  await entered.promise
  expect(await manager.cancelInstall(requestId)).toEqual({ status: 'cancelled' })
  expect(await installing).toMatchObject({ application: 'cancelled', changed: false })
  expect(pnpm).not.toHaveBeenCalled()
})

it('reports blocked scripts after a failed installation and retries only after explicit profile build approval', async () => {
  const { manager, dir, bundle } = await fixture()
  const policy = join(dir, 'pnpm-workspace.yaml')
  const run = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    const manifest = readProfileManifest('test', dir)
    const completion = { exitCode: 0, output: '', truncated: false, logPath: join(dir, 'pnpm.log') }
    manifest.dependencies = { ...manifest.dependencies, addon: '1.0.0' }
    if (run.mock.calls.length === 1) {
      writeFileSync(policy, 'allowBuilds:\n  native: set this to true or false\n  denied: false\n')
      completion.exitCode = 1
      completion.output = 'ERR_PNPM_IGNORED_BUILDS'
    } else {
      expect(parse(readFileSync(policy, 'utf8'))).toEqual({ allowBuilds: { native: true, denied: false } })
      bundle('addon', [])
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return completion
  })
  onTestFinished(() => { run.mockRestore() })
  // The failed run's manifest change is put back; the policy pnpm wrote stays, so its undecided names can be offered.
  expect(await manager.installBundle('addon')).toMatchObject({ application: 'failed', pendingBuilds: ['native'] })
  expect(readProfileManifest('test', dir).dependencies).not.toHaveProperty('addon')
  expect(parse(readFileSync(policy, 'utf8'))).toMatchObject({ allowBuilds: { native: 'set this to true or false' } })
  expect(await manager.installBundle('addon', { approvedBuilds: ['denied'] })).toMatchObject({ application: 'failed', changed: false, error: { code: 'stale-approval' } })
  expect(run).toHaveBeenCalledTimes(1)
  expect(await manager.installBundle('addon', { approvedBuilds: ['native'], enabled: false })).toMatchObject({
    application: 'applied', changed: true, approvedBuilds: ['native'],
  })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).not.toContain('addon')
})

it('retains approved policy and reports it as changed when the registry fails before adding a dependency', async () => {
  const { manager, dir } = await fixture()
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  native: set this to true or false\n')
  const run = vi.spyOn(operations, 'runProfilePnpm').mockResolvedValue({ exitCode: 1, output: 'registry unavailable', truncated: false, logPath: '/log' })
  onTestFinished(() => { run.mockRestore() })
  expect(await manager.installBundle('addon', { approvedBuilds: ['native'] })).toMatchObject({
    changed: true, application: 'failed', pendingBuilds: [], approvedBuilds: ['native'], error: { diagnostic: 'registry unavailable' },
  })
  expect(parse(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'))).toEqual({ allowBuilds: { native: true } })
})

it('runs a real pnpm dependency script only after approval and retry', async () => {
  const { manager, dir, profile } = await fixture('startup')
  const addon = join(profile.cwd, 'addon')
  mkdirSync(addon)
  writeFileSync(join(addon, 'package.json'), JSON.stringify({ name: 'approval-fixture-addon', version: '1.0.0',
    scripts: { install: 'node build.cjs' }, qilin: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(addon, 'build.cjs'), 'require("node:fs").writeFileSync("built.txt", "built")\n')
  writeFileSync(join(addon, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(dir, 'package.json'), '{"name":"approval-fixture","private":true}\n')
  const policy = parseDocument(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'))
  policy.set('offline', true)
  policy.set('storeDir', join(profile.cwd, 'store'))
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), String(policy))
  const blocked = await manager.installBundle('file:./addon', { enabled: false })
  expect(blocked, JSON.stringify(blocked)).toMatchObject({ application: 'failed', packageResult: { kind: 'build-blocked' } })
  expect(blocked.pendingBuilds).toHaveLength(1)
  const built = join(dir, 'node_modules', 'approval-fixture-addon', 'built.txt')
  expect(existsSync(built)).toBe(false)
  expect(readProfileManifest('test', dir).dependencies?.['approval-fixture-addon']).toBeUndefined()
  const allowed = await manager.installBundle('file:./addon', { enabled: false, approvedBuilds: blocked.pendingBuilds! })
  expect(allowed, JSON.stringify(allowed)).toMatchObject({ application: 'restart-required', packageResult: { exitCode: 0 } })
  expect(readFileSync(built, 'utf8')).toBe('built')
})

it.each(['[', 'allowBuilds: false\n'])('preserves pnpm diagnostics when pending approvals cannot be read: %s', async (policy) => {
  const { manager, dir } = await fixture()
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), policy)
  const run = vi.spyOn(operations, 'runProfilePnpm').mockResolvedValue({ exitCode: 1, output: 'original pnpm failure', truncated: false, logPath: '/log' })
  onTestFinished(() => { run.mockRestore() })
  expect(await manager.installBundle('addon')).toMatchObject({ application: 'failed', error: { diagnostic: 'original pnpm failure' } })
})

it('unloads before removing packages and retries inactive dependencies whose files are missing', async () => {
  const { manager, dir, ctx } = await fixture()
  const remove = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    await ctx.hmr.runExclusive(async () => {
      expect([...ctx.loader.entries()].some(row => row.id === 'include:managed')).toBe(false)
    })
    return { exitCode: 1, output: 'removal failed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { remove.mockRestore() })
  expect(await manager.removeBundle('extra')).toMatchObject({ changed: true, application: 'failed', packageResult: { exitCode: 1 } })
  expect(readProfileManifest('test', dir).dependencies).toEqual({ extra: '1.0.0' })
  expect((await manager.listBundles()).find(row => row.name === 'extra')?.enabled).toBe(false)
  rmSync(join(dir, 'node_modules', 'extra'), { recursive: true })
  remove.mockImplementationOnce(async () => {
    const manifest = readProfileManifest('test', dir)
    delete manifest.dependencies?.extra
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'removed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  expect(await manager.removeBundle('extra')).toMatchObject({ changed: true, application: 'applied' })
  expect((await manager.listBundles()).some(row => row.name === 'extra')).toBe(false)
})

it('restores the manifest and lockfile after a failed package run, classifying the failure', async () => {
  const { manager, dir } = await fixture()
  const lockPath = join(dir, 'pnpm-lock.yaml')
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, partial: '1' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    writeFileSync(lockPath, 'partial lockfile\n')
    return { exitCode: 42, output: 'ERR_PNPM_META_FETCH_FAIL  GET https://registry/partial: ENOTFOUND', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  const before = readFileSync(join(dir, 'package.json'), 'utf8')
  // A registry that does not answer sends the installation on to the configured fallback; the failure reported is the last one's.
  expect(await manager.installBundle('partial')).toMatchObject({
    changed: false, application: 'failed', stage: 'install', target: 'partial',
    error: { code: 'operation-error', diagnostic: expect.stringContaining('ENOTFOUND') as string },
    packageResult: { exitCode: 42, kind: 'network' }, registries: [null, MIRROR],
  })
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  // A lockfile the run created is removed; one that existed is put back.
  expect(existsSync(lockPath)).toBe(false)
  writeFileSync(lockPath, 'original lockfile\n')
  expect(await manager.installBundle('partial')).toMatchObject({ changed: false, application: 'failed' })
  expect(readFileSync(lockPath, 'utf8')).toBe('original lockfile\n')
  expect((await manager.listBundles()).some(row => row.name === 'partial')).toBe(false)
  expect(install).toHaveBeenCalledTimes(4)
})

it('keeps saved changes after activation failure and allows a corrected configuration to retry', async () => {
  const { manager, dir } = await fixture()
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: managed\n  disabled: true\n  config: { fail: true }\n')
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, true)).toMatchObject({ changed: true, application: 'failed' })
  expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain('disabled: false')
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: managed\n  disabled: true\n  config: { fail: false }\n')
  const result = await manager.setPluginEnabled(id, true)
  expect(result, JSON.stringify(result)).toMatchObject({ application: 'applied' })
})


it('reports a selected plain dependency as a problem, omits an unselected one, and reports missing versions', async () => {
  const { manager, dir, profile } = await fixture()
  writeFileSync(profile.installAnchor, '{}')
  writeFileSync(join(dir, 'node_modules', 'extra', 'package.json'), '{"name":"extra"}')
  expect((await manager.listBundles()).find(row => row.name === 'extra')).toMatchObject({ enabled: true, source: 'extra@1.0.0', error: { code: 'not-bundle' } })
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({ application: 'applied' })
  // Switched off, a dependency without a bundle patch is a library the page has no business with.
  expect((await manager.listBundles()).some(row => row.name === 'extra')).toBe(false)
  expect(await manager.setBundleEnabled('extra', true)).toMatchObject({ changed: false, application: 'failed' })
  writeFileSync(join(dir, 'node_modules', 'core', 'package.json'), '{"name":"core","qilin":{"bundle":{"patch":"./cordis.patch.yml"}}}')
  expect((await manager.listBundles())[0]?.version).toBeUndefined()
  writeFileSync(join(dir, 'package.json'), '{}')
  expect(await manager.listBundles()).toEqual([])
  expect(await manager.setBundleEnabled('unknown', false)).toMatchObject({ application: 'failed' })
  writeFileSync(profile.installAnchor, '{"dependencies":{"missing-builtin":"1"}}')
  expect(await manager.listBundles()).toEqual([])
})

it('refuses management bundle disablement and permits repeated bundle selections', async () => {
  const { manager } = await fixture()
  expect(await manager.setBundleEnabled('core', false)).toMatchObject({ application: 'failed', changed: false })
  expect(await manager.setBundleEnabled('extra', true)).toMatchObject({ application: 'applied', changed: false })
})

it.each([
  '@qilin/host-plugin-inventory',
  '@qilin/typert-registry',
  '@qilin/api-remotes',
])('protects the management dependency %s and its containing bundle', async (name) => {
  const { ctx, manager, bundle, profile, dir } = await fixture('startup')
  bundle('extra', [{ id: 'dependency', name, disabled: true }])
  await reconcileProfilePatches(ctx, readProfilePatches('test', profile), 'test')
  const entry = (await manager.listPlugins()).find(row => row.moduleName === name)!
  expect(entry).toMatchObject({ readOnlyReason: 'management-required' })
  const manifest = readFileSync(join(dir, 'package.json'), 'utf8')
  const patch = readFileSync(profile.patchPath, 'utf8')
  expect(await manager.setPluginEnabled(entry.entryId, false)).toMatchObject({
    changed: false, application: 'failed', error: { code: 'management-required' },
  })
  expect((await manager.listBundles()).find(row => row.name === 'extra')).toMatchObject({
    removable: false, readOnlyReason: 'management-required',
  })
  expect(await manager.setBundleEnabled('extra', false)).toMatchObject({
    changed: false, application: 'failed', error: { code: 'management-required' },
  })
  expect(await manager.removeBundle('extra')).toMatchObject({
    changed: false, application: 'failed', error: { code: 'not-removable' },
  })
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
  expect(readFileSync(profile.patchPath, 'utf8')).toBe(patch)
})

it('addresses children inside profile groups and marks ambiguous ids read-only', async () => {
  const { manager, bundle, profile } = await fixture('live', false, (ctx) => { ctx.loader.builtins.group = Group })
  bundle('grouped', [{ id: 'group', name: 'cordis:group', group: true,
    config: [{ id: 'child', name: './plugin.mjs', config: { service: 'child' } }] }])
  expect(await manager.setBundleEnabled('grouped', true)).toMatchObject({ application: 'applied' })
  expect((await manager.listPlugins()).find(row => row.patchId === 'child')).toBeDefined()
  const entries = composeEntries([readProfilePatches('test', profile)])
  const duplicate = entries.find(row => row.id === 'managed')!
  writeFileSync(profile.patchPath, JSON.stringify([{ insert: [duplicate] }]))
  expect((await manager.listPlugins()).find(row => row.entryId === 'include:managed')?.readOnlyReason).toBe('unaddressable')
})

it.each(['', '-g'])('rejects an invalid installation spec before calling pnpm: %j', async (spec) => {
  const { manager } = await fixture()
  expect(await manager.installBundle(spec)).toMatchObject({ changed: false, application: 'failed', error: { code: 'invalid-spec' } })
})

it('restores the manifest when the package pnpm added declares no bundle', async () => {
  const { manager, dir, bundle } = await fixture()
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    bundle('plain', [])
    writeFileSync(join(dir, 'node_modules', 'plain', 'package.json'), '{"name":"plain"}')
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, plain: '1' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  expect(await manager.installBundle('plain')).toMatchObject({
    changed: false, application: 'failed', stage: 'install', error: { code: 'not-bundle' }, packageResult: { exitCode: 0 },
  })
  // The manifest is put back rather than cleaned through another pnpm run.
  expect(install).toHaveBeenCalledOnce()
  expect(readProfileManifest('test', dir)).toMatchObject({ dependencies: { extra: '1.0.0' }, qilin: { profile: { bundles: ['core', 'extra'] } } })
  expect((await manager.listBundles()).some(row => row.name === 'plain')).toBe(false)
})

it('never removes an existing dependency after installation validation fails', async () => {
  const { manager, dir } = await fixture()
  writeFileSync(join(dir, 'node_modules', 'extra', 'package.json'), '{"name":"extra"}')
  const install = vi.spyOn(operations, 'runProfilePnpm').mockResolvedValue({ exitCode: 0, output: '', truncated: false, logPath: '/operation.log' })
  onTestFinished(() => { install.mockRestore() })
  const result = await manager.installBundle('extra')
  expect(result).toMatchObject({ application: 'failed', stage: 'install', error: { code: 'not-bundle' } })
  expect(install).toHaveBeenCalledOnce()
  expect(readProfileManifest('test', dir).dependencies).toEqual({ extra: '1.0.0' })
})

it('keeps a valid installed bundle when its subsequent activation fails', async () => {
  const { manager, dir, bundle } = await fixture()
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    bundle('broken', [{ id: 'broken', name: './plugin.mjs', config: { fail: true } }])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, broken: '1' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: '', truncated: false, logPath: '/operation.log' }
  })
  onTestFinished(() => { install.mockRestore() })
  const result = await manager.installBundle('broken')
  expect(result).toMatchObject({ application: 'failed', stage: 'enable', target: 'broken', bundle: 'broken', packageResult: { exitCode: 0 } })
  expect(install).toHaveBeenCalledOnce()
  expect((await manager.listBundles()).find(row => row.name === 'broken')).toMatchObject({ enabled: true, removable: true })
})

it('returns unchanged failures as warnings while toggling and removing another bundle', async () => {
  const { manager, dir, bundle, ctx } = await fixture()
  bundle('broken', [
    { id: 'broken', name: './plugin.mjs', config: { fail: true } },
    { id: 'missing', name: './missing.mjs' },
    { id: 'pending', name: './pending.mjs' },
  ])
  writeFileSync(join(dir, 'node_modules/broken/pending.mjs'), 'export const inject = ["unavailable"]; export function apply() {}')
  expect(await manager.setBundleEnabled('broken', true)).toMatchObject({ application: 'failed' })
  const brokenId = (await manager.listPlugins()).find(row => row.patchId === 'broken')!.entryId
  expect(await manager.setPluginEnabled(brokenId, true)).toMatchObject({ application: 'failed' })
  expect(await manager.setBundleEnabled('broken', true)).toMatchObject({ application: 'failed' })
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  const changed = await manager.setPluginEnabled(id, false)
  expect(changed).toMatchObject({ application: 'applied' })
  expect(changed.warnings).toHaveLength(3)
  expect(await manager.setPluginEnabled(id, true)).toMatchObject({ application: 'applied' })
  const remove = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    expect([...ctx.loader.entries()].some(row => row.id === 'include:managed')).toBe(false)
    const manifest = readProfileManifest('test', dir)
    delete manifest.dependencies?.extra
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: '', truncated: false, logPath: '/operation.log' }
  })
  onTestFinished(() => { remove.mockRestore() })
  const removed = await manager.removeBundle('extra')
  expect(removed.application).toBe('applied')
  expect(removed.warnings).toHaveLength(3)
  expect(remove).toHaveBeenCalledOnce()
})

it('reports repeated installs as requiring restart and ambiguous package changes as failures', async () => {
  const { manager, dir } = await fixture()
  const install = vi.spyOn(operations, 'runProfilePnpm').mockResolvedValue({ exitCode: 0, output: '', truncated: false, logPath: join(dir, 'pnpm.log') })
  onTestFinished(() => { install.mockRestore() })
  expect(await manager.installBundle('extra')).toMatchObject({ changed: false, application: 'restart-required' })
  expect(await manager.installBundle('extra@1')).toMatchObject({ changed: false, application: 'restart-required' })
  expect(await manager.installBundle('extra-long@1')).toMatchObject({ changed: false, application: 'failed', error: { code: 'ambiguous-install' } })
  install.mockImplementationOnce(async () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    return { exitCode: 0, output: '', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  expect(await manager.installBundle('unknown')).toMatchObject({ changed: false, application: 'failed', error: { code: 'ambiguous-install' } })
  expect(readProfileManifest('test', dir).dependencies).toEqual({ extra: '1.0.0' })
})

it('streams pnpm output, reports the installation phases, and names the installed bundle', async () => {
  const { ctx, manager, dir, bundle } = await fixture()
  const chunks: PluginInstallLogChunk[] = []
  const phases: PluginInstallProgress[] = []
  const changes: PluginChange[] = []
  ctx.on('plugin-manager/install-log', (chunk) => { chunks.push(chunk) })
  ctx.on('plugin-manager/install-state', (progress) => { phases.push(progress) })
  ctx.on('plugin-manager/changed', (change) => { changes.push(change) })
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async (_context, args, options) => {
    options.onOutput?.('Progress: resolved 1\n', 'stdout')
    options.onOutput?.('warning\n', 'stderr')
    const name = String(args[1])
    bundle(name, [{ id: name, name: './plugin.mjs', config: { service: name } }])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, [name]: '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  const requestId = 'f2340b6d-40bb-46b7-8b94-217bdf5010bd' as PluginInstallRequestId
  expect(await manager.installBundle('streamed', { enabled: false, requestId })).toMatchObject({ application: 'applied', changed: true, bundle: 'streamed' })
  expect(install).toHaveBeenCalledWith(expect.objectContaining({ profile: 'test' }), ['add', 'streamed'],
    expect.objectContaining({ command: 'pnpm', execution: 'service' }))
  const jobId = chunks[0]?.jobId
  expect(chunks).toEqual([
    { requestId, jobId, argv: ['pnpm', 'add', 'streamed'], cwd: dir, stream: 'stdout', text: 'Progress: resolved 1\n' },
    { requestId, jobId, argv: ['pnpm', 'add', 'streamed'], cwd: dir, stream: 'stderr', text: 'warning\n' },
    { requestId, jobId, argv: ['pnpm', 'add', 'streamed'], cwd: dir, stream: 'stdout', text: '', exitCode: 0 },
  ])
  expect(phases).toEqual([
    { requestId, phase: 'installing', attempt: { registry: null, index: 1, total: 2 } },
    { requestId, phase: 'applying' },
  ])
  expect(changes).toEqual([{ reason: 'install' }])
  // A run without a request id streams too, unidentified.
  await manager.removeBundle('streamed')
  expect(chunks.at(-1)).toMatchObject({ argv: ['pnpm', 'remove', 'streamed'], stream: 'stdout', exitCode: 0 })
  expect(chunks.at(-1)).not.toHaveProperty('requestId')
  expect(changes).toEqual([{ reason: 'install' }, { reason: 'remove' }])
})

it('stops a run on request, restores the files, and answers not-running or too-late otherwise', async () => {
  const { ctx, manager, dir, bundle } = await fixture()
  const phases: PluginInstallProgress[] = []
  ctx.on('plugin-manager/install-state', (progress) => { phases.push(progress) })
  const started = Promise.withResolvers<undefined>()
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async (_context, _args, options) => {
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, slow: '1' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    started.resolve(undefined)
    await new Promise<undefined>((resolve) => { options.signal?.addEventListener('abort', () => { resolve(undefined) }, { once: true }) })
    return { exitCode: 1, output: 'killed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  const requestId = 'f2340b6d-40bb-46b7-8b94-217bdf5010bd' as PluginInstallRequestId
  const before = readFileSync(join(dir, 'package.json'), 'utf8')
  const run = manager.installBundle('slow', { requestId })
  await started.promise
  expect(await manager.cancelInstall('00000000-0000-4000-8000-000000000000' as PluginInstallRequestId)).toEqual({ status: 'not-running' })
  expect(await manager.cancelInstall(requestId)).toEqual({ status: 'cancelled' })
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  const cancelled = await run
  expect(cancelled).toMatchObject({ application: 'cancelled', changed: false, stage: 'install', packageResult: { exitCode: 1 } })
  expect(cancelled.error).toBeUndefined()
  expect(phases).toEqual([
    { requestId, phase: 'installing', attempt: { registry: null, index: 1, total: 2 } },
    { requestId, phase: 'cancelling' },
  ])
  expect(await manager.cancelInstall(requestId)).toEqual({ status: 'not-running' })
  // Once pnpm has exited and the bundle is being applied, the run cannot be stopped.
  install.mockImplementation(async (_context, args) => {
    const name = String(args[1])
    bundle(name, [{ id: name, name: './plugin.mjs', config: { service: name } }])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, [name]: '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  let tooLate: Promise<unknown> | undefined
  ctx.on('plugin-manager/install-state', (progress) => { if (progress.phase === 'applying') tooLate = manager.cancelInstall(progress.requestId) })
  expect(await manager.installBundle('late', { requestId })).toMatchObject({ application: 'applied', bundle: 'late' })
  expect(await tooLate).toEqual({ status: 'too-late' })
  // A request aborted before its turn under the lock never starts pnpm.
  const early = manager.installBundle('never', { requestId })
  const queued = manager.installBundle('after', { requestId: '11111111-1111-4111-8111-111111111111' as PluginInstallRequestId })
  expect(await manager.cancelInstall('11111111-1111-4111-8111-111111111111' as PluginInstallRequestId)).toEqual({ status: 'cancelled' })
  await early
  expect(await queued).toMatchObject({ application: 'cancelled', changed: false })
})

it('reads what a spec names before installing it', async () => {
  const { manager, dir, profile } = await fixture(undefined, false, undefined, { inspectTimeoutMs: 1000, pnpmCommand: 'pnpm-test', fallbackRegistries: [] })
  const view = vi.spyOn(operations, 'viewProfilePackage')
  onTestFinished(() => { view.mockRestore() })
  const answers = (stdout: string) => view.mockResolvedValueOnce({ exitCode: 0, stdout, stderr: '', timedOut: false })
  answers(JSON.stringify({ name: 'qilin-x', version: '1.4.2', description: 'A sidebar.', qilin: { bundle: { patch: './cordis.patch.yml' } } }))
  expect(await manager.inspect('qilin-x')).toEqual({
    status: 'accepted', kind: 'registry', name: 'qilin-x', version: '1.4.2', description: 'A sidebar.', bundle: true, registry: null,
  })
  expect(view).toHaveBeenCalledWith(dir, 'qilin-x', { command: 'pnpm-test', timeoutMs: 1000, registry: null })
  const signal = AbortSignal.abort()
  answers(JSON.stringify([{ name: 'qilin-lib', version: '1.0.0', qilin: { bundle: {} } }, { name: 'qilin-lib', version: '1.1.0', qilin: null }]))
  expect(await manager.inspect('qilin-lib@^1', undefined, signal)).toEqual({ status: 'refused', problem: 'not-a-bundle', reason: 'qilin-lib declares no qilin.bundle.patch or dsh.bundle.patch', registries: [null] })
  expect(view).toHaveBeenLastCalledWith(dir, 'qilin-lib@^1', { command: 'pnpm-test', timeoutMs: 1000, signal, registry: null })
  // An answer that names no package keeps the name the spec gave; colour escapes around the JSON are dropped.
  answers('\x1b[36m' + JSON.stringify({ version: '0.0.1', description: '', qilin: { bundle: { patch: './p.yml' } } }) + '\x1b[39m\n')
  expect(await manager.inspect('qilin-bare')).toEqual({ status: 'accepted', kind: 'registry', name: 'qilin-bare', version: '0.0.1', bundle: true, registry: null })
  const failure = (stderr: string, exitCode: number | null = 1, more: Partial<operations.PackageViewResult> = {}) =>
    view.mockResolvedValueOnce({ exitCode, stdout: '', stderr, timedOut: false, ...more })
  failure('npm error code E404\nnpm error 404 Not Found - GET https://registry/nope\n')
  expect(await manager.inspect('nope')).toMatchObject({ status: 'refused', problem: 'not-found', reason: expect.stringContaining('E404') as string })
  failure('ERR_PNPM_NO_MATCHING_VERSION  No matching version found for old@9\n')
  expect(await manager.inspect('old@9')).toMatchObject({ status: 'refused', problem: 'not-found' })
  failure('ERR_PNPM_META_FETCH_FAIL  request failed, reason: getaddrinfo ENOTFOUND registry\n')
  expect(await manager.inspect('far')).toMatchObject({ status: 'refused', problem: 'network' })
  view.mockResolvedValueOnce({ exitCode: 3, stdout: 'plain text\n', stderr: '', timedOut: false })
  expect(await manager.inspect('odd')).toEqual({ status: 'refused', problem: 'unknown', reason: 'plain text', registries: [null] })
  failure('', 4)
  expect(await manager.inspect('quiet')).toEqual({ status: 'refused', problem: 'unknown', reason: 'pnpm view exited with 4', registries: [null] })
  failure('', null, { timedOut: true })
  // A registry that never answered within the bound is unreachable.
  expect(await manager.inspect('slow')).toEqual({ status: 'refused', problem: 'network', reason: 'pnpm view timed out after 1000ms', registries: [null] })
  failure('', null, { cause: Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }) })
  expect(await manager.inspect('gone')).toMatchObject({ status: 'refused', problem: 'unknown', reason: expect.stringContaining('ENOENT') as string })
  answers('not json')
  expect(await manager.inspect('garbled')).toMatchObject({ status: 'refused', problem: 'unknown', reason: expect.stringContaining('unreadable pnpm view output') as string })
  answers('"just a string"')
  expect(await manager.inspect('scalar')).toEqual({ status: 'refused', problem: 'unknown', reason: 'pnpm view answered no package', registries: [null] })
  answers('')
  expect(await manager.inspect('silent')).toEqual({ status: 'refused', problem: 'unknown', reason: 'pnpm view answered no package', registries: [null] })
  // What is installed, or supplied by the installation, is refused before the registry is asked.
  expect(await manager.inspect('extra')).toEqual({ status: 'refused', problem: 'already-installed', reason: 'extra is already installed' })
  expect(await manager.inspect('./relative')).toEqual({ status: 'refused', problem: 'invalid-spec', reason: 'a local path must be absolute' })
  expect(await manager.inspect('github:acme/qilin-remote')).toEqual({ status: 'accepted', kind: 'git', bundle: null, registry: null, host: 'github.com' })
  const tarball = join(profile.home, 'pack.tgz')
  expect(await manager.inspect(tarball)).toEqual({ status: 'refused', problem: 'not-a-package', reason: 'the tarball does not exist' })
  writeFileSync(tarball, '')
  expect(await manager.inspect(tarball)).toEqual({ status: 'accepted', kind: 'tarball', bundle: null, registry: null })
  expect(await manager.inspect('https://cdn.example.com/x/y/z/qilin-x-1.0.0.tgz')).toEqual({
    status: 'accepted', kind: 'tarball', bundle: null, registry: null, host: 'cdn.example.com',
  })
  // A directory answers from its own manifest.
  const local = join(profile.home, 'dev', 'qilin-local')
  mkdirSync(local, { recursive: true })
  expect(await manager.inspect(join(profile.home, 'dev', 'missing'))).toEqual({ status: 'refused', problem: 'not-a-package', reason: 'the path does not exist' })
  expect(await manager.inspect(local)).toMatchObject({ status: 'refused', problem: 'not-a-package', reason: expect.stringContaining('no readable package.json') as string })
  writeFileSync(join(local, 'package.json'), '{"version":"1.0.0"}')
  expect(await manager.inspect(local)).toEqual({ status: 'refused', problem: 'not-a-package', reason: 'the package.json names no package' })
  writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'qilin-local', version: '0.1.0', description: 'Local.' }))
  expect(await manager.inspect(local)).toEqual({ status: 'refused', problem: 'not-a-bundle', reason: 'qilin-local declares no qilin.bundle.patch or dsh.bundle.patch' })
  writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'qilin-local', version: '0.1.0', description: 'Local.', qilin: { bundle: { patch: './p.yml' } } }))
  expect(await manager.inspect(`file:${local}`)).toEqual({
    status: 'accepted', kind: 'path', name: 'qilin-local', version: '0.1.0', description: 'Local.', bundle: true, registry: null,
  })
  writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'core', qilin: { bundle: { patch: './p.yml' } } }))
  expect(await manager.inspect(local)).toEqual({ status: 'refused', problem: 'already-installed', reason: 'core is already installed' })
  // A profile and an installation that list nothing know nothing.
  writeFileSync(join(dir, 'package.json'), '{}')
  writeFileSync(profile.installAnchor, '{}')
  expect(await manager.inspect(local)).toEqual({ status: 'accepted', kind: 'path', name: 'core', bundle: true, registry: null })
  expect(view).toHaveBeenCalledTimes(13)
})

it('accepts a DSH-era bundle declaration the load path accepts', async () => {
  const { manager, profile } = await fixture(undefined, false, undefined, { inspectTimeoutMs: 1000, pnpmCommand: 'pnpm-test', fallbackRegistries: [] })
  const view = vi.spyOn(operations, 'viewProfilePackage')
  onTestFinished(() => { view.mockRestore() })
  const answers = (stdout: string) => view.mockResolvedValueOnce({ exitCode: 0, stdout, stderr: '', timedOut: false })
  answers(JSON.stringify({ name: 'dsh-context', version: '0.64.0', description: 'Context.', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  expect(await manager.inspect('dsh-context')).toEqual({
    status: 'accepted', kind: 'registry', name: 'dsh-context', version: '0.64.0', description: 'Context.', bundle: true, registry: null,
  })
  // A present-but-non-string declaration is no declaration.
  answers(JSON.stringify({ name: 'dsh-broken', version: '1.0.0', dsh: { bundle: { patch: 7 } } }))
  expect(await manager.inspect('dsh-broken')).toEqual({
    status: 'refused', problem: 'not-a-bundle', reason: 'dsh-broken declares no qilin.bundle.patch or dsh.bundle.patch', registries: [null],
  })
  // A directory answers from its own manifest the same way.
  const local = join(profile.home, 'dev', 'dsh-local')
  mkdirSync(local, { recursive: true })
  writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'dsh-local', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  expect(await manager.inspect(local)).toEqual({
    status: 'accepted', kind: 'path', name: 'dsh-local', version: '0.1.0', bundle: true, registry: null,
  })
})

it('announces each manager operation as a change, and a patch generation applied outside it not at all', async () => {
  const { ctx, manager, profile } = await fixture('startup')
  const changes: PluginChange[] = []
  ctx.on('plugin-manager/changed', (change) => { changes.push(change) })
  await reconcileProfilePatches(ctx, readProfilePatches('test', profile), 'test')
  expect(changes).toEqual([])
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  await manager.setPluginEnabled(id, false)
  expect(changes).toEqual([{ reason: 'plugin' }])
  await manager.setBundleEnabled('extra', false)
  expect(changes).toEqual([{ reason: 'plugin' }, { reason: 'bundle' }])
})

it('handles missing patch files and retains non-Error package diagnostics', async () => {
  const { manager, dir } = await fixture()
  rmSync(join(dir, 'cordis.patch.yml'))
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ changed: true, application: 'applied' })
  const install = vi.spyOn(operations, 'runProfilePnpm').mockRejectedValueOnce('pnpm rejected operation')
  onTestFinished(() => { install.mockRestore() })
  expect(await manager.installBundle('new')).toMatchObject({ changed: false, application: 'failed', error: { code: 'operation-error', diagnostic: 'pnpm rejected operation' } })
  rmSync(join(dir, 'cordis.patch.yml'))
  mkdirSync(join(dir, 'cordis.patch.yml'))
  await expect(manager.setPluginEnabled(id, true)).rejects.toThrow()
})

it('applies a manager change through the active HMR service', async () => {
  const { manager } = await fixture()
  const id = (await manager.listPlugins()).find(row => row.patchId === 'managed')!.entryId
  expect(await manager.setPluginEnabled(id, false)).toMatchObject({ changed: true, application: 'applied' })
  expect((await manager.listPlugins()).find(row => row.entryId === id)?.enabled).toBe(false)
})

it('refuses removal of a hot-installed bundle after HMR is disabled', async () => {
  const { ctx, manager, dir, bundle, stopHmr } = await fixture()
  bundle('later', [{ id: 'later', name: './plugin.mjs', config: { service: 'laterProbe' } }])
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = { ...manifest.dependencies, later: '1' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  expect(await manager.setBundleEnabled('later', true)).toMatchObject({ application: 'applied' })
  await stopHmr()
  expect(ctx.get('hmr')).toBeUndefined()
  expect(await manager.setBundleEnabled('later', false)).toMatchObject({ application: 'restart-required' })
  expect(ctx.get('laterProbe')).toBe(true)
  expect(await manager.removeBundle('later')).toMatchObject({ changed: false, application: 'failed' })
})

it('offers the launcher\'s optional bundles switched off and never removable', async () => {
  const { manager, profile } = await fixture()
  // The launcher names the bundles the installation ships; the fixture supplies one of them from the
  // installation's own node_modules, which the resolver consults before the profile's and before the repository's.
  const offered = OPTIONAL_BUNDLES[0]!
  const supplied = join(profile.home, 'node_modules', offered)
  mkdirSync(supplied, { recursive: true })
  writeFileSync(join(supplied, 'package.json'), JSON.stringify({
    name: offered, version: '3.0.0', description: 'Package one-liner.', qilin: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(supplied, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'offered-row', name: './plugin.mjs', config: { service: 'offeredProbe' } }] }]))
  writeFileSync(join(supplied, 'plugin.mjs'), 'export function apply(ctx, config) { ctx.provide(config?.service ?? "offeredProbe", true) }\n')
  writeFileSync(profile.installAnchor, JSON.stringify({ name: 'installation', dependencies: { [offered]: '3.0.0' } }))
  expect((await manager.listBundles()).find(row => row.name === offered)).toEqual({
    name: offered, version: '3.0.0', meta: { title: offered, description: 'Package one-liner.' },
    description: 'Package one-liner.',
    enabled: false, installed: false, optional: true, updatable: true, removable: false,
    rows: [{ rowId: 'offered-row', moduleName: pathToFileURL(join(supplied, 'plugin.mjs')).href }], overrides: [],
  })
  expect(await manager.setBundleEnabled(offered, true)).toMatchObject({ application: 'applied' })
  expect((await manager.listBundles()).find(row => row.name === offered)).toMatchObject({ enabled: true, optional: true, removable: false })
  expect(await manager.removeBundle(offered)).toMatchObject({ changed: false, application: 'failed' })
})

it('omits installation-owned plain packages from the bundle inventory', async () => {
  const { manager, dir, profile, bundle } = await fixture()
  bundle('installation-plain', [])
  writeFileSync(join(dir, 'node_modules/installation-plain/package.json'), '{"name":"installation-plain"}')
  writeFileSync(profile.installAnchor, '{"dependencies":{"installation-plain":"1"}}')
  expect((await manager.listBundles()).some(row => row.name === 'installation-plain')).toBe(false)
})

it('does not delete a bundle retained by a higher-priority overlay', async () => {
  const { ctx, manager, overlays, dir } = await fixture()
  const entry = [...ctx.loader.entries()].find(row => row.id === 'include:managed')!
  overlays.push({ insert: [{ ...entry.options }] })
  const remove = vi.spyOn(operations, 'runProfilePnpm')
  onTestFinished(() => { remove.mockRestore() })
  expect(await manager.removeBundle('extra')).toMatchObject({ changed: true, application: 'failed', error: { code: 'bundle-in-use' } })
  expect(await manager.removeBundle('extra')).toMatchObject({ changed: false, application: 'failed', error: { code: 'bundle-in-use' } })
  expect(remove).not.toHaveBeenCalled()
  expect(readProfileManifest('test', dir).dependencies).toEqual({ extra: '1.0.0' })
  expect(ctx.get('managedProbe')).toBe(true)
})

it('applies watched configuration while pnpm installation is still running', async () => {
  const { ctx, manager, dir, profile, bundle } = await fixture()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const pnpm = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    entered.resolve(undefined)
    await release.promise
    bundle('new-bundle', [])
    const manifest = readProfileManifest('test', dir)
    manifest.dependencies = { ...manifest.dependencies, 'new-bundle': '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  const installing = manager.installBundle('new-bundle')
  onTestFinished(async () => { release.resolve(undefined); await installing; pnpm.mockRestore() })
  await entered.promise
  writeFileSync(profile.patchPath, '- id: managed\n  disabled: true\n')
  await vi.waitFor(() => { expect(ctx.get('managedProbe')).toBeUndefined() }, { timeout: 10000 })
  expect(pnpm).toHaveBeenCalledOnce()
  release.resolve(undefined)
  expect(await installing).toMatchObject({ application: 'applied', changed: true })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['core', 'extra', 'new-bundle'])
  expect(ctx.get('managedProbe')).toBeUndefined()
})

it('compares every manageable layer with its registry latest tag and tolerates a registry it cannot read', async () => {
  const { manager, dir, bundle } = await fixture()
  bundle('retired', [])
  bundle('offline', [])
  bundle('plain', [])
  // A layer whose manifest declares no version reports none.
  writeFileSync(join(dir, 'node_modules', 'retired', 'package.json'),
    JSON.stringify({ name: 'retired', qilin: { bundle: { patch: './cordis.patch.yml' } } }))
  // A selected dependency without a bundle patch is not a layer an update could move.
  writeFileSync(join(dir, 'node_modules', 'plain', 'package.json'), JSON.stringify({ name: 'plain', version: '1.0.0' }))
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = { ...manifest.dependencies, retired: '1.0.0', offline: '1.0.0', plain: '1.0.0' }
  manifest.qilin = { ...manifest.qilin, profile: { ...manifest.qilin?.profile, bundles: ['core', 'extra', 'plain'] } }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  const answer = (url: string): Promise<Response> => {
    if (url.includes('/core/dist-tags')) return Promise.resolve(new Response(JSON.stringify({ latest: '2.0.0' })))
    if (url.includes('/extra/dist-tags')) return Promise.resolve(new Response(JSON.stringify({ next: '3.0.0' })))
    if (url.includes('/retired/dist-tags')) return Promise.resolve(new Response('gone', { status: 404 }))
    return Promise.reject(new Error('registry unreachable'))
  }
  const fetch = vi.fn((input: string | URL, init?: RequestInit) => {
    // Every registry lookup carries its own timeout.
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    return answer(String(input))
  })
  vi.stubGlobal('fetch', fetch)
  onTestFinished(() => { vi.unstubAllGlobals() })
  expect(await manager.checkUpdates()).toEqual({
    entries: [
      { name: 'core', currentVersion: '1.0.0', latestVersion: '2.0.0' },
      { name: 'extra', currentVersion: '1.0.0', latestVersion: null },
      { name: 'retired', currentVersion: null, latestVersion: null },
      { name: 'offline', currentVersion: '1.0.0', latestVersion: null },
    ],
  })
  expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([
    'https://registry.npmjs.org/-/package/core/dist-tags',
    'https://registry.npmjs.org/-/package/extra/dist-tags',
    'https://registry.npmjs.org/-/package/retired/dist-tags',
    'https://registry.npmjs.org/-/package/offline/dist-tags',
  ])
})

it('searches the plugin topic on GitHub and reads only the fields the catalog shows', async () => {
  const { manager } = await fixture()
  const page = (items: unknown[]): Response => new Response(JSON.stringify({ total_count: items.length, items }))
  const answers = [
    page([
      {
        full_name: 'acme/qilin-remote', description: 'A remote.', stargazers_count: 12,
        updated_at: '2025-01-02T03:04:05Z', html_url: 'https://github.com/acme/qilin-remote', forks_count: 3,
      },
      { full_name: 'acme/qilin-bare', stargazers_count: 'many', html_url: 'https://github.com/acme/qilin-bare' },
      { full_name: 'acme/qilin-headless' },
      'not a repository',
      null,
    ]),
    new Response(JSON.stringify({ message: 'Bad credentials' })),
    page([]),
    new Response('rate limited', { status: 403 }),
    page(Array.from({ length: 50 }, (_, index) => ({ full_name: `acme/qilin-${String(index)}`, html_url: `https://github.com/acme/qilin-${String(index)}` }))),
  ]
  const inits: (RequestInit | undefined)[] = []
  const fetch = vi.fn((_input: string | URL, init?: RequestInit): Promise<Response> => {
    inits.push(init)
    return Promise.resolve(answers.shift() as Response)
  })
  vi.stubGlobal('fetch', fetch)
  onTestFinished(() => { vi.unstubAllGlobals() })

  expect(await manager.catalog('  qilin sidebar  ', 2)).toEqual({
    page: 2,
    hasMore: false,
    entries: [
      {
        fullName: 'acme/qilin-remote', description: 'A remote.', stars: 12,
        updatedAt: '2025-01-02T03:04:05Z', url: 'https://github.com/acme/qilin-remote',
      },
      { fullName: 'acme/qilin-bare', description: null, stars: 0, updatedAt: '', url: 'https://github.com/acme/qilin-bare' },
    ],
  })
  const request = new URL(String(fetch.mock.calls[0]?.[0]))
  expect(request.origin + request.pathname).toBe('https://api.github.com/search/repositories')
  expect(Object.fromEntries(request.searchParams)).toEqual({
    q: 'topic:dsh-plugin qilin sidebar', sort: 'stars', order: 'desc', per_page: '50', page: '2',
  })
  expect(inits[0]?.headers).toEqual({ accept: 'application/vnd.github+json' })
  expect(inits[0]?.signal).toBeInstanceOf(AbortSignal)

  // An answer without an items array has nothing to show.
  expect(await manager.catalog('', Number.NaN)).toEqual({ entries: [], page: 1, hasMore: false })
  expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('q')).toBe('topic:dsh-plugin')
  // An empty query searches the topic alone; a page that is not a positive safe integer reads as the first.
  expect(await manager.catalog('', 0)).toEqual({ entries: [], page: 1, hasMore: false })
  expect(new URL(String(fetch.mock.calls[2]?.[0])).searchParams.get('page')).toBe('1')

  await expect(manager.catalog('x', 3)).rejects.toThrow('qilin: GitHub search failed with HTTP 403')

  // A full page may have another one behind it.
  expect(await manager.catalog('', 1)).toMatchObject({ page: 1, hasMore: true })
})

it.each(['live', 'startup'] as const)('requires exact risk acknowledgement and re-admits a denied row in a %s profile', async (mode) => {
  const { manager, dir, ctx } = await fixture(mode, false, undefined, {}, undefined, (dir) => {
    const guarded = join(dir, 'node_modules', 'guarded')
    mkdirSync(guarded, { recursive: true })
    writeFileSync(join(guarded, 'package.json'), JSON.stringify({
      name: 'guarded', version: '1.0.0', type: 'module', peerDependencies: { '@qilin/session': '999.0.0' },
    }))
    writeFileSync(join(guarded, 'index.mjs'), 'export function apply(ctx) { ctx.provide("guardedProbe", true) }\n')
    writeFileSync(join(dir, 'node_modules', 'extra', 'cordis.patch.yml'), JSON.stringify([
      { insert: [{ id: 'managed', name: './plugin.mjs' },
        { id: 'guarded', name: pathToFileURL(join(dir, 'node_modules', 'guarded', 'index.mjs')).href }] },
    ]))
  })
  const runtime = getQilinRuntimeVersion()
  const active = () => ctx.get('guardedProbe') === true
  // The row's own plugin peers are incompatible, so it mounts disabled before any plugin code is imported.
  expect(active()).toBe(false)
  expect(await manager.setVersionExemption('guarded@1.0.0', runtime, true)).toMatchObject({ changed: false, application: 'failed' })
  expect(manager.listVersionExemptions()).toEqual({ exemptions: {}, warnings: [] })
  expect(existsSync(join(dir, 'compatibility.json'))).toBe(false)
  expect(await manager.setVersionExemption('guarded@1.0.0', runtime, true, true)).toMatchObject({
    changed: true, application: mode === 'live' ? 'applied' : 'restart-required',
  })
  expect(manager.listVersionExemptions()).toEqual({ exemptions: { 'guarded@1.0.0': [runtime] }, warnings: [] })
  // The grant is persisted only in the profile's compatibility file, never in its package manifest.
  expect(JSON.parse(readFileSync(join(dir, 'compatibility.json'), 'utf8'))).toEqual({ 'guarded@1.0.0': [runtime] })
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['core', 'extra'])
  // `setVersionExemption` reconciles the profile itself, so a live tree re-admits the row here;
  // no manifest watch or Loader instrumentation participates. A startup-only profile keeps it out until restart.
  if (mode === 'live') expect(active()).toBe(true)
  else expect(active()).toBe(false)
  expect(await manager.setVersionExemption('guarded@1.0.0', runtime, false)).toMatchObject({ changed: true })
  expect(manager.listVersionExemptions()).toEqual({ exemptions: {}, warnings: [] })
  expect(JSON.parse(readFileSync(join(dir, 'compatibility.json'), 'utf8'))).toEqual({})
  if (mode === 'live') expect(active()).toBe(false)
})

it('reports a package run refused for compatibility as a typed refusal', async () => {
  const { manager } = await fixture()
  const incompatible = [{ name: 'qilin-x', version: '2.0.0', runtimeVersion: getQilinRuntimeVersion(), peers: { '@qilin/session': '999.0.0' } }]
  const install = vi.spyOn(operations, 'runProfilePnpm').mockResolvedValue({
    exitCode: 1, output: 'qilin: installation rejected', truncated: false, logPath: 'pnpm.log', incompatible,
  })
  onTestFinished(() => { install.mockRestore() })
  const result = await manager.installBundle('qilin-x')
  expect(result).toMatchObject({ application: 'failed', changed: false, error: { code: 'incompatible-version', incompatible } })
  expect(install).toHaveBeenCalledTimes(1)
})

it.each([false, true])('rechecks installed bundle peers before accepting a disabled installation (exempted=%s)', async (exempted) => {
  const { manager, dir, bundle } = await fixture()
  if (exempted) await manager.setVersionExemption('incompatible@1.0.0', getQilinRuntimeVersion(), true, true)
  const before = readFileSync(join(dir, 'package.json'), 'utf8')
  const install = vi.spyOn(operations, 'runProfilePnpm').mockImplementation(async () => {
    bundle('incompatible', [])
    const file = join(dir, 'node_modules', 'incompatible', 'package.json')
    const metadata = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    writeFileSync(file, JSON.stringify({ ...metadata, peerDependencies: { '@qilin/session': '<0.0.0' } }))
    const profile = readProfileManifest('test', dir)
    profile.dependencies = { ...profile.dependencies, incompatible: '1.0.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(profile))
    return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
  })
  onTestFinished(() => { install.mockRestore() })
  const result = await manager.installBundle('incompatible', { enabled: false })
  expect(result).toMatchObject({ application: exempted ? 'applied' : 'failed', changed: exempted })
  if (!exempted) {
    expect(result.error).toMatchObject({ code: 'incompatible-version', incompatible: [{ name: 'incompatible', version: '1.0.0' }] })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  }
  expect(readProfileManifest('test', dir).qilin?.profile?.bundles).toEqual(['core', 'extra'])
})
/** What pnpm's own configuration names in the profile, for the tests that need something other than npm's own registry. */
function pnpmNames(url: string | null = OFFICIAL) {
  return vi.spyOn(operations, 'readProfileRegistry').mockResolvedValue(url)
}

it('asks the registries in turn while one is unreachable or stale, and names the one that answered', async () => {
  const { manager, dir } = await fixture(undefined, false, undefined, { inspectTimeoutMs: 1000, fallbackRegistries: ['https://REGISTRY.npmmirror.com'] })
  const read = pnpmNames()
  const view = vi.spyOn(operations, 'viewProfilePackage')
  onTestFinished(() => { view.mockRestore() })
  const failure = (stderr: string, exitCode = 1) => view.mockResolvedValueOnce({ exitCode, stdout: '', stderr, timedOut: false })
  const answers = (stdout: string) => view.mockResolvedValueOnce({ exitCode: 0, stdout, stderr: '', timedOut: false })
  const asked = (from: number) => view.mock.calls.slice(from).map(call => call[2].registry)
  const manifest = JSON.stringify({ name: 'qilin-x', version: '1.0.0', qilin: { bundle: { patch: './cordis.patch.yml' } } })
  // pnpm's own registry is unreachable; the mirror answers and the install is told to start there.
  failure('ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/qilin-x: ETIMEDOUT\n')
  answers(manifest)
  expect(await manager.inspect('qilin-x')).toEqual({ status: 'accepted', kind: 'registry', name: 'qilin-x', version: '1.0.0', bundle: true, registry: MIRROR })
  expect(asked(0)).toEqual([null, MIRROR])
  expect(read).toHaveBeenCalledWith(dir, { command: 'pnpm', timeoutMs: 1000 })
  expect(view).toHaveBeenLastCalledWith(expect.any(String), 'qilin-x', { command: 'pnpm', timeoutMs: 1000, registry: MIRROR })
  // pnpm prints a refusal as JSON on stdout with nothing on stderr: it is read the same way, and the reason is its message.
  view.mockResolvedValueOnce({ exitCode: 1, stdout: '{\n  "error": {\n    "code": "ERR_PNPM_META_FETCH_FAIL",\n    "message": "GET https://registry.npmjs.org/qilin-x: fetch failed"\n  }\n}\n', stderr: '', timedOut: false })
  answers(manifest)
  expect(await manager.inspect('qilin-x')).toMatchObject({ status: 'accepted', registry: MIRROR })
  expect(asked(2)).toEqual([null, MIRROR])
  // A requested registry goes first. A mirror's 404 may be a copy not yet synced, so the lookup goes on; every registry's 404 is not-found.
  view.mockResolvedValueOnce({ exitCode: 1, stdout: '{"error":{"code":"ERR_PNPM_FETCH_404","message":"GET https://registry.npmmirror.com/qilin-x: Not Found - 404"}}', stderr: '', timedOut: false })
  failure('ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/qilin-x: Not Found - 404\n')
  expect(await manager.inspect('qilin-x', { registry: MIRROR })).toMatchObject({
    status: 'refused', problem: 'not-found', reason: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/qilin-x: Not Found - 404', registries: [MIRROR, null],
  })
  expect(asked(4)).toEqual([MIRROR, null])
  // A registry outside the configured set is asked alone.
  failure('ERR_PNPM_META_FETCH_FAIL  GET https://npm.corp.example/qilin-x: ECONNREFUSED\n')
  expect(await manager.inspect('qilin-x', { registry: 'https://npm.corp.example' })).toMatchObject({ status: 'refused', problem: 'network', registries: ['https://npm.corp.example/'] })
  expect(asked(6)).toEqual(['https://npm.corp.example/'])
  // A failure no registry changes ends the round at once.
  failure('', 4)
  expect(await manager.inspect('qilin-x')).toMatchObject({ status: 'refused', problem: 'unknown', registries: [null] })
  expect(asked(7)).toEqual([null])
  // A registry that never answered is unreachable, like one that refused the connection: the round goes on, and the
  // refusal is a network one.
  view.mockResolvedValueOnce({ exitCode: null, stdout: '', stderr: '', timedOut: true })
  view.mockResolvedValueOnce({ exitCode: null, stdout: '', stderr: '', timedOut: true })
  expect(await manager.inspect('qilin-x')).toEqual({ status: 'refused', problem: 'network', reason: 'pnpm view timed out after 1000ms', registries: [null, MIRROR] })
  expect(asked(8)).toEqual([null, MIRROR])
  // A lookup the caller dropped is not carried to the next registry.
  const controller = new AbortController()
  view.mockImplementationOnce(async () => { controller.abort(); return { exitCode: 1, stdout: '', stderr: 'ECONNRESET\n', timedOut: false } })
  expect(await manager.inspect('qilin-x', {}, controller.signal)).toMatchObject({ status: 'refused', problem: 'network', registries: [null] })
  expect(asked(10)).toEqual([null])
  // The other forms ask no registry and carry the one the install starts with.
  expect(await manager.inspect('github:acme/qilin-remote', { registry: MIRROR })).toEqual({ status: 'accepted', kind: 'git', bundle: null, registry: MIRROR, host: 'github.com' })
  expect(await manager.inspect('github:acme/qilin-remote')).toEqual({ status: 'accepted', kind: 'git', bundle: null, registry: null, host: 'github.com' })
  expect(view).toHaveBeenCalledTimes(11)
})

it('keeps pnpm\'s own registry alone when it names a private one, or cannot be read', async () => {
  const { manager } = await fixture(undefined, false, undefined, { inspectTimeoutMs: 1000 })
  const read = pnpmNames('https://npm.corp.example/')
  const view = vi.spyOn(operations, 'viewProfilePackage')
  onTestFinished(() => { view.mockRestore() })
  view.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'ERR_PNPM_META_FETCH_FAIL  GET https://npm.corp.example/qilin-x: ETIMEDOUT\n', timedOut: false })
  expect(await manager.inspect('qilin-x')).toMatchObject({ status: 'refused', problem: 'network', registries: [null] })
  expect(await manager.inspect('qilin-x', { registry: MIRROR })).toMatchObject({ status: 'refused', problem: 'network', registries: [MIRROR] })
  read.mockResolvedValue(null)
  expect(await manager.inspect('qilin-x')).toMatchObject({ status: 'refused', problem: 'network', registries: [null] })
  expect(await manager.registries()).toEqual({ registry: null, fallbackRegistries: [MIRROR], resolved: null })
  expect(view).toHaveBeenCalledTimes(3)
})

it('installs from the next registry after one is unreachable, restoring the files between attempts', async () => {
  const { ctx, manager, dir, bundle } = await fixture()
  const phases: PluginInstallProgress[] = []
  const chunks: PluginInstallLogChunk[] = []
  ctx.on('plugin-manager/install-state', (progress) => { phases.push(progress) })
  ctx.on('plugin-manager/install-log', (chunk) => { chunks.push(chunk) })
  const lockPath = join(dir, 'pnpm-lock.yaml')
  const install = vi.spyOn(operations, 'runProfilePnpm')
    .mockImplementationOnce(async () => {
      writeFileSync(lockPath, 'partial lockfile\n')
      return { exitCode: 1, output: 'ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/fallen: ETIMEDOUT', truncated: false, logPath: join(dir, 'pnpm.log') }
    })
    .mockImplementationOnce(async (_context, args) => {
      // The failed attempt's lockfile is gone before the next registry is asked.
      expect(existsSync(lockPath)).toBe(false)
      const name = String(args[1])
      bundle(name, [{ id: name, name: './plugin.mjs', config: { service: name } }])
      const manifest = readProfileManifest('test', dir)
      manifest.dependencies = { ...manifest.dependencies, [name]: '1.0.0' }
      writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
      return { exitCode: 0, output: 'installed', truncated: false, logPath: join(dir, 'pnpm.log') }
    })
  onTestFinished(() => { install.mockRestore() })
  const requestId = 'f2340b6d-40bb-46b7-8b94-217bdf5010bd' as PluginInstallRequestId
  const result = await manager.installBundle('fallen', { enabled: false, requestId })
  expect(result).toMatchObject({ application: 'applied', bundle: 'fallen', registries: [null, MIRROR], packageResult: { exitCode: 0 } })
  expect(result.failedAt).toBeUndefined()
  expect(install.mock.calls.map(call => call[1])).toEqual([['add', 'fallen'], ['add', 'fallen', `--registry=${MIRROR}`]])
  expect(phases).toEqual([
    { requestId, phase: 'installing', attempt: { registry: null, index: 1, total: 2 } },
    { requestId, phase: 'installing', attempt: { registry: MIRROR, index: 2, total: 2 } },
    { requestId, phase: 'applying' },
  ])
  // Each attempt streams as its own run, the command line naming the registry it asked.
  expect(new Set(chunks.map(chunk => chunk.jobId)).size).toBe(2)
  expect(chunks.at(-1)).toMatchObject({ requestId, argv: ['pnpm', 'add', 'fallen', `--registry=${MIRROR}`], exitCode: 0 })
})
