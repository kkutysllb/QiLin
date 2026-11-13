/**
 * The Team page's write-outcome state.
 *
 * The seat declares this store as exclusive on the session-scoped tab slot,
 * so the framework mints one instance per Session: the state is exactly one
 * page's "is a write in flight" and "what the last settled write reported".
 * The write face performs every mutation and records each outcome here; the
 * body only reads.
 */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'

/** What one settled write reported. */
export type TeamNotice =
  | { readonly kind: 'conflict' }
  | { readonly kind: 'rejected'; readonly message: string }

/** One page's write-outcome state. */
export interface TeamPageState {
  /** Whether one write is in flight; the face starts no second write meanwhile. */
  busy: boolean
  /** The last settled write's outcome; absent while nothing is reported. */
  notice: TeamNotice | undefined
}

/** The store's write set. */
type TeamPageActions = {
  busy: (draft: TeamPageState) => void
  settled: (draft: TeamPageState) => void
  conflict: (draft: TeamPageState) => void
  rejected: (draft: TeamPageState, message: string) => void
  cleared: (draft: TeamPageState) => void
}

/**
 * Declare the Team page's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per Session.
 * @returns the store handle to declare on the registration.
 */
export function createTeamPageStore(): EngineStoreHandle<TeamPageState, TeamPageActions> {
  return defineStore({
    init: (): TeamPageState => ({ busy: false, notice: undefined }),
    actions: {
      /**
       * Record that one write is in flight and clear the standing notice.
       * @param d - draft state.
       */
      busy: (d) => {
        d.busy = true
        d.notice = undefined
      },
      /**
       * Record that the in-flight write committed; the projection updates the board.
       * @param d - draft state.
       */
      settled: (d) => {
        d.busy = false
        d.notice = undefined
      },
      /**
       * Record a refused compare-and-set; the face refreshed the projections.
       * @param d - draft state.
       */
      conflict: (d) => {
        d.busy = false
        d.notice = { kind: 'conflict' }
      },
      /**
       * Record a rejected write with its human diagnostic.
       * @param d - draft state.
       * @param message - the wire failure's message, for people.
       */
      rejected: (d, message: string) => {
        d.busy = false
        d.notice = { kind: 'rejected', message }
      },
      /**
       * Dismiss the standing notice; the next write records its own.
       * @param d - draft state.
       */
      cleared: (d) => {
        d.notice = undefined
      },
    },
  })
}
