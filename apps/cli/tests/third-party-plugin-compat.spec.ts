/**
 * Third-party plugin compatibility through a real profile (plan:
 * `plans/2026-09-16-third-party-plugin-compat.md`, workflow D).
 *
 * The subject is the shipped path rather than one helper: a package shaped the
 * way the DSH ecosystem ships plugins is installed into a profile directory,
 * reconciled into the bundle layer list, and booted through the Loader, and the
 * assertions read what an operator would see — the row mounted, the plugin's own
 * registration present, its legacy engine peer mapped onto the QiLin package
 * that the installation already provides, and nothing left in a DSH-era home.
 *
 * The hermetic fixtures below stand in for the published plugins so this runs
 * anywhere. The second block runs the same report against the locally mirrored
 * real plugins when `QILIN_DSH_PLUGIN_FIXTURES` names their directory.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  boot, createProfileResolutionGeneration, doctorPluginPackage, initProfile,
  loadProfile, readProfileManifest, reconcileProfilePlugins, resolveProfileDir, writeProfileManifest,
} from '@qilin/app-boot'
import { clientDeclarationOf, dshCompatModuleId } from '@qilin/dsh-compat'
import { INSTALL_ANCHOR, PROFILE_ROOT_FILENAME } from '../src/profile-boot.ts'

const NAME = 'qilin'
const PLUGIN_NAME = 'dsh-fixture-plugin'

const roots: string[] = []
const contexts: { fiber: { dispose(): Promise<void> } }[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-third-party-'))
  roots.push(dir)
  return dir
}

function file(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** The plugin manifest every fixture shares: a DSH-era bundle with a legacy engine peer. */
function pluginManifest(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    version: '1.0.0',
    type: 'module',
    main: './index.js',
    peerDependencies: { '@deepseek-ai/dsh-session': '*' },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-slots'] },
    },
    ...extra,
  }
}

/** Stage one plugin package outside the profile, as a checkout or tarball arrives. */
function stagePlugin(extra: Record<string, unknown> = {}): string {
  const dir = tmp()
  file(join(dir, 'package.json'), JSON.stringify(pluginManifest(extra)))
  file(join(dir, 'cordis.patch.yml'), `- insert:\n    - id: fixture-plugin\n      name: ${PLUGIN_NAME}\n`)
  file(join(dir, 'index.js'), [
    `export const name = ${JSON.stringify(PLUGIN_NAME)}`,
    'export function apply(ctx) {',
    '  ctx.provide(\'fixturePluginLoaded\', true)',
    '}',
    '',
  ].join('\n'))
  return dir
}

/**
 * Install one staged plugin into a fresh profile the way `qilin plugin add`
 * leaves it: the profile manifest names the dependency, the package is
 * materialized under the profile's `node_modules`, and the shared reconcile
 * decides the layer list.
 */
function installIntoProfile(): { home: string; dir: string; pluginDir: string } {
  const home = tmp()
  vi.stubEnv('QILIN_HOME', home)
  const dir = resolveProfileDir('test', home)
  initProfile(dir, [], 'startup')
  file(join(dir, PROFILE_ROOT_FILENAME), '[]\n')
  const pluginDir = stagePlugin()
  writeProfileManifest(dir, {
    name: 'qilin-profile-test',
    private: true,
    dependencies: { [PLUGIN_NAME]: `link:${pluginDir}` },
    qilin: { profile: { bundles: [] } },
  })
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  symlinkSync(pluginDir, join(dir, 'node_modules', PLUGIN_NAME), 'junction')
  const before = readProfileManifest(NAME, dir)
  reconcileProfilePlugins(NAME, before, dir, INSTALL_ANCHOR)
  return { home, dir, pluginDir }
}

