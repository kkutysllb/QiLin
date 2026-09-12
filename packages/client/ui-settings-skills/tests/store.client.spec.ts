import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SkillEntry } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import { SkillsStore } from '../src/client/store.ts'

/** One answer the fake Remote hands back. */
type Answer = { ok: true; value: { skills: readonly SkillEntry[] } } | { ok: false; error: { code: string; message: string } }

const session = 'session-1' as SessionId

function skill(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    name: 'fixture-skill',
    description: 'a fixture skill',
    modelInvocable: true,
    source: 'project-agents',
    provider: 'filesystem',
    ...overrides,
  }
}

function bench(list?: (request: { sessionId: string }, signal?: AbortSignal) => Promise<Answer>) {
  const fallback = async (): Promise<Answer> => ({ ok: true, value: { skills: [skill()] } })
  const skills = { list: vi.fn(list ?? fallback) }
  const ctx = { remote: { skills } } as unknown as ClientContext
  return { store: new SkillsStore(ctx), skills }
}

describe('SkillsStore', () => {
  it('publishes the answered catalog for the addressed Session', async () => {
    const { store } = bench(async () => ({ ok: true, value: { skills: [skill({ name: 'alpha' })] } }))
    await store.load(session)
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      error: null,
      sessionId: session,
      skills: [{ name: 'alpha' }],
    })
  })

  it('clears the page without a call when no Session is open', async () => {
    const { store, skills } = bench()
    await store.load(session)
    expect(await store.load(undefined)).toBe(true)
    expect(skills.list).toHaveBeenCalledTimes(1)
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', sessionId: null, skills: [] })
  })

  it('reports a failed read and stays ready', async () => {
    const { store } = bench(async () => ({ ok: false, error: { code: 'gateway/internal', message: 'the catalog is unreadable' } }))
    await store.load(session)
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: 'the catalog is unreadable' })
  })

  it('reports a thrown read', async () => {
    const { store } = bench(async () => { throw new Error('offline') })
    await store.load(session)
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: 'offline' })
  })

  it('reports a non-Error rejection as text', async () => {
    const { store } = bench(async () => { throw 'plain' })
    await store.load(session)
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: 'plain' })
  })

  it('keeps the last rows while a refresh is in flight', async () => {
    let release: ((answer: Answer) => void) | undefined
    const pending = new Promise<Answer>((resolve) => { release = resolve })
    const { store } = bench(async () => await pending)
    const first = store.load(session)
    expect(store.store.getSnapshot().status).toBe('loading')
    release?.({ ok: true, value: { skills: [skill({ name: 'settled' })] } })
    await first
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', skills: [{ name: 'settled' }] })
  })

  it('discards an answer a newer read superseded', async () => {
    const answers: Array<(answer: Answer) => void> = []
    const { store } = bench(async () => await new Promise<Answer>((resolve) => { answers.push(resolve) }))
    const stale = store.load(session)
    const fresh = store.load(session)
    answers[0]?.({ ok: true, value: { skills: [skill({ name: 'stale' })] } })
    answers[1]?.({ ok: true, value: { skills: [skill({ name: 'fresh' })] } })
    expect(await stale).toBe(false)
    expect(await fresh).toBe(true)
    expect(store.store.getSnapshot()).toMatchObject({ skills: [{ name: 'fresh' }] })
  })

  it('supersedes an in-flight read when the Session closes', async () => {
    const answers: Array<(answer: Answer) => void> = []
    const { store } = bench(async () => await new Promise<Answer>((resolve) => { answers.push(resolve) }))
    const pending = store.load(session)
    await store.load(undefined)
    answers[0]?.({ ok: true, value: { skills: [skill()] } })
    expect(await pending).toBe(false)
    expect(store.store.getSnapshot()).toMatchObject({ sessionId: null, skills: [] })
  })

  it('discards a rejection a newer read superseded', async () => {
    const answers: Array<{ resolve: (answer: Answer) => void; reject: (error: unknown) => void }> = []
    const { store } = bench(async () => await new Promise<Answer>((resolve, reject) => { answers.push({ resolve, reject }) }))
    const stale = store.load(session)
    const fresh = store.load(session)
    answers[0]?.reject(new Error('stale rejection'))
    answers[1]?.resolve({ ok: true, value: { skills: [] } })
    expect(await stale).toBe(false)
    expect(await fresh).toBe(true)
    expect(store.store.getSnapshot().error).toBeNull()
  })

  it('discards a superseded failure', async () => {
    const answers: Array<(answer: Answer) => void> = []
    const { store } = bench(async () => await new Promise<Answer>((resolve) => { answers.push(resolve) }))
    const stale = store.load(session)
    const fresh = store.load(session)
    answers[0]?.({ ok: false, error: { code: 'gateway/internal', message: 'stale failure' } })
    answers[1]?.({ ok: true, value: { skills: [] } })
    expect(await stale).toBe(false)
    expect(await fresh).toBe(true)
    expect(store.store.getSnapshot().error).toBeNull()
  })
})
