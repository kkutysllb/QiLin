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
export declare class LoginThrottle {
  private readonly maxAttempts
  private readonly windowMilliseconds
  private readonly failures
  /**
     * @param maxAttempts - failures inside one window after which further attempts wait.
     * @param windowMilliseconds - how long a failure counts toward that wait.
     */
  constructor(maxAttempts: number, windowMilliseconds: number)
  /**
     * How long one key must wait before another attempt is checked.
     * @param key - authority and normalized identifier of the attempt.
     * @param now - current time in epoch milliseconds.
     * @returns seconds to wait, or undefined when an attempt may proceed.
     */
  retryAfter(key: string, now: number): number | undefined
  /**
     * Record one attempt that failed.
     * @param key - authority and normalized identifier of the attempt.
     * @param now - current time in epoch milliseconds.
     */
  noteFailure(key: string, now: number): void
  /**
     * Forget a key's failures after a sign-in succeeded.
     * @param key - authority and normalized identifier of the attempt.
     */
  noteSuccess(key: string): void
  /**
     * Keep the table bounded under identifiers that never sign in: expired keys go
     * first, then the oldest remaining one. Evicting costs a key its wait, so an
     * attacker rotating identifiers meets a shorter wait than one repeating a name.
     * @param key - the key being recorded.
     * @param failure - its count and start.
     */
  private remember
}
//# sourceMappingURL=throttle.d.ts.map
