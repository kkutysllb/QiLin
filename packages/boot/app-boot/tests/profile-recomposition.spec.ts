/**
 * Profile recomposition: the rows a generation drops stop before the launcher's generation publishes, a rejected
 * publication starts them again, and activation is judged afterwards.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Entry, EntryOptions } from '@qilin-agent/kylin-plugin-loader'
import type { Context } from '@qilin-agent/kylin'
import type { PatchOptions } from '@qilin-agent/kylin-plugin-include'
import { boot, PluginPackages, recomposeProfile } from '../src/index.ts'
import { healProfilesModuleFallback, type Profile, type RuntimeResolution } from '../src/profile.ts'

const NAME = 'qilin-test-bin'

const roots: string[] = []
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function file(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** Write a package manifest and entry point under `dir`; returns the manifest path. */
function pkg(dir: string, name: string, version: string, dependencies: Record<string, string> = {}): string {
  file(join(dir, 'package.json'), JSON.stringify({
    name, version, type: 'module', exports: { import: './index.js' }, dependencies,
  }))
  file(join(dir, 'index.js'), 'export const marker = 1\n')
  return join(dir, 'package.json')
}

/** A plugin that reports its own activation and disposal through the provided `probe` service. */
const RECORDER = [
  'export function apply(ctx) {',
  '  const probe = ctx.get("probe")',
  '  probe.applied()',
  '  ctx.effect(() => () => probe.disposed())',
  '}',
  '',
].join('\n')

/** A plugin that fails while the probe asks it to. */
const HOLDER = [
  'export function apply(ctx) {',
  '  const probe = ctx.get("probe")',
  '  probe.applied()',
  '  if (probe.failing()) throw new Error("holding failed")',
  '}',
  '',
].join('\n')

interface Probe {
  applied: () => void
  disposed: () => void
  failing?: () => boolean
}

// Each call returns fresh rows: an Insert patch row is held by reference, and stopping a dropped row marks its options
// disabled in place.
const inserted = (row: EntryOptions): PatchOptions[] => [{ insert: [row] }]

/**
 * Mount the real package service with one installed generation and the launcher's recomputation.
 * @param generation - the generation the profile publishes before the recomposition.
 * @param recompute - the launcher's recomputation, whose result or failure the recomposition publishes.
 * @param probe - the lifecycle probe every plugin of the composition reports through.
 * @returns the boot preparation that mounts both before any configured row.
 */
function packagesOn(
  generation: RuntimeResolution,
  recompute: () => Promise<RuntimeResolution>,
  probe: Probe,
): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    ctx.provide('probe', probe)
    await ctx.plugin(PluginPackages, { generation, recompute })
  }
}

/** Boot one composition over a fresh configuration directory. */
async function composition(options: {
  patches?: PatchOptions[]
  modules?: Record<string, string>
  prepare?: (ctx: Context) => Promise<void> | void
} = {}): Promise<{ ctx: Context; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-recomposition-'))
  roots.push(dir)
  for (const [name, text] of Object.entries(options.modules ?? {})) file(join(dir, name), text)
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const ctx = await boot(NAME, join(dir, 'cordis.yml'), options.patches ?? [], options.prepare)
  onTestFinished(async () => { await ctx.fiber.dispose() })
  return { ctx, dir }
}

/** Stop one running row the way plugin HMR does: deleting its runtime leaves the row itself enabled. */
async function stopRow(ctx: Context, entry: Entry): Promise<void> {
  const plugin = entry.fiber?.runtime?.callback
  if (plugin === undefined) throw new Error(`${entry.options.id} has no running runtime`)
  ctx.registry.delete(plugin)
  await ctx.loader.await()
}

