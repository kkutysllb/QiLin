/** Handoff reclaim and serialization: which runtime stops, and who may start when. */

import { describe, expect, it } from 'vitest'
import type { TenantHandle, TenantRuntimeState } from '../src/tenant-runtime.ts'
import { createHandoffQueue, reclaimFor } from '../src/tenants.ts'

/** The accounts one reclaim decided to stop, in order. */
const stopped: string[] = []

/** One runtime stand-in carrying the state and last use the decision reads. */
function runtime(accountId: string, state: TenantRuntimeState, lastUsedAt: number): TenantHandle {
  let current = state
  return {
    lastUsedAt,
    status: () => ({ accountId, state: current }),
    stop: async () => { stopped.push(accountId); current = 'stopped' },
  } as unknown as TenantHandle
}

describe('handoff reclaim', () => {
  it('reclaims nothing without a cap or with room to spare', () => {
    const target = runtime('target', 'starting', 0)
    const live = [target, runtime('other', 'running', 1)]
    expect(reclaimFor(live, target, 0)).toBeUndefined()
    expect(reclaimFor(live, target, 2)).toBeUndefined()
  })

  it('reclaims the least recently used running runtime at the cap', () => {
    const target = runtime('target', 'starting', 0)
    const cold = runtime('cold', 'running', 10)
    const warm = runtime('warm', 'running', 20)
    expect(reclaimFor([target, warm, cold], target, 2)).toBe(cold)
  })

  it('never reclaims the runtime about to start, even when it is the coldest', () => {
    const target = runtime('target', 'running', 1)
    const other = runtime('other', 'running', 2)
    expect(reclaimFor([target, other], target, 1)).toBe(other)
  })

  it('leaves a runtime that is still starting alone', () => {
    const target = runtime('target', 'starting', 0)
    const starting = runtime('warm', 'starting', 5)
    const serving = runtime('cold', 'running', 9)
    // The cap is reached by a runtime that cannot be compared yet and one that
    // can: only the serving one is a candidate.
    expect(reclaimFor([target, starting, serving], target, 2)).toBe(serving)
    expect(reclaimFor([target, starting], target, 1)).toBeUndefined()
  })
})

describe('handoff serialization', () => {
  it('runs one handoff at a time', async () => {
    const queue = createHandoffQueue()
    const order: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = queue(async () => { order.push('first:start'); await gate; order.push('first:end') })
    const second = queue(async () => { order.push('second') })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(order).toEqual(['first:start'])
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('leaves the queue usable after a handoff fails', async () => {
    const queue = createHandoffQueue()
    await expect(queue(async () => { throw new Error('handoff failed') })).rejects.toThrow('handoff failed')
    await expect(queue(async () => 'next')).resolves.toBe('next')
  })
})
