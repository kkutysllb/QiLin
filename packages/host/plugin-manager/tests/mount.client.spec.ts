import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import { apply as applyGateway, inject as gatewayInject } from '@qilin/api-gateway/client'
import type { ConnectionHandle } from '@qilin/client-connection/client'
import TypertRegistry from '@qilin/typert-registry'

/**
 * Mounts the generated Client descriptor group on a real Client namespace
 * service. Names the Client API accepts, not just the Host method list: a
 * method the namespace service already owns (`install`, `remove`) is refused
 * here, and the shipped names carry the suffix that avoids the reservation.
 */
const artifact = fileURLToPath(new URL('../lib/typert.remote-client.js', import.meta.url))

describe.skipIf(!existsSync(artifact))('pluginManager generated Client Remote', () => {
  it('mounts every generated descriptor on the Client namespace service', async () => {
    const { TYPERT_REMOTE } = await import(artifact) as {
      TYPERT_REMOTE: { package: string; descriptors: readonly Record<string, unknown>[] }
    }
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', {
      isLoopback: true,
      generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
      rpc: { call: vi.fn(), open: () => { throw new Error('no stream in this mount test') } },
      registerGenerationSource: () => () => {},
      start: () => ({ stop: () => {} }),
    } as unknown as ConnectionHandle)
    await ctx.plugin({ inject: gatewayInject, apply: applyGateway })
    try {
      await ctx.remote.$mount(TYPERT_REMOTE as never)
      const namespace = (ctx.remote as unknown as Record<string, unknown>).pluginManager as Record<string, unknown>
      expect(typeof namespace.list).toBe('function')
      expect(typeof namespace.installPlugin).toBe('function')
      expect(typeof namespace.updatePlugin).toBe('function')
      expect(typeof namespace.uninstallPlugin).toBe('function')
      // The bare name is what the namespace service owns, so it stays refused.
      await expect(ctx.remote.$mount({
        package: '@fixture/legacy-install-name',
        descriptors: [{
          ...TYPERT_REMOTE.descriptors[0],
          id: '@fixture/legacy-install-name#pluginManager/install',
          method: 'install',
        }],
      } as never)).rejects.toThrow('conflicts with its namespace service')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