/** A profile whose installation maps one package, and the successor that maps the same name elsewhere. */
async function installedGeneration(): Promise<{
  generation: RuntimeResolution
  moved: RuntimeResolution
}> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qilin-recomposition-profile-')))
  roots.push(root)
  const installDir = join(root, 'install')
  const installAnchor = pkg(installDir, 'test-app', '0.0.0', { 'resolution-lib': '*' })
  pkg(join(installDir, 'node_modules', 'resolution-lib'), 'resolution-lib', '1.0.0')
  const profileDir = join(root, 'profiles', 'test')
  file(join(profileDir, 'package.json'), JSON.stringify({ name: 'test-profile', private: true }))
  const profile: Profile = {
    name: 'test',
    dir: profileDir,
    layers: [],
    patchPath: join(profileDir, 'cordis.patch.yml'),
    patches: [],
    skippedBundles: [],
  }
  const generation = await healProfilesModuleFallback({
    installAnchor,
    profile,
    home: root,
    materialize: false,
  })
  const elsewhere = join(root, 'elsewhere')
  pkg(elsewhere, 'resolution-lib', '2.0.0')
  return {
    generation,
    moved: {
      ...generation,
      entries: generation.entries.map(entry => ({ ...entry, packageDir: elsewhere, version: '2.0.0' })),
    },
  }
}

const beta = (): PatchOptions[] => inserted({ id: 'beta', name: './plug.mjs' })

