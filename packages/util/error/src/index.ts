/**
 * Dependency-free harness error base with a stable machine-routable code and
 * chained cause. Capability packages extend it so tool results, model
 * requests, and persisted failures retain the failure class.
 *
 * Leaf package: it imports nothing, so both `@qilin-agent/llm` and
 * `@qilin-agent/attachment` can extend the same class without a cycle.
 * @module @qilin-agent/util-error
 */

/**
 * Base class for all harness errors. Carries a `code` (stable, programmatic —
 * e.g. `NO_ADAPTER`, `INVALID_ARGS`, `ATTACHMENT_NOT_FOUND`) distinct from the
 * human-readable `message`, and supports `cause` chaining via the standard
 * `ErrorOptions`. `name` defaults to the subclass constructor name.
 */
export class HarnessError extends Error {
  /** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
  readonly code: string

  /**
   * @param message - human-readable failure description.
   * @param code - stable machine-routable failure class.
   * @param options - optional chained cause.
   */
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = new.target.name
  }
}
