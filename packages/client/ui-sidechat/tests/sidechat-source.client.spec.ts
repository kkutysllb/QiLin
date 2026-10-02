/**
 * The panel's state source: snapshot stability, the phase gate, selection,
 * transcript replace and append with tail dedupe, and the busy flag.
 */
import { describe, expect, it, vi } from 'vitest'
import { row, sid } from './fixtures.client.ts'
import { createSidechatSource } from '../src/client/sidechat-source.ts'

describe('sidechat source', () => {
  it('keeps the snapshot reference stable between changes and notifies subscribers', () => {
    const source = createSidechatSource()
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    const before = source.getSnapshot()
    source.setThreads([row()])
    expect(source.getSnapshot()).not.toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    source.setThreads([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('gates the phase: loading only from idle or failed, failed always', () => {
    const source = createSidechatSource()
    source.setPhase('loading')
    expect(source.getSnapshot().phase).toBe('loading')
    source.setThreads([row()])
    source.setPhase('loading')
    expect(source.getSnapshot().phase).toBe('ready')
    source.setPhase('failed')
    expect(source.getSnapshot().phase).toBe('failed')
    source.setPhase('loading')
    expect(source.getSnapshot().phase).toBe('loading')
  })

  it('selects, replaces, and appends transcript entries with tail dedupe', () => {
    const source = createSidechatSource()
    const threadId = sid('session-t')
    source.select(threadId)
    expect(source.getSnapshot().selectedId).toBe(threadId)
    source.select(threadId)
    source.resetEntries(threadId, [{ seq: 1, kind: 'boundary', text: 'b' }])
    source.appendEntry(threadId, { seq: 2, kind: 'assistant', text: 'a' })
    source.appendEntry(threadId, { seq: 2, kind: 'assistant', text: 'a' })
    source.appendEntry(threadId, { seq: 1, kind: 'user', text: 'late' })
    expect(source.getSnapshot().entries[threadId]).toEqual([
      { seq: 1, kind: 'boundary', text: 'b' },
      { seq: 2, kind: 'assistant', text: 'a' },
    ])
  })

  it('tracks the busy flag without duplicate publishes', () => {
    const source = createSidechatSource()
    const listener = vi.fn()
    source.subscribe(listener)
    source.setBusy(true)
    source.setBusy(true)
    source.setBusy(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().busy).toBe(false)
  })
})
