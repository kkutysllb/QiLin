/**
 * `assert` for the worker. Dependencies such as `http2-wrapper` use it for
 * protocol invariants; the module is the assertion function itself (Node's
 * shape), with the handful of members those callers reach for.
 */

/** Assertion failure carrying the message the assertion was given. */
export class AssertionError extends Error {
  /**
   * @param message - the failure text.
   */
  constructor(message?: string) {
    super(message ?? 'assertion failed')
    this.name = 'AssertionError'
  }
}

/**
 * Throw unless the value is truthy.
 * @param value - the asserted value.
 * @param message - optional failure text.
 */
export function assert(value: unknown, message?: string): void {
  if (!value) throw new AssertionError(message)
}

/**
 * Compare with `===`.
 * @param actual - observed value.
 * @param expected - required value.
 * @param message - optional failure text.
 */
export function strictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) throw new AssertionError(message)
}

/**
 * Compare with `==`.
 * @param actual - observed value.
 * @param expected - required value.
 * @param message - optional failure text.
 */
export function equal(actual: unknown, expected: unknown, message?: string): void {
  if (actual != expected) throw new AssertionError(message)
}

/** {@link assert} under its Node alias. */
export const ok = assert

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: Node's `assert` module is the assertion function itself. */
export default assert
