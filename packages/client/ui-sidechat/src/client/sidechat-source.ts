/**
 * The sidechat panel's object-layer state source: the thread roster, the
 * open thread's transcript, and the in-flight flags — one bare observable
 * the renderer binds as `useSidechat`. React-free by design; the face in
 * `face.ts` is the only writer.
 */
import type { SessionId } from '@qilin/session'
import type { SidechatThreadRow } from '@qilin/api-session-controller/types'
import type { SidechatTranscriptEntry } from './sidechat-model.ts'

/** How far the roster read has got. */
export type SidechatPhase = 'idle' | 'loading' | 'ready' | 'failed'

/** The panel's state snapshot. */
export interface SidechatState {
  /** The parent's sidechat threads, oldest first. */
  readonly threads: readonly SidechatThreadRow[]
  /** The roster read's phase. */
  readonly phase: SidechatPhase
  /** The thread whose transcript is open. */
  readonly selectedId: SessionId | undefined
  /** One transcript per opened thread, oldest first. */
  readonly entries: Readonly<Record<string, readonly SidechatTranscriptEntry[]>>
  /** Whether a start or send is in flight. */
  readonly busy: boolean
}

/** The initial snapshot: nothing read, nothing open. */
const EMPTY_STATE: SidechatState = {
  threads: [],
  phase: 'idle',
  selectedId: undefined,
  entries: {},
  busy: false,
}

/**
 * One registration-scoped state source. The snapshot reference is stable
 * between changes, so hook bindings observe by identity.
 */
export class SidechatSource {
  private state: SidechatState = EMPTY_STATE
  private readonly listeners = new Set<() => void>()

  /**
   * The current snapshot; the same reference until the next change.
   * @returns the current state object.
   */
  getSnapshot(): SidechatState {
    return this.state
  }

  /**
   * Subscribe to changes.
   * @param listener - called after every published change.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(state: SidechatState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  /**
   * Publish the roster and mark the read complete.
   * @param threads - the parent's thread rows in display order.
   */
  setThreads(threads: readonly SidechatThreadRow[]): void {
    this.publish({ ...this.state, threads, phase: 'ready' })
  }

  /**
   * Mark a roster read as in flight or failed; `loading` only on the first read.
   * @param phase - the roster phase to publish.
   */
  setPhase(phase: SidechatPhase): void {
    if (phase !== 'failed' && this.state.phase !== 'idle' && this.state.phase !== 'failed') return
    this.publish({ ...this.state, phase })
  }

  /**
   * Select the thread whose transcript the panel shows.
   * @param threadId - the thread to select, or undefined to clear.
   */
  select(threadId: SessionId | undefined): void {
    if (this.state.selectedId === threadId) return
    this.publish({ ...this.state, selectedId: threadId })
  }

  /**
   * Replace one thread's transcript with a freshly replayed cut.
   * @param threadId - the thread owning the transcript.
   * @param entries - the replayed entries in log order.
   */
  resetEntries(threadId: SessionId, entries: readonly SidechatTranscriptEntry[]): void {
    this.publish({ ...this.state, entries: { ...this.state.entries, [threadId]: entries } })
  }

  /**
   * Append one committed entry to a thread's transcript.
   * @param threadId - the thread owning the transcript.
   * @param entry - the committed entry to append after the current tail.
   */
  appendEntry(threadId: SessionId, entry: SidechatTranscriptEntry): void {
    const existing = this.state.entries[threadId] ?? []
    const last = existing[existing.length - 1]
    // The follow stream may redeliver the tail after a reconnect.
    if (last !== undefined && last.seq >= entry.seq) return
    this.publish({ ...this.state, entries: { ...this.state.entries, [threadId]: [...existing, entry] } })
  }

  /**
   * Set the in-flight flag for start and send actions.
   * @param busy - whether a start or send is in flight.
   */
  setBusy(busy: boolean): void {
    if (this.state.busy === busy) return
    this.publish({ ...this.state, busy })
  }
}

/**
 * Create one registration-scoped sidechat source.
 * @returns a fresh source with empty state and no listeners.
 */
export function createSidechatSource(): SidechatSource {
  return new SidechatSource()
}
