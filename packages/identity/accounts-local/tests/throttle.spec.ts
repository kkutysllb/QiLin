/** Sign-in attempt limiting: when a key waits, and every way it is forgotten. */

import { describe, expect, it } from 'vitest'
import { LoginThrottle } from '../src/throttle.ts'

const WINDOW = 60_000

describe('login throttle', () => {
  it('waits only after the allowed failures inside one window', () => {
    const throttle = new LoginThrottle(3, WINDOW)
    expect(throttle.retryAfter('a\nx', 0)).toBeUndefined()
    throttle.noteFailure('a\nx', 0)
    throttle.noteFailure('a\nx', 1)
    expect(throttle.retryAfter('a\nx', 2)).toBeUndefined()
    throttle.noteFailure('a\nx', 2)
    // The third failure reaches the limit; the wait is what is left of the window.
    expect(throttle.retryAfter('a\nx', 3)).toBe(60)
  })

  it('keeps one key apart from another', () => {
    const throttle = new LoginThrottle(1, WINDOW)
    throttle.noteFailure('a\nx', 0)
    expect(throttle.retryAfter('a\nx', 1)).toBe(60)
    expect(throttle.retryAfter('a\ny', 1)).toBeUndefined()
    expect(throttle.retryAfter('b\nx', 1)).toBeUndefined()
  })

  it('forgets a key when the window passes', () => {
    const throttle = new LoginThrottle(1, WINDOW)
    throttle.noteFailure('a\nx', 0)
    expect(throttle.retryAfter('a\nx', WINDOW)).toBeUndefined()
    throttle.noteFailure('a\nx', WINDOW + 1)
    expect(throttle.retryAfter('a\nx', WINDOW + 2)).toBe(60)
  })

  it('forgets a key when a sign-in succeeds', () => {
    const throttle = new LoginThrottle(1, WINDOW)
    throttle.noteFailure('a\nx', 0)
    throttle.noteSuccess('a\nx')
    expect(throttle.retryAfter('a\nx', 1)).toBeUndefined()
  })

  it('starts the window again after one lapses between failures', () => {
    const throttle = new LoginThrottle(2, WINDOW)
    throttle.noteFailure('a\nx', 0)
    throttle.noteFailure('a\nx', WINDOW)
    expect(throttle.retryAfter('a\nx', WINDOW + 1)).toBeUndefined()
    throttle.noteFailure('a\nx', WINDOW + 1)
    expect(throttle.retryAfter('a\nx', WINDOW + 2)).toBe(60)
  })

  it('reclaims expired keys before evicting a live one', () => {
    const throttle = new LoginThrottle(1, WINDOW)
    for (let index = 0; index < 4_096; index += 1) throttle.noteFailure(`old\n${String(index)}`, 0)
    // A full table whose entries have all lapsed is reclaimed, not evicted.
    throttle.noteFailure('new\n0', WINDOW + 1)
    expect(throttle.retryAfter('old\n0', WINDOW + 2)).toBeUndefined()
    expect(throttle.retryAfter('new\n0', WINDOW + 2)).toBeGreaterThan(0)
  })

  it('bounds what it remembers, evicting the oldest key first', () => {
    const throttle = new LoginThrottle(1, WINDOW)
    for (let index = 0; index < 4_100; index += 1) throttle.noteFailure(`a\n${String(index)}`, 1_000 + index)
    expect(throttle.retryAfter('a\n0', 5_000)).toBeUndefined()
    expect(throttle.retryAfter('a\n4099', 5_000)).toBeGreaterThan(0)
  })
})
