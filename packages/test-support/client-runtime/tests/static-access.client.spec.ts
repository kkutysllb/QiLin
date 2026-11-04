/**
 * `StaticRemoteAccess` and `allowAllAccess`: the allow-everything fakes a
 * client spec hands to hand-built component props and to
 * `remoteAccess.whenAccess` consumers. The fixed answers never change, so a
 * spec pins the observable identity, the refusal face, and effect ownership
 * in the caller's fiber.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session/types'
import type { RemoteResult, TypertResource } from '@qilin-agent/typert-protocol'
import { StaticRemoteAccess, allowAllAccess } from '../src/access.ts'

declare module '@qilin-agent/typert-protocol' {
  interface TypertRemoteMap {
    /** Probe endpoint; `StaticRemoteAccess` answers actions as plain strings. */
    'static-access/probe': () => Promise<RemoteResult<undefined>>
  }

  interface TypertResourceMap {
    /** Probe resource kind for the resource-scoped access face. */
    'static-access-probe': TypertResource<string>
  }
}

describe('allowAllAccess', () => {
  it('allows every action on every resource', () => {
    expect(allowAllAccess.useRemoteAccess('static-access/probe')).toBe(true)
    expect(allowAllAccess.useSessionAccess(SessionId('s1'), 'static-access/probe')).toBe(true)
    expect(allowAllAccess.useAccess('static-access/probe')).toBe(true)
  })
})

describe('StaticRemoteAccess', () => {
  it('answers every action once and installs an allowed effect in the caller fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(StaticRemoteAccess)
    const source = ctx.remoteAccess.source('static-access-probe', 'p1', 'static-access/probe')
    expect(source.getSnapshot()).toBe(true)
    // The fixed answer installs no subscription work.
    const listener = vi.fn()
    source.subscribe(listener)()
    expect(listener).not.toHaveBeenCalled()

    const disposeEffect = vi.fn()
    const callback = vi.fn((): (() => void) => disposeEffect)
    const stop = ctx.remoteAccess.whenAccess('static-access/probe', callback)
    // An allowed action runs the callback at once and disposes it with the caller.
    expect(callback).toHaveBeenCalledOnce()
    expect(disposeEffect).not.toHaveBeenCalled()
    stop()
    expect(disposeEffect).toHaveBeenCalledOnce()

    // The resource face shares the same answer and delegates to whenAccess.
    const resourceEffect = vi.fn()
    const resourceCallback = vi.fn((): (() => void) => resourceEffect)
    const stopResource = ctx.remoteAccess.whenResourceAccess('static-access-probe', 'p1', 'static-access/probe', resourceCallback)
    expect(resourceCallback).toHaveBeenCalledOnce()
    stopResource()
    expect(resourceEffect).toHaveBeenCalledOnce()
  })

  it('answers a refused action false and never installs its effects', async () => {
    const ctx = new Context()
    await ctx.plugin(StaticRemoteAccess, (action: string) => action !== 'static-access/probe')
    const source = ctx.remoteAccess.source('static-access-probe', 'p2', 'static-access/probe')
    expect(source.getSnapshot()).toBe(false)
    const listener = vi.fn()
    source.subscribe(listener)()
    expect(listener).not.toHaveBeenCalled()

    const callback = vi.fn((): (() => void) => vi.fn())
    const stop = ctx.remoteAccess.whenAccess('static-access/probe', callback)
    expect(callback).not.toHaveBeenCalled()
    // The refusal disposer is a no-op that still satisfies the access contract.
    expect(() => { stop() }).not.toThrow()
    expect(callback).not.toHaveBeenCalled()
  })
})
