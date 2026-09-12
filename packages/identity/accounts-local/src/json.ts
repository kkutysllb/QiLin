/**
 * JSON boundary helpers shared by the account file parser and the session
 * cookie decoder, both of which read values this package did not construct in
 * the current process.
 * @module @qilin/accounts-local/src/json
 */

/**
 * Whether one decoded JSON value is a plain object.
 * @param value - any decoded value.
 * @returns true for a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
