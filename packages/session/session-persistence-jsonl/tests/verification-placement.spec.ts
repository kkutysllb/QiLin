/**
 * The browser worker host replaces `node:worker_threads` with a stub whose
 * `Worker` refuses, so the default isolated verifier cannot publish a migrated
 * generation there. `verification: 'inline'` is that deployment's setting; this
 * exercises both placements against a refusing `Worker` and asserts the inline
 * one still refuses a corrupt generation.
 */
import { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session'
import JsonlSessionPersistence from '@qilin-agent/session-persistence-jsonl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { scheduler } from 'node:timers/promises'
import { generationLogPath } from '../src/format.ts'

const WORKER_REFUSAL = 'web-preview: node:worker_threads.Worker is not available in the worker host'

vi.mock('node:worker_threads', async importActual => ({
  ...await importActual<typeof import('node:worker_threads')>(),
  // Stands in for the worker host's stub: constructing a Worker throws before any worker exists.
  Worker: function refusingWorker(): never {
    throw new Error(WORKER_REFUSAL)
  },
}))

const id = SessionId('inline-placement')
const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** Seed one historical v3 generation whose interrupted turn needs a current successor. */
async function v3Fixture(): Promise<{ readonly root: string; readonly path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-inline-placement-'))
  roots.push(root)
  const path = generationLogPath(root, undefined, id, 3, 'none')
  const rows = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((event, seq) => ({ ...event, seq, time: seq + 10 }))
  const header = { type: 'session', version: 3, id, createdAt: 1, isSeeded: false, delegationDepth: 0 }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, [header, ...rows].map(row => `${JSON.stringify(row)}\n`).join(''))
  return { root, path }
}

async function mount(root: string, verification?: 'inline'): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, {
    root,
    compression: 'none',
    ...(verification === undefined ? {} : { verification }),
  })
  return ctx
}

describe('full-generation verification placement', () => {
  it('publishes the migrated successor with inline verification where Worker refuses', async () => {
    const f = await v3Fixture()
    const ctx = await mount(f.root, 'inline')

    const writer = await ctx.sessionPersistence.open(id, 'write')
    try {
      expect(writer.header.version).toBe(4)
      expect((await writer.read()).events).toHaveLength(4)
    } finally {
      await writer.close()
    }
    expect((await readdir(dirname(f.path))).filter(name => name !== 'session.lock').sort())
      .toEqual(['session.v3.jsonl', 'session.v4.jsonl'])
  })

  it('refuses a corrupt staged generation on the inline path', async () => {
    const f = await v3Fixture()
    const ctx = await mount(f.root, 'inline')
    const prepared = await ctx.sessionPersistence.open(id, 'read')
    await prepared.close()
    const successor = generationLogPath(f.root, undefined, id, 4, 'none')
    // Between the prepared read and the write open, a competing current
    // generation appears whose bytes cannot decode: publish must verify it and
    // refuse rather than adopt it.
    const yieldSpy = vi.spyOn(scheduler, 'yield').mockImplementationOnce(async () => {
      await writeFile(successor, 'not a session log\n')
    })
    try {
      await expect(ctx.sessionPersistence.open(id, 'write')).rejects.toThrow(/stored log is corrupt/)
      expect(yieldSpy).toHaveBeenCalled()
    } finally {
      yieldSpy.mockRestore()
    }
    expect(await readFile(successor, 'utf8')).toBe('not a session log\n')
  })

  it('refuses the same publication under the default isolated placement', async () => {
    const f = await v3Fixture()
    const ctx = await mount(f.root)

    await expect(ctx.sessionPersistence.open(id, 'write')).rejects.toThrow(WORKER_REFUSAL)
  })
})
