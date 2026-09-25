/** Lift an async-generator fake into the stream handle a generated Remote method returns. */
import type { RemoteStreamHandle } from '@qilin/typert-protocol'

/** Downlink item type of one generated stream method. */
type StreamItem<Method> = Method extends (...args: never[]) => RemoteStreamHandle<infer Out, unknown> ? Out : never

/**
 * Type a fake stream method's result as the handle its generated Remote method
 * returns. The uplink members are inert: a fake built on it drives the downlink only.
 * @param method - fake taking the method's arguments and yielding its downlink items.
 * @returns the fake returning a handle over each call's items.
 */
export function streamMethod<Method extends (...args: never[]) => RemoteStreamHandle<unknown, unknown>>(
  method: (...args: Parameters<Method>) => AsyncIterable<StreamItem<Method>>,
): Method {
  const lifted = (...args: Parameters<Method>): RemoteStreamHandle<StreamItem<Method>, unknown> => {
    const source = method(...args)
    return {
      [Symbol.asyncIterator]: () => source[Symbol.asyncIterator](),
      send: () => undefined,
      end: () => undefined,
      dispose: () => undefined,
    }
  }
  return lifted as Method
}
