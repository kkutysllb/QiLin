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

  it('reads only text parts and ignores events no transcript draws', () => {
    // A content array holding no text part, a hole in the array, and a text
    // part whose text is not a string all contribute nothing.
    expect(transcriptEntryOf({
      type: 'event',
      event: {
        type: 'user/message', seq: 8, time: 8,
        data: { content: [{ type: 'image' }, undefined, { type: 'text', text: 7 }] } as never,
      },
    })).toBeUndefined()
    // A message event the panel does not draw.
    expect(transcriptEntryOf({
      type: 'event',
      event: { type: 'tool/message', seq: 9, time: 9, data: { content: [{ type: 'text', text: 'tool output' }] } },
    })).toBeUndefined()
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
    // A committed frame carrying an event the panel does not draw adds nothing.
    expect(transcriptEntriesOfFrame({
      type: 'event',
      event: { type: 'turn/start', seq: 4, time: 4, data: { turn: 1 } },
    })).toEqual([])
    expect(transcriptEntriesOfFrame({ type: 'assistant-stream', frame: {
      type: 'start', attemptId: 'a' as never, revision: 0, startedAfterSeq: 0 as never, turn: 1, step: 1,
    } })).toEqual([])
  })
})
