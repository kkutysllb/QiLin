/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the session store, the SQLite query backend, the
 * connection fetch registry, and the usage-local row, and every assertion
 * observes the served HTTP surface — the windowed answer derived from live
 * session logs, the whole-ledger totals, and the refusal a malformed window owes.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, FiberState } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import { MessageId } from '@qilin-agent/llm'
import type { SessionEvent } from '@qilin-agent/session/types'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SessionQuerySqlite from '@qilin-agent/session-query-sqlite'
import * as Connection from '@qilin-agent/client-connection'
import type { HostConnectionService } from '@qilin-agent/client-connection'
import LocalCredentials from '@qilin-agent/credentials-local'
import * as UsageLocal from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 })
})

interface Booted {
  readonly ctx: Context
  /** Issue one request against the shared /api channel. */
  (path: string, init?: RequestInit): Promise<Response>
}

async function boot(): Promise<Booted> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-usage-local-'))
  roots.push(root)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qilin-agent/credentials-local'",
    '  config:',
    `    path: '${join(root, 'credentials.yaml')}'`,
    '    watch: false',
    "- name: '@qilin-agent/session'",
    "- name: '@qilin-agent/session-query-sqlite'",
    '  config:',
    "    path: ':memory:'",
    '    openAt: never',
    "- name: '@qilin-agent/client-connection'",
    '- id: usage-local',
    "  name: '@qilin-agent/usage-local'",
    '',
  ].join('\n'))

  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qilin-agent/session', SessionStore],
    ['@qilin-agent/session-query-sqlite', SessionQuerySqlite],
    ['@qilin-agent/client-connection', Connection],
    ['@qilin-agent/credentials-local', LocalCredentials],
    ['@qilin-agent/usage-local', UsageLocal],
  ])
  const unused = (): never => { throw new Error('this spec reaches the loader through import() only') }
  const internal: NonNullable<typeof ctx.loader.internal> = {
    version: 'v2',
    loadCache: new Map(),
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
    register: unused,
    getOrCreateModuleJob: async () => unused(),
    resolveSync: unused,
    load: async () => unused(),
  }
  ctx.loader.internal = internal
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const failed = [...ctx.loader.entries()]
    .filter(entry => !entry.disabled && entry.fiber?.state !== FiberState.ACTIVE)
    .map(entry => entry.options.name)
  if (failed.length > 0) throw new Error(`usage-local surface fixture: rows not active: ${failed.join('; ')}`)
  const connection = ctx.get('connection') as HostConnectionService
  const shared = connection.createSharedFetchHandler('/api')
  return Object.assign((path: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers)
    headers.set('host', '127.0.0.1:3080')
    return shared.fetch(new Request(`http://127.0.0.1:3080${path}`, { ...init, headers }), connection.browserPeer)
  }, { ctx })
}

const DEMO_MESSAGE: SessionEvent<'assistant/message'>['data'] = {
  turn: 1,
  step: 1,
  stream: [{
    type: 'chunk',
    time: Date.now(),
    chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 170, cacheReadTokens: 50 } },
  }],
  message: {
    id: MessageId('message-1'),
    role: 'assistant',
    content: [{ type: 'text', text: 'done' }],
    source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
  },
}

describe('GET /api/usage/me served from local session logs', () => {
  it('derives the answer from live session logs and skips unprovable Turns', async () => {
    const api = await boot()
    const session = api.ctx.sessions.create(SessionId('usage-demo'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', DEMO_MESSAGE, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    // A second session whose only Turn never completes proves nothing, so the
    // ledger skips it entirely.
    const empty = api.ctx.sessions.create(SessionId('usage-empty'))
    empty.append('turn/start', { turn: 1 })

    const response = await api('/api/usage/me?from=0')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const answer = await response.json() as {
      accountId: string
      total: { sessions: number; turns: number; inputTokens: number; cacheHitRate: number }
      records: readonly { sessionId: string; turn: number; inputTokens: number; at: number }[]
      truncated: boolean
    }
    expect(answer.accountId).toBe('local')
    expect(answer.truncated).toBe(false)
    expect(answer.records).toHaveLength(1)
    expect(answer.records[0]).toMatchObject({ sessionId: 'usage-demo', turn: 1, inputTokens: 100 })
    expect(answer.total).toMatchObject({ sessions: 1, turns: 1, inputTokens: 100, cacheReadTokens: 50 })
  })

  it('answers the whole ledger when the read carries no window', async () => {
    const api = await boot()
    const session = api.ctx.sessions.create(SessionId('usage-narrow'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    const narrowMessage: SessionEvent<'assistant/message'>['data'] = {
      ...DEMO_MESSAGE,
      stream: [{
        type: 'chunk',
        time: Date.now(),
        chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
      }],
    }
    session.append('assistant/message', narrowMessage, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const response = await api('/api/usage/me')
    expect(response.status).toBe(200)
    const answer = await response.json() as { total: { turns: number; inputTokens: number }; records: unknown[] }
    expect(answer.total).toMatchObject({ turns: 1, inputTokens: 7 })
    expect(answer.records).toHaveLength(1)
  })

  it('refuses a malformed window with the typed error', async () => {
    const api = await boot()
    const response = await api('/api/usage/me?from=not-a-number')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'invalid-window' } })
  })
})