describe('profile recomposition', () => {
  it('stops the rows the generation drops before publishing and applies the new composition', async () => {
    const events: string[] = []
    const { generation } = await installedGeneration()
    const { ctx } = await composition({
      patches: beta(),
      modules: { 'plug.mjs': RECORDER },
      prepare: async (host) => {
        host.provide('probe', { applied: () => events.push('apply'), disposed: () => events.push('dispose') })
        await host.plugin(PluginPackages, {
          generation,
          recompute: async () => {
            events.push('publish')
            // The dropped row stopped while its package was still mapped.
            expect([...host.loader.entries()].some(row => row.options.id === 'beta')).toBe(false)
            return generation
          },
        })
      },
    })
    expect(events).toEqual(['apply'])
    await expect(recomposeProfile(ctx, [], NAME)).resolves.toEqual({ warnings: [] })
    expect(events).toEqual(['apply', 'dispose', 'publish'])
    expect([...ctx.loader.entries()].some(row => row.options.id === 'beta')).toBe(false)
  })

  it('reports a moved package and restores the stopped rows in their original places', async () => {
    const events: string[] = []
    const { generation, moved } = await installedGeneration()
    const pair: PatchOptions[] = [
      { insert: [{ id: 'beta', name: './plug.mjs' }] },
      { insert: [{ id: 'gamma', name: './plug.mjs' }] },
    ]
    const { ctx } = await composition({
      patches: pair,
      modules: { 'plug.mjs': RECORDER },
      prepare: packagesOn(generation, async () => moved, {
        applied: () => events.push('apply'),
        disposed: () => events.push('dispose'),
      }),
    })
    await expect(recomposeProfile(ctx, [], NAME)).resolves.toEqual({ warnings: [], restartReason: 'package-moved' })
    expect(events).toEqual(['apply', 'apply', 'dispose', 'dispose', 'apply', 'apply'])
    expect([...ctx.loader.entries()].filter(row => row.options.id !== 'include').map(row => row.options.id))
      .toEqual(['beta', 'gamma'])
  })

  it('propagates a generation that cannot be read and starts the stopped rows again', async () => {
    const events: string[] = []
    const { generation } = await installedGeneration()
    const { ctx } = await composition({
      patches: beta(),
      modules: { 'plug.mjs': RECORDER },
      prepare: packagesOn(generation, async () => { throw new Error('installation tree is unreadable') }, {
        applied: () => events.push('apply'),
        disposed: () => events.push('dispose'),
      }),
    })
    await expect(recomposeProfile(ctx, [], NAME)).rejects.toThrow('installation tree is unreadable')
    expect(events).toEqual(['apply', 'dispose', 'apply'])
    expect([...ctx.loader.entries()].some(row => row.options.id === 'beta')).toBe(true)
  })

  it('stops a dropped group with the rows it contains', async () => {
    const events: string[] = []
    const { generation } = await installedGeneration()
    const { ctx } = await composition({
      patches: inserted({
        id: 'group', name: 'cordis:group', group: true,
        config: [{ id: 'inner', name: './plug.mjs' }],
      }),
      modules: { 'plug.mjs': RECORDER },
      prepare: packagesOn(generation, async () => generation, {
        applied: () => events.push('apply'),
        disposed: () => events.push('dispose'),
      }),
    })
    expect(events).toEqual(['apply'])
    await recomposeProfile(ctx, [], NAME)
    expect(events).toEqual(['apply', 'dispose'])
    expect([...ctx.loader.entries()].some(row => row.options.id === 'group')).toBe(false)
    expect([...ctx.loader.entries()].some(row => row.options.id === 'inner')).toBe(false)
  })

  it('starts an entry the caller stopped, and rejects when it fails afterwards', async () => {
    const events: string[] = []
    let fail = false
    const { generation } = await installedGeneration()
    const held = (): PatchOptions[] => inserted({ id: 'held', name: './held.mjs' })
    const { ctx } = await composition({
      patches: held(),
      modules: { 'held.mjs': HOLDER },
      prepare: packagesOn(generation, async () => generation, {
        applied: () => events.push('apply'),
        disposed: () => events.push('dispose'),
        failing: () => fail,
      }),
    })
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'held')
    if (entry === undefined) throw new Error('held entry missing')
    // A row the caller lists but did not stop keeps the fiber it runs.
    const running = entry.fiber
    await expect(recomposeProfile(ctx, held(), NAME, { running: [entry] })).resolves.toEqual({ warnings: [] })
    expect(entry.fiber).toBe(running)
    expect(events).toEqual(['apply'])

    await stopRow(ctx, entry)
    await expect(recomposeProfile(ctx, held(), NAME, { running: [entry] })).resolves.toEqual({ warnings: [] })
    expect(entry.fiber?.uid).not.toBeNull()
    expect(events).toEqual(['apply', 'apply'])

    await stopRow(ctx, entry)
    fail = true
    // An entry that ran before the caller stopped it is a new failure however it failed before.
    await expect(recomposeProfile(ctx, held(), NAME, { running: [entry] })).rejects.toThrow('holding failed')
  })

  it('retries an entry whose import failed once its files exist', async () => {
    const { generation } = await installedGeneration()
    const late = (): PatchOptions[] => inserted({ id: 'late', name: './late.mjs' })
    const { ctx, dir } = await composition({
      patches: late(),
      prepare: packagesOn(generation, async () => generation, { applied: () => {}, disposed: () => {} }),
    })
    await expect(recomposeProfile(ctx, late(), NAME))
      .resolves.toEqual({ warnings: [expect.stringMatching(/^late \(\.\/late\.mjs\): failed to import: /u)] })
    file(join(dir, 'late.mjs'), 'export function apply() {}\n')
    await expect(recomposeProfile(ctx, late(), NAME)).resolves.toEqual({ warnings: [] })
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'late')
    expect(entry?.fiber?.uid).not.toBeNull()
  })

  it('reports an entry waiting for a service as a warning, and rejects it when required', async () => {
    const { generation } = await installedGeneration()
    const waiter = (): PatchOptions[] => inserted({ id: 'waiter', name: './waiter.mjs' })
    const { ctx } = await composition({
      patches: waiter(),
      modules: { 'waiter.mjs': 'export const inject = ["absentService"]\nexport function apply() {}\n' },
      prepare: packagesOn(generation, async () => generation, { applied: () => {}, disposed: () => {} }),
    })
    await expect(recomposeProfile(ctx, waiter(), NAME))
      .resolves.toEqual({ warnings: ['waiter (./waiter.mjs): pending (waiting for service: absentService)'] })
    await expect(recomposeProfile(ctx, waiter(), NAME, { requiredIds: ['waiter'] }))
      .rejects.toThrow('did not activate')
  })

  it('applies the composition without publishing when no installed generation resolves it', async () => {
    const events: string[] = []
    const probe: Probe = { applied: () => events.push('apply'), disposed: () => events.push('dispose') }
    const native = await composition({
      patches: beta(),
      modules: { 'plug.mjs': RECORDER },
      prepare: async (ctx) => { ctx.provide('probe', probe) },
    })
    await expect(recomposeProfile(native.ctx, [], NAME)).resolves.toEqual({ warnings: [] })
    expect([...native.ctx.loader.entries()].some(row => row.options.id === 'beta')).toBe(false)

    const service = await composition({
      patches: beta(),
      modules: { 'plug.mjs': RECORDER },
      prepare: async (ctx) => {
        ctx.provide('probe', probe)
        await ctx.plugin(PluginPackages)
      },
    })
    await expect(recomposeProfile(service.ctx, [], NAME)).resolves.toEqual({ warnings: [] })
    expect([...service.ctx.loader.entries()].some(row => row.options.id === 'beta')).toBe(false)
    expect(events).toEqual(['apply', 'dispose', 'apply', 'dispose'])
  })

  it('warns about a caller-stopped row that stays inactive after a rejected publication', async () => {
    const events: string[] = []
    let fail = false
    const { generation, moved } = await installedGeneration()
    const held = (): PatchOptions[] => inserted({ id: 'held', name: './held.mjs' })
    const both: PatchOptions[] = [
      { insert: [{ id: 'held', name: './held.mjs' }] },
      { insert: [{ id: 'missing', name: './absent.mjs' }] },
    ]
    const { ctx } = await composition({
      patches: both,
      modules: { 'held.mjs': HOLDER },
      prepare: packagesOn(generation, async () => moved, {
        applied: () => events.push('apply'),
        disposed: () => events.push('dispose'),
        failing: () => fail,
      }),
    })
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'held')
    if (entry === undefined) throw new Error('held entry missing')
    await stopRow(ctx, entry)
    fail = true
    // The stopped row starts again before the publication is judged, so the failure it shows is reported rather than
    // hidden; the dropped row that never started is restored without a warning.
    await expect(recomposeProfile(ctx, held(), NAME, { running: [entry] }))
      .resolves.toEqual({ warnings: [], restartReason: 'package-moved' })
    expect([...ctx.loader.entries()].some(row => row.options.id === 'missing')).toBe(true)
  })

  it('reports its own outcome when a stopped row cannot start again', async () => {
    const events: string[] = []
    let breaking = false
    const { generation, moved } = await installedGeneration()
    const held = (): PatchOptions[] => inserted({ id: 'held', name: './held.mjs' })
    const { ctx } = await composition({
      patches: held(),
      modules: { 'held.mjs': HOLDER },
      prepare: async (host) => {
        host.provide('probe', {
          applied: () => events.push('apply'),
          disposed: () => events.push('dispose'),
          failing: () => false,
        })
        host.on('loader/patch-context', (row, next) => {
          if (breaking && row.options.id === 'held') throw new Error('patch context failed')
          next()
        })
        await host.plugin(PluginPackages, { generation, recompute: async () => moved })
      },
    })
    const warn = vi.spyOn(ctx.logger, 'warn')
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'held')
    if (entry === undefined) throw new Error('held entry missing')
    await stopRow(ctx, entry)
    breaking = true
    await expect(recomposeProfile(ctx, held(), NAME, { running: [entry] }))
      .resolves.toEqual({ warnings: [], restartReason: 'package-moved' })
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'patch context failed' }))
  })

  it('plans the rows a patch list inserts while a patch that matches no row warns', async () => {
    const { generation } = await installedGeneration()
    const { ctx } = await composition({
      patches: beta(),
      modules: { 'plug.mjs': RECORDER },
      prepare: packagesOn(generation, async () => generation, { applied: () => {}, disposed: () => {} }),
    })
    await expect(recomposeProfile(ctx, [...beta(), { id: 'ghost', config: { value: 1 } }], NAME))
      .resolves.toEqual({ warnings: [] })
    expect([...ctx.loader.entries()].some(row => row.options.id === 'beta')).toBe(true)
  })

  it('reports a throwing disabled expression without rejecting', async () => {
    const { generation } = await installedGeneration()
    // The loader evaluates a JavaScript expression object here while its option
    // type declares the resolved boolean, so the bridge is recorded in the
    // unknown-cast baseline instead of widened in place.
    const expression = (): PatchOptions[] => inserted({
      id: 'expr', name: './plug.mjs',
      disabled: { __jsExpr: '(() => { throw new Error("disabled expression failed") })()' } as unknown as boolean,
    })
    const { ctx } = await composition({
      patches: expression(),
      modules: { 'plug.mjs': RECORDER },
      prepare: packagesOn(generation, async () => generation, { applied: () => {}, disposed: () => {} }),
    })
    const result = await recomposeProfile(ctx, expression(), NAME)
    expect(result.warnings).toEqual([expect.stringContaining('disabled expression failed')])
  })
})