describe('third-party plugin installed into a profile', () => {
  it('joins the bundle layer list from its dsh.bundle.patch declaration', () => {
    const { dir } = installIntoProfile()
    const manifest = readProfileManifest(NAME, dir)
    expect(manifest.dependencies?.[PLUGIN_NAME]).toBeDefined()
    expect(manifest.qilin?.profile?.bundles).toEqual([PLUGIN_NAME])
    // The declaration drove activation, not the dependency edge alone.
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules', PLUGIN_NAME, 'package.json'), 'utf8')) as
      { dsh: { bundle: { patch: string } } }
    expect(installed.dsh.bundle.patch).toBe('./cordis.patch.yml')
  })

  it('boots the installed plugin through the Loader and exposes its registration', async () => {
    const { dir } = installIntoProfile()
    const profile = loadProfile(NAME, 'test', INSTALL_ANCHOR, dirname(dirname(dir)))
    // `boot` takes patch layers, not composed entries: the same stack the
    // launcher composes, minus its user and overlay layers.
    const patches = [...profile.layers.flatMap(layer => layer.patches), ...profile.patches]
    const ctx = await boot(NAME, join(dir, PROFILE_ROOT_FILENAME), patches)
    contexts.push(ctx)
    expect(ctx.get('fixturePluginLoaded')).toBe(true)
    const entries = [...(ctx.get('loader')?.entries() ?? [])]
    expect(entries.some(entry => JSON.stringify(entry.options.name) === JSON.stringify(PLUGIN_NAME))).toBe(true)
  })

  it('reports the client declaration and canonicalizes the module names it injects', () => {
    const { pluginDir } = installIntoProfile()
    const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')) as Record<string, unknown>
    const declaration = clientDeclarationOf(manifest)
    expect(declaration?.key).toBe('dsh.client')
    const inject = (declaration?.value as { inject: string[] }).inject
    expect(inject.map(name => dshCompatModuleId(name)))
      .toEqual(['@qilin/client-locale', '@qilin/client-ui-slots'])
  })

  it('maps the declared legacy engine peer onto the installation copy', async () => {
    const { home, pluginDir } = installIntoProfile()
    // An installation that provides the QiLin package the peer maps onto; the
    // plugin declares only the DSH-era name.
    const installation = tmp()
    file(join(installation, 'node_modules', '@qilin', 'session', 'package.json'), JSON.stringify({ name: '@qilin/session', version: '3.0.0' }))
    const anchor = join(installation, 'package.json')
    file(anchor, JSON.stringify({ name: 'qilin-app', version: '3.0.0', dependencies: { '@qilin/session': '3.0.0' } }))
    const profile = loadProfile(NAME, 'test', INSTALL_ANCHOR, home)
    const generation = await createProfileResolutionGeneration({ installAnchor: anchor, profile, home })
    const installed = join(installation, 'node_modules', '@qilin', 'session')
    const published = generation.entries.filter(entry => entry.name === '@deepseek-ai/dsh-session')
    // The plugin's declaration is what publishes the legacy name, in the profile scope.
    expect(published.length).toBeGreaterThan(0)
    // The profile reaches the plugin through a link, so the recorded declarer is
    // the package's real path rather than the link that stands for it.
    expect(published.some(entry => entry.scope === 'profile'
      && entry.declarer === join(realpathSync(pluginDir), 'package.json'))).toBe(true)
    // Every published spelling of the legacy name is the installation's copy, so
    // a plugin importing it shares one engine instance with the launcher.
    expect(published.every(entry => entry.packageDir === installed)).toBe(true)
    expect(generation.entries.find(entry => entry.name === '@qilin/session')?.packageDir).toBe(installed)
  })

  it('leaves no engine copy in the profile and no DSH-era home behind', () => {
    const { home, dir } = installIntoProfile()
    expect(existsSync(join(dir, 'node_modules', '@deepseek-ai'))).toBe(false)
    expect(existsSync(join(home, '.dsh'))).toBe(false)
    // The plugin's own directory under the profile home is the only state, and
    // the Harness home keeps the profile where the launcher looks for it.
    expect(dir).toBe(join(home, 'profiles', 'test'))
  })
})

/** The locally mirrored real plugins, named by an environment variable or absent. */
const fixturePlugins = process.env.QILIN_DSH_PLUGIN_FIXTURES ?? ''

describe.skipIf(fixturePlugins === '')('locally mirrored DSH plugins', () => {
  it.each(['dsh-super-ppts', 'dsh-animations', 'dsh-terminal'])('reports %s as usable', (name) => {
    const dir = join(fixturePlugins, name)
    expect(existsSync(join(dir, 'package.json'))).toBe(true)
    const report = doctorPluginPackage(NAME, dir, INSTALL_ANCHOR)
    expect(report.findings).toEqual([])
    expect(report.verdict).toBe('usable')
  })
})
