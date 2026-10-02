/**
 * The pure sidechat view model: the follow address, the transcript fold over
 * durable events, and the follow-frame fold.
 */
import { describe, expect, it } from 'vitest'
import { messageEvent, sid, snapshotFrame } from './fixtures.client.ts'
import { sidechatAddress, transcriptEntriesOfFrame, transcriptEntryOf } from '../src/client/sidechat-model.ts'

describe('sidechat view model', () => {
  it('addresses every thread as a continuable child of its parent', () => {
    expect(sidechatAddress(sid('session-p'), sid('session-c'))).toEqual({
      kind: 'subagent', parentSessionId: sid('session-p'), childSessionId: sid('session-c'), mode: 'continuable',
    })
  })

  it('folds user, boundary, and assistant messages, and skips other events', () => {
    expect(transcriptEntryOf(messageEvent('user/message', 3, 'hello'))).toEqual({ seq: 3, kind: 'user', text: 'hello' })
    expect(transcriptEntryOf(messageEvent('user/message', 4, 'boundary first', true))).toEqual({
      seq: 4, kind: 'boundary', text: 'boundary first',
    })
    expect(transcriptEntryOf(messageEvent('assistant/message', 5, 'answer'))).toEqual({ seq: 5, kind: 'assistant', text: 'answer' })
    expect(transcriptEntryOf({
      type: 'event',
      event: { type: 'turn/start', seq: 6, time: 6, data: { turn: 1 } },
    })).toBeUndefined()
    expect(transcriptEntryOf(messageEvent('user/message', 7, ''))).toBeUndefined()
  })

  it('replays a snapshot wholesale and folds committed frames one entry at a time', () => {
    const snapshot = snapshotFrame([
      messageEvent('user/message', 1, 'q', true),
      messageEvent('assistant/message', 2, 'a'),
    ])
    expect(transcriptEntriesOfFrame(snapshot).map(entry => entry.seq)).toEqual([1, 2])
    expect(transcriptEntriesOfFrame(messageEvent('assistant/message', 3, 'later'))).toEqual([
      { seq: 3, kind: 'assistant', text: 'later' },
    ])
    expect(transcriptEntriesOfFrame({ type: 'assistant-stream', frame: {
      type: 'start', attemptId: 'a' as never, revision: 0, startedAfterSeq: 0 as never, turn: 1, step: 1,
    } })).toEqual([])
  })
})
