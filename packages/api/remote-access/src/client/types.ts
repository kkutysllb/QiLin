/**
 * Client access contracts shared by the service, its Hooks, and their consumers.
 * @module @qilin-agent/api-remote-access/client/types
 */

import type { HostObservable } from '@qilin-agent/client-ui-slots'
import type { TypertRemoteMap, TypertResourceKind } from '@qilin-agent/typert-protocol'

/** Every endpoint the Client Remote namespaces declare. */
export type RemoteEndpoint = Extract<keyof TypertRemoteMap, string>

/** One synchronous effect installed while access holds: a disposer, or disposers installed as one transaction. */
export type AccessEffect = (() => void) | Iterable<() => void, void, void>

/** Client access answers over the calling Peer's snapshot; it never issues a request. */
export interface ClientRemoteAccess {
  /**
   * Whether the current Peer may call `action` on one resource.
   * True for the owner; false without a baseline and after a non-owner
   * stream fails; otherwise whether the resource's grant lists the action.
   * @param kind - resource kind declared in `TypertResourceMap`.
   * @param id - resource identity.
   * @param action - endpoint action the caller would invoke.
   * @returns identity-stable boolean source for this `(kind, id, action)`.
   */
  source(kind: TypertResourceKind, id: string, action: string): HostObservable<boolean>
  /**
   * Keep `callback`'s effects installed while the current Peer may call
   * `action` on the global resource: run it when the answer becomes true,
   * dispose its effects in reverse order when it becomes false, and run it
   * again on the next true. The callback runs synchronously when the answer
   * is already true, as it always is for the owner. Effect forms and fiber
   * ownership match `ctx.slots.inject`.
   * @param action - endpoint action the guarded effects depend on.
   * @param callback - creates one disposer or an iterable of disposers.
   * @returns idempotent disposer for the observation and any installed effects.
   */
  whenAccess(action: RemoteEndpoint, callback: () => AccessEffect): () => void
  /**
   * {@link whenAccess} for one resource of a declared kind. Only the package
   * that owns a resource kind calls it, to build that kind's `whenAccess`, as
   * it builds the kind's access Hook over {@link source}.
   * @param kind - resource kind declared in `TypertResourceMap`.
   * @param id - resource identity.
   * @param action - endpoint action the guarded effects depend on.
   * @param callback - creates one disposer or an iterable of disposers.
   * @returns idempotent disposer for the observation and any installed effects.
   */
  whenResourceAccess(kind: TypertResourceKind, id: string, action: RemoteEndpoint, callback: () => AccessEffect): () => void
}

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Client access answers for the calling Peer. */
    remoteAccess: ClientRemoteAccess
  }
}

declare module '@qilin-agent/client-ui-slots' {
  interface GlobalStandardProps {
    /** Whether the current Peer may call `action` on the global resource. */
    useRemoteAccess: (action: RemoteEndpoint) => boolean
  }
}
