/** The bundle's plugin row composes with real persistence and Workspace services through the Loader. */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import type { ImageAttachmentRef, SaveImageAttachment } from '@qilin-agent/attachment'
import { AttachmentId } from '@qilin-agent/attachment'
import type { ConnectionFetchRoute } from '@qilin-agent/client-connection'
import * as SessionStore from '@qilin-agent/session'
import { SessionId } from '@qilin-agent/session'
import JsonlPersistence from '@qilin-agent/session-persistence-jsonl'
import * as SessionProjection from '@qilin-agent/session-projection'
import * as SessionProjectionCache from '@qilin-agent/session-projection-cache'
import * as Storage from '@qilin-agent/storage'
import * as StorageDomain from '@qilin-agent/storage-domain'
import * as StorageJson from '@qilin-agent/storage-json'
import * as TypertRegistry from '@qilin-agent/typert-registry'
import * as Workspace from '@qilin-agent/workspace'
import * as DeepseekChatImport from '../src/index.ts'
import { UPLOAD_PATH } from '../src/protocol.ts'
import type { ExportSessionFile } from '../src/format.ts'
import type { DeepseekChatImportLine } from '../src/types.ts'
import type { PeerId, Principal, RemoteInvocation } from '@qilin-agent/typert-protocol'

declare module '@qilin-agent/typert-protocol' {
  interface PrincipalMap {
    /** Test-only non-owner caller shared by the access specs. */
    'test-guest': { readonly kind: 'test-guest'; readonly guest: string }
  }
}

const BASE = Date.UTC(2026, 10, 11, 2, 0, 0)
const at = (ms: number): string => new Date(BASE + ms).toISOString()

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function chat(id: string, leafAt: number): ExportSessionFile {
  return {
    id, title: `title ${id}`, inserted_at: at(0),
    messages: [
      { id: 1, parent_id: null, role: 'USER', status: 'FINISHED', inserted_at: at(leafAt - 1), fragments: [{ type: 'REQUEST', content: `question ${id}` }] },
      { id: 2, parent_id: 1, role: 'ASSISTANT', status: 'FINISHED', inserted_at: at(leafAt), fragments: [{ type: 'RESPONSE', content: `answer ${id}` }] },
    ],
  }
}

/** Boot the plugin rows through the Loader with stand-ins for the Connection route registry and the attachment store. */
async function boot(saveImage: (input: SaveImageAttachment) => Promise<ImageAttachmentRef> = () => Promise.reject(new Error('unused'))) {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-deepseek-import-loader-')))
  const workspacePath = join(root, 'project')
  await mkdir(workspacePath)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qilin-agent/session'",
    "- name: '@qilin-agent/session-persistence-jsonl'",
    '  config:',
    `    root: ${JSON.stringify(join(root, 'sessions'))}`,
    "- name: '@qilin-agent/storage'",
    "- name: '@qilin-agent/storage-json'",
    '  config:',
    `    root: ${JSON.stringify(join(root, 'storage'))}`,
    "- name: '@qilin-agent/storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@qilin-agent/workspace'",
    "- name: '@qilin-agent/session-projection'",
    "- name: '@qilin-agent/session-projection-cache'",
    '  config:',
    '    writeEveryEvents: 1',
    '    writeIntervalMs: 1000',
    "- name: '@qilin-agent/typert-registry'",
    '- id: deepseek-chat-import',
    "  name: '@qilin-agent/experimental-deepseek-chat-import'",
    '  config:',
    '    maxSessions: 1',
    '    maxUploadBytes: 4096',
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  const routes = new Map<string, ConnectionFetchRoute>()
  context.provide('connection', {
    fetch: {
      register: (route: ConnectionFetchRoute) => {
        routes.set(route.path, route)
        return () => { routes.delete(route.path); return Promise.resolve() }
      },
    },
  } as never)
  context.provide('attachments', { saveImage } as never)
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qilin-agent/session', SessionStore],
    ['@qilin-agent/session-persistence-jsonl', JsonlPersistence],
    ['@qilin-agent/storage', Storage],
    ['@qilin-agent/storage-json', StorageJson],
    ['@qilin-agent/storage-domain', StorageDomain],
    ['@qilin-agent/workspace', Workspace],
    ['@qilin-agent/session-projection', SessionProjection],
    ['@qilin-agent/session-projection-cache', SessionProjectionCache],
    ['@qilin-agent/typert-registry', TypertRegistry],
    ['@qilin-agent/experimental-deepseek-chat-import', DeepseekChatImport],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as never
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()

  const ctx = context
  const workspace = await ctx.workspaceRegistry.create(workspacePath)
  const post = (body: Uint8Array): Promise<Response> => {
    const route = routes.get(UPLOAD_PATH)
    if (route === undefined) throw new Error('upload route is not registered')
    return route.fetch(new Request(`http://127.0.0.1${UPLOAD_PATH}?workspaceId=${workspace.id}`, {
      method: 'POST', body: new Uint8Array(body), headers: { 'content-type': 'application/octet-stream' },
    }))
  }
  const importer = [...ctx.loader.entries()].find(entry => entry.options.id === 'deepseek-chat-import')
  return { ctx, routes, workspace, workspacePath, post, importer }
}

