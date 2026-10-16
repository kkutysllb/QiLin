import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, FiberState, type Plugin } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import { remoteMethods } from '@qilin-agent/typert-protocol'
import type { AgentPresets } from '@qilin-agent/agent-presets'
import PluginInventoryGateway from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}

async function harness(baseUrl?: string): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  // The Loader's child contexts inherit baseUrl at creation, so it is set first.
  if (baseUrl !== undefined) ctx.baseUrl = baseUrl
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory }
}

describe('PluginInventoryGateway', () => {
  it('publishes one direct list method under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
    ])
  })

  it('projects current non-group Loader entries without a second cache', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })

    const snapshot = await inventory.list()
    // No agent-preset roster is composed, so the snapshot carries no presets.
    expect(snapshot.agentPresets).toBeUndefined()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        enabled: true,
        fiberPhase: 'pending',
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        enabled: false,
        fiberPhase: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect((await inventory.list()).entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      enabled: false,
      fiberPhase: null,
    })

    ctx.loader.remove(pendingId)
    expect((await inventory.list()).entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })

  it('attaches local display metadata to entries and preset rows when the package reader answers', async () => {
    const { ctx, inventory } = await harness(pathToFileURL(join(tmpdir(), 'entry.mjs')).href)
    const meta = { title: { en: 'Active plugin', zh: '活跃插件' }, description: { en: 'Active description' } }
    ctx.provide('pluginPackages', {
      metaOf: (specifier: string) => (specifier === 'cordis:active' ? meta : undefined),
    } as never)
    await ctx.loader.create({ name: 'cordis:active', disabled: true })
    await ctx.loader.create({ name: 'cordis:unlabelled', disabled: true })
    ctx.provide('agentPresets', {
      compositionInventory: async () => [{
        id: 'standard',
        trust: 'system',
        isDefault: true,
        rows: [
          { entryId: 'active', moduleName: 'cordis:active', enabled: false },
          { entryId: null, moduleName: 'cordis:unlabelled', enabled: false },
        ],
      }],
    } as never)

    const snapshot = await inventory.list()
    expect(snapshot.entries).toMatchObject([
      { moduleName: 'cordis:active', meta },
      { moduleName: 'cordis:unlabelled' },
    ])
    expect(snapshot.entries[1]?.meta).toBeUndefined()
    expect(snapshot.agentPresets?.[0]?.rows).toMatchObject([
      { moduleName: 'cordis:active', meta },
      { moduleName: 'cordis:unlabelled' },
    ])
    expect(snapshot.agentPresets?.[0]?.rows[1]?.meta).toBeUndefined()
  })

  it('marks persistent management available when the manager service is mounted', async () => {
    const { ctx, inventory } = await harness()
    ctx.provide('pluginManager', {} as never)
    expect((await inventory.list()).managementAvailable).toBe(true)
  })

  it('carries each composed preset with root-fiber states mapped to phases', async () => {
    const { ctx, inventory } = await harness()
    ctx.provide('agentPresets', {
      compositionInventory: async () => [
        {
          id: 'standard',
          trust: 'system',
          name: '标准模式',
          isDefault: true,
          rows: [
            { entryId: 'alpha', moduleName: 'pkg-alpha', enabled: true, fiberState: FiberState.ACTIVE },
            { entryId: null, moduleName: 'pkg-file', enabled: 'conditional', condition: 'x' },
          ],
        },
        { id: 'damaged', trust: 'user', isDefault: false, broken: 'the composition file is missing', rows: [] },
      ],
    } as Partial<AgentPresets> as never)

    const snapshot = await inventory.list()
    expect(snapshot.agentPresets).toEqual([
      {
        id: 'standard',
        trust: 'system',
        name: '标准模式',
        isDefault: true,
        rows: [
          { entryId: 'alpha', moduleName: 'pkg-alpha', enabled: true, fiberPhase: 'active' },
          { entryId: null, moduleName: 'pkg-file', enabled: 'conditional', condition: 'x', fiberPhase: null },
        ],
      },
      { id: 'damaged', trust: 'user', isDefault: false, broken: 'the composition file is missing', rows: [] },
    ])
  })
})
