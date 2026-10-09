/**
 * A cold list whose build time crosses its work slice yields to the event loop
 * between records: past the session-count threshold, the first pull after a
 * cold start must still serve every visible session.
 *
 * The yield branch runs only when accumulated work exceeds the slice, so the
 * spec sizes the listing far above one slice at the minimum budget and pins the
 * explicit `node:timers/promises` scheduler import the branch depends on.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@qilin/kylin'
import SessionStore, { SESSION_FORMAT_VERSION } from '@qilin/session'
import type { SessionHeader, SessionId } from '@qilin/session'
import { createSessionTestRemote, testSessionPersistence } from './test-remote.ts'

/** Cold rows the listing must summarize; each loop pass costs well under the 1 ms slice. */
const COLD_SESSION_COUNT = 20_000

function header(id: string, createdAt: number): SessionHeader {
  return { version: SESSION_FORMAT_VERSION, id: id as SessionId, createdAt, isSeeded: false, cwd: '/proj' }
}

describe('cold list crossing its work slice', () => {
  it('yields between records and still serves every cold summary', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const metas = Array.from(
      { length: COLD_SESSION_COUNT },
      (_value, index) => header(`session-yield-${String(index)}`, index + 1),
    )
    ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
      list: () => Promise.resolve(metas),
    }) as never)
    const remote = createSessionTestRemote(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/tmp',
      listWorkSliceMs: 1,
    })

    const listed = await remote.list({})

    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    expect(listed.value.items).toHaveLength(COLD_SESSION_COUNT)
    expect(listed.value.items.every(item => item.sessionId.startsWith('session-yield-'))).toBe(true)
  })
})
