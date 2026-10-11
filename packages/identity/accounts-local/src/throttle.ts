/** Failed sign-in attempts one deployment remembers. */

/**
 * Failures one deployment counts per authority and identifier.
 *
 * Counting starts at the first failure; a window that has passed and a sign-in
 * that succeeded both forget the key, so one mistyped password costs nothing
 * while repeated guessing has to wait. Identifiers that name no account are
 * counted too: a limiter that skipped them would answer a known name
 * differently from an unknown one.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; since: number }>()

  /**
   * @param maxAttempts - failures inside one window after which further attempts wait.
   * @param windowMilliseconds - how long a failure counts toward that wait.
   */
  constructor(private readonly maxAttempts: number, private readonly windowMilliseconds: number) {}

  /**
   * How long one key must wait before another attempt is checked.
   * @param key - authority and normalized identifier of the attempt.
   * @param now - current time in epoch milliseconds.
   * @returns seconds to wait, or undefined when an attempt may proceed.
   */
  retryAfter(key: string, now: number): number | undefined {
    const failure = this.failures.get(key)
    if (failure === undefined) return undefined
    if (now - failure.since >= this.windowMilliseconds) {
      this.failures.delete(key)
      return undefined
    }
    if (failure.count < this.maxAttempts) return undefined
    return Math.max(1, Math.ceil((failure.since + this.windowMilliseconds - now) / 1000))
  }

  /**
   * Record one attempt that failed.
   * @param key - authority and normalized identifier of the attempt.
   * @param now - current time in epoch milliseconds.
   */
  noteFailure(key: string, now: number): void {
    const failure = this.failures.get(key)
    if (failure === undefined || now - failure.since >= this.windowMilliseconds) {
      this.remember(key, { count: 1, since: now })
      return
    }
    failure.count += 1
  }

  /**
   * Forget a key's failures after a sign-in succeeded.
   * @param key - authority and normalized identifier of the attempt.
   */
  noteSuccess(key: string): void {
    this.failures.delete(key)
  }

  /**
   * Keep the table bounded under identifiers that never sign in: expired keys go
   * first, then the oldest remaining one. Evicting costs a key its wait, so an
   * attacker rotating identifiers meets a shorter wait than one repeating a name.
   * @param key - the key being recorded.
   * @param failure - its count and start.
   */
  private remember(key: string, failure: { count: number; since: number }): void {
    if (this.failures.size >= MAX_TRACKED_KEYS) {
      const now = failure.since
      for (const [candidate, recorded] of this.failures) {
        if (now - recorded.since >= this.windowMilliseconds) this.failures.delete(candidate)
      }
      while (this.failures.size >= MAX_TRACKED_KEYS) {
        let oldest: string | undefined
        let oldestSince = Number.POSITIVE_INFINITY
        for (const [candidate, recorded] of this.failures) {
          if (recorded.since < oldestSince) {
            oldest = candidate
            oldestSince = recorded.since
          }
        }
        /* v8 ignore next -- the table is non-empty in this branch */
        if (oldest === undefined) break
        this.failures.delete(oldest)
      }
    }
    this.failures.set(key, failure)
  }
}

/**
 * Keys one deployment tracks before it starts evicting. A resource bound rather
 * than a deployment choice: it exists so identifiers that never sign in cannot
 * grow the table without limit.
 */
const MAX_TRACKED_KEYS = 4_096
