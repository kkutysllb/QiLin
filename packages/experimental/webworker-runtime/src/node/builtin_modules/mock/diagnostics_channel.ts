/**
 * `node:diagnostics_channel` stub. `got` opens its telemetry channels at module
 * scope and publishes only when a subscriber exists; the worker has no
 * subscribers, so channels report none and publishing is inert.
 */

/** One named diagnostics channel. */
class Channel {
  /** The worker has no diagnostics subscribers, so this is always false. */
  readonly hasSubscribers = false

  /** @param _message - the payload a real subscriber would receive. */
  publish(_message: unknown): void {}

  /** @param _listener - the subscriber a real channel would retain. */
  subscribe(_listener: (...args: unknown[]) => void): void {}

  /** @param _listener - the subscriber a real channel would drop. */
  unsubscribe(_listener: (...args: unknown[]) => void): void {}
}

const channels = new Map<string, Channel>()

/**
 * Return the channel registered under one name.
 * @param name - channel name, e.g. `got:request:start`.
 * @returns the shared channel.
 */
export function channel(name: string): Channel {
  const existing = channels.get(name)
  if (existing !== undefined) return existing
  const created = new Channel()
  channels.set(name, created)
  return created
}

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: the members `require()` hands a caller of this module. */
export default { channel, Channel }