const lines = async (response: Response): Promise<DeepseekChatImportLine[]> =>
  (await response.text()).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as DeepseekChatImportLine)

it('imports an uploaded archive through the registered route into a chosen Workspace', async () => {
  const { ctx, routes, workspace, workspacePath, post } = await boot()
  const signal = new AbortController().signal
  const as = (principal: Principal) => ctx.extend({
    invocation: {
      request: { namespace: 'deepseekChatImport', method: 'limits', args: {} },
      service: 'deepseekChatImport',
      peer: { id: 'import-peer' as PeerId, ctx, principal, interactions: 'answer', signal, dispose: async () => {} },
      signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    } satisfies RemoteInvocation,
  }).deepseekChatImport
  expect(ctx.get('deepseekChatImport')?.limits(signal)).toEqual({ maxUploadBytes: 4096 })
  expect(as({ kind: 'owner' }).limits(signal)).toEqual({ maxUploadBytes: 4096 })
  expect(() => as({ kind: 'test-guest', guest: 'viewer' }).limits(signal))
    .toThrow(expect.objectContaining({ code: 'deepseekChatImport/owner-only', message: 'only the owner may import DeepSeek chat exports' }))
  expect(routes.get(UPLOAD_PATH)).toMatchObject({ methods: ['POST'], requestBody: 'streaming' })

  // An unsupported image type exercises the Host log: it stays a placeholder.
  const pictured = chat('new', 2_000)
  pictured.messages[0]!.fragments.unshift({
    type: 'FILE',
    files: [{
      id: 'img', file_name: 'a.bmp', file_size: 1, token_usage: 1, inserted_at: at(0),
      export_path: 'chat_sessions/new_files/a.bmp', is_image: true, width: 1, height: 1,
    }],
  })
  const answer = await lines(await post(zipSync({
    'manifest.json': strToU8('{"export_format_version":3}'),
    'chat_session_index.json': strToU8(JSON.stringify([
      { id: 'new', title: 'title new', pinned: false, inserted_at: at(0), updated_at: at(2_000), message_count: 2 },
      { id: 'old', title: 'title old', pinned: false, inserted_at: at(0), updated_at: at(1_000), message_count: 2 },
    ])),
    'chat_sessions/old.json': strToU8(JSON.stringify(chat('old', 1_000))),
    'chat_sessions/new.json': strToU8(JSON.stringify(pictured)),
    'chat_sessions/broken.json': strToU8('{'),
  })))
  const last = answer.at(-1)
  if (last?.type !== 'outcome' || !last.outcome.ok) throw new Error(`unexpected answer ${JSON.stringify(answer)}`)
  expect(answer.slice(0, -1)).toEqual([{ type: 'progress', done: 0, total: 1 }, { type: 'progress', done: 1, total: 1 }])
  const result = last.outcome.value
  expect(result).toMatchObject({ workspaceId: workspace.id, workspacePath, conversationCount: 2, omittedByLimit: 1, skipped: [] })
  expect(result.sessionIds).toHaveLength(1)
  const sessionId = SessionId(result.sessionIds[0]!)

  const stored = await ctx.sessionPersistence.list()
  expect(stored.map(snapshot => [snapshot.header.id, snapshot.header.cwd, snapshot.header.createdAt]))
    .toEqual([[sessionId, workspacePath, BASE + 1_999]])
  const handle = await ctx.sessionPersistence.open(sessionId, 'read')
  try {
    const { events } = await handle.read()
    expect(events.map(event => event.type)).toEqual([
      'turn/start', 'step/start', 'system/message', 'user/message', 'assistant/message', 'step/end', 'turn/end', 'session/title',
    ])
    expect(JSON.stringify(events)).toContain('answer new')
  } finally {
    await handle.close()
  }
  expect(ctx.workspaceRegistry.get(workspace.id)?.sessionIds).toEqual([sessionId])
  // A failure outside the archive and the conversations is logged and ends the answer without an outcome.
  const logged = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
  const registry = ctx.workspaceRegistry
  const found = registry.get(workspace.id)
  const lookup = vi.spyOn(registry, 'get')
  lookup.mockImplementationOnce(() => found).mockImplementationOnce(() => { throw new Error('registry broken') })
  await expect((await post(zipSync({
    'manifest.json': strToU8('{"export_format_version":3}'),
    'chat_session_index.json': strToU8(JSON.stringify([
      { id: 'new', title: 'title new', pinned: false, inserted_at: at(0), updated_at: at(2_000), message_count: 2 },
    ])),
    'chat_sessions/new.json': strToU8(JSON.stringify(chat('new', 2_000))),
  }))).text()).rejects.toThrow('registry broken')
  expect(logged).toHaveBeenCalledWith('deepseek-chat-import: import failed', new Error('registry broken'))
  lookup.mockRestore()
  expect(await lines(await post(new Uint8Array(4097))))
    .toEqual([{ type: 'outcome', outcome: { ok: false, error: { reason: 'too-large', message: 'the archive exceeds 4096 bytes' } } }])

  await context?.fiber.dispose()
  context = undefined
  expect(routes.size).toBe(0)
})

