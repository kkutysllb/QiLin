import { afterEach, describe, expect, it } from 'vitest'
import { installSchedulerYield } from '../src/scheduler-yield.ts'

const host = globalThis as { scheduler?: unknown }

afterEach(() => {
  Reflect.deleteProperty(host, 'scheduler')
})

describe('installSchedulerYield', () => {
  it('installs a fallback that yields past the microtask queue', async () => {
    Reflect.deleteProperty(host, 'scheduler')
    expect(installSchedulerYield()).toBe(true)
    const scheduler = host.scheduler as { yield: () => Promise<void> }
    const order: string[] = []
    const pending = scheduler.yield().then(() => { order.push('yield') })
    await Promise.resolve().then(() => { order.push('microtask') })
    expect(order).toEqual(['microtask'])
    await pending
    expect(order).toEqual(['microtask', 'yield'])
  })

  it('keeps a scheduler the host provides', () => {
    const native: { yield: () => Promise<void> } = { yield: () => Promise.resolve() }
    Object.defineProperty(globalThis, 'scheduler', { value: native, writable: true, configurable: true })
    expect(installSchedulerYield()).toBe(false)
    expect(host.scheduler).toBe(native)
  })

  it('installs once and leaves the installed fallback in place', () => {
    Reflect.deleteProperty(host, 'scheduler')
    expect(installSchedulerYield()).toBe(true)
    const installed = host.scheduler
    expect(installSchedulerYield()).toBe(false)
    expect(host.scheduler).toBe(installed)
  })
})
