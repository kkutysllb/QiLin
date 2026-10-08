/**
 * Hand-built wire facts the sidechat specs share: Session ids, thread rows,
 * message events, and a scriptable fake of the Session Remote slice.
 */
import type { SessionId } from '@qilin-agent/session'
import { streamHandle } from '@qilin-agent/remote-mock'
import type {
  SessionEventEntry,
  SessionFollowFrame,
  SessionFollowRequest,
  SidechatThreadRow,
} from '@qilin-agent/api-session-controller/types'
import type { SidechatRemote } from '../src/client/face.ts'

/** Brand one plain string as a Session id. */
export function sid(id: string): SessionId {
  return id as SessionId
}

/** The panel's parent Session in every spec. */
export const PARENT = sid('session-sidechat-parent')

/** One roster row. */
export function row(overrides: Partial<SidechatThreadRow> = {}): SidechatThreadRow {
  return {
    id: sid('session-sidechat-thread'),
    createdAt: 1,
    label: 'Side: hello there',
    live: false,
    running: false,
    ...overrides,
  }
}

/** One message event record with one text part. */
export function messageEvent(type: 'user/message' | 'assistant/message', seq: number, text: string, boundary = false): SessionEventEntry {
  return {
    type: 'event',
    event: {
      type,
      seq,
      time: seq,
      data: {
        content: [{ type: 'text', text }],
        ...(type === 'user/message' && boundary ? { source: { kind: 'sidechat-boundary' } } : {}),
      },
    },
  }
}

/** The opening snapshot frame carrying the given records. */
export function snapshotFrame(records: readonly SessionEventEntry[]): SessionFollowFrame {
  return { type: 'snapshot', header: {
    version: 3, id: sid('session-sidechat-thread'), createdAt: 1, isSeeded: false,
  }, cursor: 0, records, hasMore: false, projections: { asOfSeq: 0, values: {} } }
}

/**
 * A fake follow stream: yields the scripted frames, then parks until aborted,
 * mirroring the live stream's open-ended shape.
 * @param frames - the frames to deliver.
 * @returns the follow method.
 */
export function scriptedFollow(frames: readonly SessionFollowFrame[]): SidechatRemote['follow'] {
  return (_request: SessionFollowRequest, signal?: AbortSignal) => streamHandle((async function* () {
    for (const frame of frames) {
      if (signal?.aborted) return
      yield frame
    }
    await new Promise<void>((resolve) => {
      if (signal?.aborted === true) resolve()
      else signal?.addEventListener('abort', () => { resolve() })
    })
  })())
}

/** A Remote result. */
export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

/**
 * A fake SidechatRemote over scripted rows and follow frames.
 * @param overrides - per-method replacements.
 * @returns the fake with call recordings.
 */
export function fakeRemote(overrides: Partial<SidechatRemote> = {}): SidechatRemote & {
  started: number
  prompted: number
  released: number
  cancelled: number
} {
  const remote = {
    started: 0,
    prompted: 0,
    released: 0,
    cancelled: 0,
    async sidechatStart() {
      remote.started += 1
      return ok({ threadId: sid('session-sidechat-new') })
    },
    async sidechatPrompt() {
      remote.prompted += 1
      return ok({ accepted: true as const, modelFollow: { ok: true as const, provider: 'mock', model: 'mock' } })
    },
    async sidechatCancel() {
      remote.cancelled += 1
      return ok({ accepted: true as const })
    },
    async sidechatSnapshot() {
      return ok({ info: { sessionId: PARENT, label: 'Side: x', live: false, running: false }, records: [], hasMore: false })
    },
    async sidechatRelease() {
      remote.released += 1
      return ok({ accepted: true as const })
    },
    async sidechatThreads() {
      return ok({ threads: [row()] })
    },
    follow: scriptedFollow([snapshotFrame([
      messageEvent('user/message', 1, 'What is a sidechat thread?', true),
      messageEvent('assistant/message', 2, 'A fork of this session.'),
    ])]),
    ...overrides,
  }
  return remote
}