it('cancels a running import when the plugin unloads and finishes unloading only after it stops', async () => {
  const saving = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<ImageAttachmentRef>()
  const { ctx, routes, post, importer } = await boot(() => {
    saving.resolve(undefined)
    return release.promise
  })
  const conversation = chat('pictured', 1_000)
  conversation.messages[0]!.fragments.unshift({
    type: 'FILE',
    files: [{ id: 'img', file_name: 'a.png', file_size: 1, token_usage: 1, inserted_at: at(0), export_path: 'chat_sessions/pictured_files/a.png', is_image: true, width: 1, height: 1 }],
  })
  const response = await post(zipSync({
    'manifest.json': strToU8('{"export_format_version":3}'),
    'chat_session_index.json': strToU8(JSON.stringify([
      { id: 'pictured', title: 'pictured', pinned: false, inserted_at: at(0), updated_at: at(1_000), message_count: 2 },
    ])),
    'chat_sessions/pictured.json': strToU8(JSON.stringify(conversation)),
    'chat_sessions/pictured_files/a.png': new Uint8Array([1]),
  }))
  await saving.promise
  expect(await lines(await post(new Uint8Array(1))))
    .toEqual([{ type: 'outcome', outcome: { ok: false, error: { reason: 'busy', message: 'another import is running' } } }])
  let unloaded = false
  const disposing = importer!.fiber!.dispose().then(() => { unloaded = true })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(unloaded).toBe(false)
  release.resolve({ attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`), mediaType: 'image/png', bytes: 1, width: 1, height: 1, name: 'a.png' })
  await disposing
  expect(await lines(response)).toEqual([{ type: 'progress', done: 0, total: 1 }])
  expect(routes.size).toBe(0)
  expect(await ctx.sessionPersistence.list()).toEqual([])
})
