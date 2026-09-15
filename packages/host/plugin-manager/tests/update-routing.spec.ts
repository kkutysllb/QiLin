/** Update routing: a shipped layer upgrades by `add @latest`, a user layer by `pnpm update`. */
import { ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import PluginManagerGateway from '../src/index.ts'

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn(),
}))

const contexts: Context[] = []
const roots: string[] = []
let child: ChildProcess

beforeEach(() => {
  child = new ChildProcess()
  vi.mocked(spawn).mockReturnValue(child)
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.mocked(spawn).mockReset()
})

/** Profile whose shipped layers are the engine floor plus one profile-owned bundle. */
async function profile(): Promise<{ manager: PluginManagerGateway; dir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'qilin-plugin-routing-'))
  roots.push(root)
  const dir = join(root, 'profile')
  mkdirSync(join(dir, 'node_modules', '@example', 'plugin'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'profile', dependencies: { '@example/plugin': '1.2.3' },
    qilin: { profile: { bundles: ['@qilin/base', '@qilin/web-app', '@example/plugin'] } },
  }))
  writeFileSync(join(dir, 'node_modules', '@example', 'plugin', 'package.json'), JSON.stringify({ name: '@example/plugin', version: '1.2.3' }))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('qilinProfile', { name: 'web', dir, home: root, installAnchor: join(root, 'app.json'), patchReload: 'live', builtInBundles: ['@qilin/base', '@qilin/web-app'] })
  await ctx.plugin(PluginManagerGateway)
  return { manager: ctx.get('pluginManager') as PluginManagerGateway, dir }
}

/** Settle the spawned pnpm child so the manager's mutation promise resolves. */
async function runMutation(manager: PluginManagerGateway, name: string): Promise<void> {
  const pending = manager.updatePlugin(name)
  await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
  child.emit('close', 0)
  await pending
}

describe('plugin update routing', () => {
  it('refuses a shipped layer without spawning pnpm', async () => {
    const { manager } = await profile()
    await expect(manager.updatePlugin('@qilin/web-app')).rejects.toThrow('cannot be updated')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('upgrades a user layer through pnpm update', async () => {
    const { manager } = await profile()
    await runMutation(manager, '@example/plugin')
    expect(vi.mocked(spawn)).toHaveBeenCalledWith('pnpm', ['update', '--latest', '@example/plugin'], expect.anything())
  })

  it('refuses the engine layer without spawning pnpm', async () => {
    const { manager } = await profile()
    await expect(manager.updatePlugin('@qilin/base')).rejects.toThrow('cannot be updated')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses to remove a shipped layer', async () => {
    const { manager } = await profile()
    await expect(manager.uninstallPlugin('@qilin/web-app')).rejects.toThrow('cannot be removed')
    expect(spawn).not.toHaveBeenCalled()
  })
})
