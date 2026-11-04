/**
 * The mounted `remoteAccess` Client service's two effect faces:
 * `whenAccess` (global resource) and `whenResourceAccess` (one resource of a
 * declared kind) both delegate to `whenAllowed`, so each installs an allowed
 * action's effects in the caller's fiber and disposes them with the returned
 * disposer. The owner baseline allows everything, which keeps this spec on the
 * delegation itself.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { RemoteResult, TypertRemoteContribution, TypertResource } from '@qilin-agent/typert-protocol'
import { mountAccess } from '../src/client/mount.ts'

declare module '@qilin-agent/typert-protocol' {
  interface TypertRemoteMap {
    /** Probe endpoint for the mounted service's effect faces. */
    'access-probe': () => Promise<RemoteResult<undefined>>
  }

  interface TypertResourceMap {
    /** Probe resource kind for the resource-scoped face. */
    'probe-shelf': TypertResource<string>
  }
}

/** Mount the access namespace over a fake Remote carrier that never opens a stream. */
async function mounted(): Promise<{ readonly ctx: Context; readonly unmount: ReturnType<typeof vi.fn> }> {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  const remote = {
    $mount: vi.fn(async () => unmount),
    // A stream that yields nothing: the owner baseline already answers every source.
    $stream: vi.fn(() => ({
      restart: () => {},
      dispose: async () => {},
      [Symbol.asyncIterator]: async function* () { await new Promise<void>(() => {}) },
    })),
    remoteAccess: { follow: vi.fn() },
  }
  ctx.provide('remote', remote as never)
  ctx.provide('slots', { provideRoot: () => () => {} } as never)
  const contribution: TypertRemoteContribution = { package: '@qilin-agent/api-remote-access', descriptors: [] }
  await ctx.plugin({
    inject: ['remote', 'slots'],
    apply: async (pluginCtx: Context) => { await mountAccess(pluginCtx, contribution, { type: 'baseline', owner: true }) },
  })
  // The generated namespace normally arrives after the mount, as `$mount` provides it.
  ctx.provide('remote.remoteAccess', remote.remoteAccess as never)
  await vi.waitFor(() => { expect(remote.$stream).toHaveBeenCalledOnce() })
  return { ctx, unmount }
}

describe('remote-access Client service effect faces', () => {
  it('installs and disposes a global action\'s effects through whenAccess', async () => {
    const { ctx } = await mounted()
    const installs: string[] = []
    const stop = ctx.remoteAccess.whenAccess('access-probe', () => {
      installs.push('action')
      return () => { installs.push('action:off') }
    })
    expect(installs).toEqual(['action'])
    stop()
    expect(installs).toEqual(['action', 'action:off'])
  })

  it('installs and disposes a resource action\'s effects through whenResourceAccess', async () => {
    const { ctx } = await mounted()
    const installs: string[] = []
    const stop = ctx.remoteAccess.whenResourceAccess('probe-shelf', 'p1', 'access-probe', () => {
      installs.push('resource')
      return () => { installs.push('resource:off') }
    })
    expect(installs).toEqual(['resource'])
    stop()
    expect(installs).toEqual(['resource', 'resource:off'])
  })
})
