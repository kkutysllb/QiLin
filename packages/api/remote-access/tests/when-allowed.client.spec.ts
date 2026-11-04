/**
 * `whenAllowed` — the effect controller behind `whenAccess`: install an
 * allowed callback's effects, dispose them on refusal, reinstall on the next
 * grant, suppress redundant reconciliations, and retire the controller when an
 * installation fails (inert `INACTIVE_EFFECT` versus a surfaced microtask
 * error). The answer is a fake observable whose listeners the spec fires
 * explicitly, including one fired after the controller unsubscribed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { HostObservable } from '@qilin-agent/client-ui-slots'
import { whenAllowed } from '../src/client/when-allowed.ts'

/** A `HostObservable<boolean>` with spec-driven notifications. */
class FakeAnswer implements HostObservable<boolean> {
  private readonly listeners = new Set<() => void>()
  /** The last listener `subscribe` received, retained so a spec can fire it after disposal. */
  captured: (() => void) | undefined
  private allowed: boolean

  constructor(allowed: boolean) {
    this.allowed = allowed
  }

  getSnapshot = (): boolean => this.allowed

  subscribe = (listener: () => void): (() => void) => {
    this.captured = listener
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Change the answer and notify the current listeners. */
  set(allowed: boolean): void {
    this.allowed = allowed
    this.notify()
  }

  /** Notify the current listeners without changing the answer. */
  notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('whenAllowed', () => {
  it('runs an already-allowed callback at once, then follows refusals and grants', () => {
    const ctx = new Context()
    const answer = new FakeAnswer(true)
    const disposals: string[] = []
    let runs = 0
    const callback = (): (() => void) => {
      const run = ++runs
      return () => { disposals.push(`run-${run}`) }
    }
    const stop = whenAllowed(ctx, answer, callback, 'spec: when-allowed')
    // An already-true answer installs synchronously, during the controller's own setup.
    expect(runs).toBe(1)
    // A notification that repeats the installed answer reconciles nothing.
    answer.notify()
    expect(runs).toBe(1)
    answer.set(false)
    expect(disposals).toEqual(['run-1'])
    // A notification that repeats the absent installation reconciles nothing either.
    answer.notify()
    expect(runs).toBe(1)
    answer.set(true)
    expect(runs).toBe(2)
    stop()
    expect(disposals).toEqual(['run-1', 'run-2'])
    // A late notification on the retired controller changes nothing.
    answer.captured?.()
    expect(runs).toBe(2)
  })

  it('retires the controller when the initial installation throws', () => {
    const ctx = new Context()
    const answer = new FakeAnswer(true)
    const failure = new Error('effect installation refused')
    const callback = vi.fn((): (() => void) => { throw failure })
    expect(() => whenAllowed(ctx, answer, callback, 'spec: initial failure')).toThrow(failure)
    // A failed installation is final: a later grant never retries it.
    answer.set(false)
    answer.set(true)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('stops quietly when a notification-time installation reports an inactive effect', () => {
    const ctx = new Context()
    const answer = new FakeAnswer(false)
    const inactive = Object.assign(new Error('cannot create effect on inactive context'), { code: 'INACTIVE_EFFECT' })
    const callback = vi.fn((): (() => void) => { throw inactive })
    const stop = whenAllowed(ctx, answer, callback, 'spec: inactive effect')
    // The rejection is expected during teardown and never reaches the event path.
    expect(() => { answer.set(true) }).not.toThrow()
    expect(callback).toHaveBeenCalledOnce()
    answer.set(false)
    answer.set(true)
    expect(callback).toHaveBeenCalledOnce()
    // Disposing afterwards reaches the already-stopped controller without a second teardown.
    expect(() => { stop() }).not.toThrow()
  })

  it('surfaces a notification-time failure on a microtask', () => {
    const ctx = new Context()
    const answer = new FakeAnswer(false)
    const queued: Array<() => void> = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => { queued.push(task) })
    const failure = new Error('decoration failed')
    whenAllowed(ctx, answer, (): (() => void) => { throw failure }, 'spec: surfaced failure')
    answer.set(true)
    expect(queued).toHaveLength(1)
    expect(() => { queued[0]?.() }).toThrow(failure)
  })

  it('wraps a non-Error notification-time failure before surfacing it', () => {
    const ctx = new Context()
    const queued: Array<() => void> = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => { queued.push(task) })
    // A throwing read fails the reconciliation with a non-Error; effect
    // construction failures reach the catch already normalized to an Error.
    let refusal: unknown
    const listeners = new Set<() => void>()
    const answer: HostObservable<boolean> = {
      getSnapshot: () => {
        const thrown = refusal
        refusal = undefined
        if (thrown !== undefined) throw thrown
        return false
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    whenAllowed(ctx, answer, (): (() => void) => () => {}, 'spec: non-Error failure')
    refusal = 'plain refusal'
    for (const listener of [...listeners]) listener()
    expect(queued).toHaveLength(1)
    expect(() => { queued[0]?.() }).toThrow(new Error('plain refusal'))
  })
})
