/**
 * The sidechat panel's business face: the six Session Controller sidechat
 * remotes plus the follow stream, bound to one state source. The panel reads
 * everything through the source and acts only through these actions.
 */
import type { ClientRemote } from '@qilin-agent/api-remotes/client'
import type { SessionId } from '@qilin-agent/session'
import { sidechatAddress, transcriptEntriesOfFrame } from './sidechat-model.ts'
import type { SidechatSource } from './sidechat-source.ts'

/**
 * The Session Remote slice this panel reads and drives, exactly as the Host's
 * generated client declares it.
 */
export type SidechatRemote = Pick<
  ClientRemote['session'],
  'sidechatStart' | 'sidechatPrompt' | 'sidechatCancel' | 'sidechatSnapshot' | 'sidechatRelease' | 'sidechatThreads' | 'follow'
>

/** The panel's injected face, as the body receives it. */
export interface SidechatInjected {
  hooks: {
    /** The panel's state source, bound by the renderer as `useSidechat`. */
    sidechat: SidechatSource
  }
  /**
   * Re-read the parent's thread roster.
   * @param parentSessionId - the Session the panel is open on.
   */
  refresh(parentSessionId: SessionId): Promise<void>
  /**
   * Fork one new thread off the parent and open it.
   * @param parentSessionId - the Session to fork from.
   * @param question - optional first question, delivered with the boundary.
   */
  start(parentSessionId: SessionId, question?: string): Promise<void>
  /**
   * Deliver one follow-up message to a thread.
   * @param parentSessionId - the Session the panel is open on.
   * @param threadId - the thread to prompt.
   * @param text - the message text.
   * @returns whether the Host accepted the prompt.
   */
  send(parentSessionId: SessionId, threadId: SessionId, text: string): Promise<boolean>
  /**
   * Cancel a thread's running turn.
   * @param threadId - the thread whose turn is cancelled.
   * @returns whether the Host accepted the cancel.
   */
  cancel(threadId: SessionId): Promise<boolean>
  /**
   * Release a thread's live Agent and refresh the roster.
   * @param parentSessionId - the Session the panel is open on.
   * @param threadId - the thread to release.
   */
  release(parentSessionId: SessionId, threadId: SessionId): Promise<void>
  /**
   * Open one thread's transcript: replay its own events and follow the live
   * log. Opening a second thread closes the first subscription.
   * @param parentSessionId - the Session the panel is open on.
   * @param threadId - the thread to follow.
   * @returns the stop function.
   */
  openTranscript(parentSessionId: SessionId, threadId: SessionId): () => void
}

/**
 * Bind the sidechat remotes to one state source.
 * @param source - the panel's state source.
 * @param remote - the Session Remote slice.
 * @returns the injected face.
 */
export function sidechatFace(source: SidechatSource, remote: SidechatRemote): SidechatInjected {
  let activeStop: (() => void) | undefined

  const refresh = async (parentSessionId: SessionId): Promise<void> => {
    source.setPhase('loading')
    const rows = await remote.sidechatThreads({ sessionId: parentSessionId })
    if (rows.ok) source.setThreads(rows.value.threads)
    else source.setPhase('failed')
  }

  const openTranscript = (parentSessionId: SessionId, threadId: SessionId): (() => void) => {
    activeStop?.()
    const controller = new AbortController()
    activeStop = () => { controller.abort() }
    source.select(threadId)
    source.resetEntries(threadId, [])
    void (async () => {
      try {
        for await (const frame of remote.follow(
          { address: sidechatAddress(parentSessionId, threadId), assistantStream: true },
          controller.signal,
        )) {
          if (controller.signal.aborted) return
          const entries = transcriptEntriesOfFrame(frame)
          if (frame.type === 'snapshot') source.resetEntries(threadId, entries)
          else for (const entry of entries) source.appendEntry(threadId, entry)
        }
      } catch {
        // A carrier failure keeps the transcript at its last cut; the next
        // open replays from the snapshot again.
      }
    })()
    return () => { controller.abort() }
  }

  return {
    hooks: { sidechat: source },
    refresh,
    start: async (parentSessionId, question) => {
      source.setBusy(true)
      try {
        const started = await remote.sidechatStart(
          question === undefined ? { sessionId: parentSessionId } : { sessionId: parentSessionId, question },
        )
        if (!started.ok) return
        await refresh(parentSessionId)
        openTranscript(parentSessionId, started.value.threadId)
      } finally {
        source.setBusy(false)
      }
    },
    send: async (parentSessionId, threadId, text) => {
      source.setBusy(true)
      try {
        const prompted = await remote.sidechatPrompt({ sessionId: threadId, text })
        if (!prompted.ok) return false
        await refresh(parentSessionId)
        return prompted.value.accepted
      } finally {
        source.setBusy(false)
      }
    },
    cancel: async (threadId) => {
      const cancelled = await remote.sidechatCancel({ sessionId: threadId })
      return cancelled.ok
    },
    release: async (parentSessionId, threadId) => {
      await remote.sidechatRelease({ sessionId: threadId })
      await refresh(parentSessionId)
    },
    openTranscript,
  }
}
