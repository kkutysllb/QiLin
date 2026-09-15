import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@qilin/kylin'
import { remoteMethods } from '@qilin/typert-protocol'
import PluginManagerGateway from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Write one package.json at `dir`, creating the path. */
function stagePackage(dir: string, name: string, version: string): void {
  const target = join(dir, ...name.split('/'))
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version }))
}

async function profile(): Promise<{ ctx: Context; manager: PluginManagerGateway }> {
  const root = mkdtempSync(join(tmpdir(), 'qilin-plugin-manager-'))
  roots.push(root)
  const installation = join(root, 'installation')
  const dir = join(root, 'profile')
  mkdirSync(installation, { recursive: true })
  mkdirSync(dir, { recursive: true })
  // The installation seeds the shipped layers; the profile carries the copy a
  // profile-owned bundle upgrade installs over it.
  writeFileSync(join(installation, 'package.json'), JSON.stringify({ name: 'qilin-app', version: '0.0.0' }))
  stagePackage(join(installation, 'node_modules'), '@qilin/base', '3.0.0-seed')
  stagePackage(join(installation, 'node_modules'), '@qilin/coding-sidebar', '1.0.0-seed')
  stagePackage(join(dir, 'node_modules'), '@qilin/coding-sidebar', '1.0.14-profile')
  stagePackage(join(dir, 'node_modules'), '@example/plugin', '1.2.3')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'profile', dependencies: { '@example/plugin': '1.2.3' },
    qilin: { profile: { bundles: ['@qilin/base', '@qilin/coding-sidebar', '@example/plugin'] } },
  }))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('qilinProfile', { name: 'web', dir, home: root, installAnchor: join(installation, 'package.json'), patchReload: 'live', builtInBundles: ['@qilin/base', '@qilin/coding-sidebar'] })
  await ctx.plugin(PluginManagerGateway)
  return { ctx, manager: ctx.get('pluginManager') as PluginManagerGateway }
}

describe('PluginManagerGateway', () => {
  it('publishes list, update, install, remove, checkUpdates, and catalog Remotes', async () => {
    const { manager } = await profile()
    expect(manager.typertRemote).toMatchObject({ serviceKey: 'pluginManager', namespace: 'pluginManager' })
    expect(remoteMethods(manager).map(method => method.method)).toEqual(['list', 'checkUpdates', 'catalog', 'installPlugin', 'updatePlugin', 'uninstallPlugin'])
  })


  it('projects built-in and user bundle layers with installed versions', async () => {
    const { manager } = await profile()
    expect(await manager.list()).toEqual({
      profile: 'web',
      entries: [
        // Shipped engine layer: version comes from the installation, and the row is
        // neither upgradable nor removable here.
        { name: '@qilin/base', version: '3.0.0-seed', layer: 0, source: 'builtin', updatable: false, removable: false },
        // Shipped layer the profile owns: the installed profile copy wins resolution
        // over the seed, so the row reports the upgraded version and can be updated
        // again — but never removed.
        { name: '@qilin/coding-sidebar', version: '1.0.14-profile', layer: 1, source: 'builtin', updatable: true, removable: false },
        { name: '@example/plugin', version: '1.2.3', layer: 2, source: 'user', updatable: true, removable: true },
      ],
    })
  })
})
