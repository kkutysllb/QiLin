/**
 * The descendant projection, as the section header and the chip badge read it:
 * who counts as a subagent, how far up a chain one descendant credits, and the
 * guard that makes a cyclic parent an ordinary stop.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@qilin/session/types'
import { indexSubagentDescendants } from '../src/client/lineage.ts'

const sid = (value: string): SessionId => value as SessionId

/** One subagent summary row, with the durable parent link when it has one. */
function subagent(value: string, parent?: string, running = false) {
  return {
    id: sid(value),
    ...(parent === undefined ? {} : { parentId: sid(parent) }),
    origin: 'subagent' as const,
    running,
  }
}

describe('indexSubagentDescendants', () => {
  it('indexes nothing when no summary is a subagent', () => {
    expect(indexSubagentDescendants({}).size).toBe(0)
    expect(indexSubagentDescendants({
      [sid('root')]: { id: sid('root'), parentId: sid('outer'), running: true },
    }).size).toBe(0)
  })

  it('indexes nothing for a subagent with no parent link', () => {
    expect(indexSubagentDescendants({ [sid('a')]: subagent('a') }).size).toBe(0)
  })

  it('credits every ancestor on the chain once per descendant', () => {
    const indexed = indexSubagentDescendants({
      [sid('root')]: { id: sid('root'), running: false },
      [sid('child')]: subagent('child', 'root', true),
      [sid('grand')]: subagent('grand', 'child'),
    })
    expect(indexed.get(sid('root'))).toEqual({ count: 2, runningCount: 1 })
    expect(indexed.get(sid('child'))).toEqual({ count: 1, runningCount: 0 })
    expect(indexed.get(sid('grand'))).toBeUndefined()
  })

  it('stops at a parent the summaries do not carry', () => {
    const indexed = indexSubagentDescendants({ [sid('child')]: subagent('child', 'ghost') })
    expect(indexed.get(sid('ghost'))).toEqual({ count: 1, runningCount: 0 })
  })

  it('stops the walk when a chain returns to a row it already credited', () => {
    const indexed = indexSubagentDescendants({
      [sid('a')]: subagent('a', 'b', true),
      [sid('b')]: subagent('b', 'a'),
    })
    // Both rows sit under each ancestor of the cycle, and exactly one of them runs:
    // the seen set stops the walk, so a row is credited once per ancestor.
    expect(indexed.get(sid('a'))).toEqual({ count: 2, runningCount: 1 })
    expect(indexed.get(sid('b'))).toEqual({ count: 2, runningCount: 1 })
  })
})
