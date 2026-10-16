/**
 * Real-composition guard: the market row, a settings provider, and a plugin-manager stand-in boot from a test-only
 * cordis.yml through the actual Loader + Include path. `setIndexes` persists index sources into the settings document
 * without remounting the row, announces them once, and a restart reads them back; the same row booted WITHOUT a
 * settings entry keeps its composition indexes and refuses to save.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { Context, Service } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import FileSettingsProvider from '@qilin-agent/settings-file'
import { remoteErrorOf } from '@qilin-agent/typert-protocol'
import PluginMarket from '../src/index.ts'

const FIRST = 'https://first.example/index.json'
const SECOND = 'https://second.example/index.json'
const LOCAL = 'http://127.0.0.1:8080/index.json'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Market rows mounted so far, so a save that remounted the row fails loudly. */
let mounts = 0

/** The market row as the Loader mounts it, counting its constructions. */
class CountingMarket extends PluginMarket {
  constructor(ctx: Context, config: ConstructorParameters<typeof PluginMarket>[1]) {
    super(ctx, config)
    mounts++
  }
}

/** The `pluginManager` reads the market makes, with an empty profile. */
class StubPluginManager extends Service {
  constructor(ctx: Context) { super(ctx, 'pluginManager') }
  listBundles() { return Promise.resolve([]) }
  listVersionExemptions() { return { exemptions: {}, warnings: [] } }
}

/**
 * Boot the market row over one settings document.
 * @param settingsPath - settings document the provider owns, or undefined for a composition without a settings row.
 * @returns the root context after the tree settles.
 */
async function loadComposition(settingsPath: string | undefined): Promise<Context> {
  const configPath = join(root as string, 'cordis.yml')
  await writeFile(configPath, [
    ...settingsPath === undefined ? [] : [
      '- id: settings',
      "  name: 'cordis:settings'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
    ],
    '- id: plugin-manager',
    "  name: 'cordis:manager'",
    '- id: plugin-market',
    "  name: 'cordis:market'",
    '  config:',
    '    indexes:',
    `      - ${FIRST}`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, { include: Include, settings: FileSettingsProvider, manager: StubPluginManager, market: CountingMarket })
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return ctx
}

/** One temporary Harness home holding the settings document and the composition. */
async function home(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'qilin-plugin-market-configuration-'))
  root = dir
  return dir
}

it('saves index sources without remounting, announces them, and restores them at restart', async () => {
  const dir = await home()
  const settingsPath = join(dir, 'settings.yaml')
  await writeFile(settingsPath, '# personal settings\n')

  let ctx = await loadComposition(settingsPath)
  const market = ctx.pluginMarket
  expect(market.listIndexes()).toEqual([{ url: FIRST }])
  let changes = 0
  ctx.on('plugin-market/changed', () => { changes++ })

  await market.setIndexes([`${SECOND} `, LOCAL])
  expect(market.listIndexes().map(index => index.url)).toEqual([SECOND, LOCAL])
  // The committed list is announced once, through the settings section, without remounting the row.
  await vi.waitFor(() => { expect(changes).toBe(1) })
  expect(mounts).toBe(1)

  // The provider debounces its write; the document is what a restart reads.
  await vi.waitFor(async () => {
    expect(await readFile(settingsPath, 'utf8')).toContain(SECOND)
  })

  await ctx.fiber.dispose()
  context = undefined
  ctx = await loadComposition(settingsPath)
  expect(ctx.pluginMarket.listIndexes().map(index => index.url)).toEqual([SECOND, LOCAL])
})

it('refuses to save without a settings entry and keeps its composition indexes', async () => {
  await home()
  const ctx = await loadComposition(undefined)
  expect(ctx.get('settings')).toBeUndefined()
  expect(ctx.pluginMarket.listIndexes()).toEqual([{ url: FIRST }])
  const failure = await ctx.pluginMarket.setIndexes([SECOND])
    .then(() => { throw new Error('resolved') }, (error: unknown) => remoteErrorOf(error))
  expect(failure).toMatchObject({ code: 'plugin-market/settings-unavailable' })
  expect(ctx.pluginMarket.listIndexes()).toEqual([{ url: FIRST }])
})
