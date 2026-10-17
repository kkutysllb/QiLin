/**
 * Durable request-route lookup for one open model step: the log positions the
 * function walks (the last matching `step/start`, any closing event after it,
 * and the newest `request/header` snapshot) are driven here through real
 * session logs.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import SessionStore, { SessionId } from '@qilin-agent/session'
import type { Session, SessionEvent } from '@qilin-agent/session'
import { providerForOpenStep } from '../src/history.ts'

const CALL_CONFIG = { provider: 'mock', model: 'mock' }

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

/** A real session whose log is built by `append`, returned as its event list. */
async function logged(id: string, append: (session: Session) => void): Promise<readonly SessionEvent[]> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  context = ctx
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd: process.cwd() } })
  append(session)
  return session.snapshotEvents()
}

describe('providerForOpenStep', () => {
  it('reports the provider of the newest request header while the step stays open', async () => {
    const events = await logged('route-open', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
      session.append('step/start', { turn: 1, step: 1 })
    })

    expect(providerForOpenStep(events, 1, 1)).toBe('mock')
  })

  it('prefers a header snapshot logged after the step opened', async () => {
    const events = await logged('route-changed', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('request/header', {
        header: { config: { provider: 'other', model: 'mock' } },
        reason: 'change',
      })
    })

    expect(providerForOpenStep(events, 1, 1)).toBe('other')
  })

  it('answers only for the open instance of a turn and step number', async () => {
    const events = await logged('route-closed-earlier', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('step/end', { turn: 1, step: 1 })
      session.append('step/start', { turn: 1, step: 2 })
      session.append('step/end', { turn: 1, step: 2 })
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      session.append('turn/start', { turn: 2 })
      session.append('step/start', { turn: 2, step: 1 })
    })

    expect(providerForOpenStep(events, 2, 1)).toBe('mock')
    expect(providerForOpenStep(events, 1, 1)).toBeUndefined()
    expect(providerForOpenStep(events, 1, 2)).toBeUndefined()
  })

  it('reports nothing once the step it names has ended', async () => {
    const events = await logged('route-step-ended', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('step/end', { turn: 1, step: 1 })
    })

    expect(providerForOpenStep(events, 1, 1)).toBeUndefined()
  })

  it('reports nothing when the turn ended without closing its step', async () => {
    const events = await logged('route-turn-ended', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('turn/end', { turn: 1, reason: { kind: 'blocked' } })
    })

    expect(providerForOpenStep(events, 1, 1)).toBeUndefined()
  })

  it('reports nothing for a step that never opened in the logged turns', async () => {
    const events = await logged('route-absent', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('request/header', { header: { config: CALL_CONFIG }, reason: 'initial' })
    })

    expect(providerForOpenStep(events, 1, 1)).toBeUndefined()
    expect(providerForOpenStep(events, 2, 1)).toBeUndefined()
  })

  it('reports nothing when no request header was ever logged', async () => {
    const events = await logged('route-headerless', (session) => {
      session.append('turn/start', { turn: 1 })
      session.append('step/start', { turn: 1, step: 1 })
    })

    expect(providerForOpenStep(events, 1, 1)).toBeUndefined()
  })
})
