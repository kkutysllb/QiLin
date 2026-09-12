import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@qilin/typert-protocol'
import McpServers from '../src/index.ts'

const contexts: Context[] = []
let home = ''
let previousHome: string | undefined

/** A subprocess provider whose resolved PATH holds npx and nothing else. */
const subprocess = {
  resolveExecutable: async (command: string): Promise<string> => {
    if (command === 'npx') return '/usr/local/bin/npx'
    throw new Error('command ' + command + ' was not found on PATH')
  },
}

async function harness(): Promise<McpServers> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('subprocess', subprocess as never)
  await ctx.plugin(McpServers)
  const service = ctx.get('mcpServers') as McpServers | undefined
  if (service === undefined) throw new Error('mcpServers did not activate')
  return service
}

const signal = new AbortController().signal

beforeEach(() => {
  previousHome = process.env.QILIN_HOME
  home = mkdtempSync(join(tmpdir(), 'qilin-mcp-gateway-'))
  process.env.QILIN_HOME = home
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  rmSync(home, { recursive: true, force: true })
  if (previousHome === undefined) delete process.env.QILIN_HOME
  else process.env.QILIN_HOME = previousHome
})

describe('McpServers', () => {
  it('publishes the settings operations under the mcpServers namespace', async () => {
    const service = await harness()
    expect(service.typertRemote).toMatchObject({ serviceKey: 'mcpServers', namespace: 'mcpServers' })
    expect(remoteMethods(service)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'save', invocation: { kind: 'direct' } },
      { method: 'remove', invocation: { kind: 'direct' } },
      { method: 'setEnabled', invocation: { kind: 'direct' } },
      { method: 'addBuiltin', invocation: { kind: 'direct' } },
    ])
  })

  it('reports an empty layer, its path, and each recommended command availability', async () => {
    const service = await harness()
    const snapshot = await service.list(signal)
    expect(snapshot.patchPath).toBe(join(home, 'cordis.patch.yml'))
    expect(snapshot.servers).toEqual([])
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.builtins).toEqual([
      { id: 'fetch', name: 'fetch', command: 'uvx', args: ['mcp-server-fetch'], available: false },
      {
        id: 'context7',
        name: 'context7',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        available: true,
      },
      {
        id: 'sequential-thinking',
        name: 'sequential-thinking',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        available: true,
      },
      {
        id: 'playwright',
        name: 'playwright',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        available: true,
      },
    ])
  })

  it('saves a stdio server, then lists it with the recommended id it matches', async () => {
    const service = await harness()
    const saved = await service.save(
      { serverName: 'context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      signal,
    )
    expect(saved.servers).toEqual([
      {
        serverName: 'context7',
        entryId: 'mcp-context7',
        transport: 'stdio',
        detail: 'npx -y @upstash/context7-mcp',
        enabled: true,
        builtin: 'context7',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        cwd: '',
        url: '',
        failOnStartupError: false,
      },
    ])
  })

  it('saves a Streamable HTTP server with its endpoint as the detail', async () => {
    const service = await harness()
    const saved = await service.save(
      { serverName: 'remote', transport: 'streamable-http', url: 'https://example.test/mcp' },
      signal,
    )
    expect(saved.servers).toEqual([
      {
        serverName: 'remote',
        entryId: 'mcp-remote',
        transport: 'streamable-http',
        detail: 'https://example.test/mcp',
        enabled: true,
        builtin: null,
        command: '',
        args: [],
        cwd: '',
        url: 'https://example.test/mcp',
        failOnStartupError: false,
      },
    ])
  })

  it('disables and re-enables a saved server', async () => {
    const service = await harness()
    await service.save({ serverName: 'added', transport: 'stdio', command: 'npx' }, signal)
    expect((await service.setEnabled('added', false, signal)).servers[0]?.enabled).toBe(false)
    expect((await service.setEnabled('added', true, signal)).servers[0]?.enabled).toBe(true)
  })

  it('removes a saved server', async () => {
    const service = await harness()
    await service.save({ serverName: 'added', transport: 'stdio', command: 'npx' }, signal)
    expect((await service.remove('added', signal)).servers).toEqual([])
  })

  it('adds a recommended server in place', async () => {
    const service = await harness()
    const added = await service.addBuiltin('fetch', signal)
    expect(added.servers).toEqual([
      {
        serverName: 'fetch',
        entryId: 'mcp-fetch',
        transport: 'stdio',
        detail: 'uvx mcp-server-fetch',
        enabled: true,
        builtin: 'fetch',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        cwd: '',
        url: '',
        failOnStartupError: false,
      },
    ])
    expect((await service.addBuiltin('fetch', signal)).servers).toHaveLength(1)
  })

  it('refuses a recommended id it does not ship', async () => {
    const service = await harness()
    await expect(service.addBuiltin('nope', signal)).rejects.toThrow(/no recommended server has id nope/u)
  })

  it('refuses a namespace the Loader would reject', async () => {
    const service = await harness()
    await expect(service.save({ serverName: 'bad name', transport: 'stdio', command: 'npx' }, signal))
      .rejects.toThrow(/must match/u)
  })

  it('refuses a stdio server with no executable', async () => {
    const service = await harness()
    await expect(service.save({ serverName: 'added', transport: 'stdio' }, signal))
      .rejects.toThrow(/needs the executable/u)
    await expect(service.save({ serverName: 'added', transport: 'stdio', command: '   ' }, signal))
      .rejects.toThrow(/needs the executable/u)
  })

  it('refuses a Streamable HTTP server without a usable endpoint', async () => {
    const service = await harness()
    await expect(service.save({ serverName: 'added', transport: 'streamable-http' }, signal))
      .rejects.toThrow(/needs its endpoint URL/u)
    await expect(service.save({ serverName: 'added', transport: 'streamable-http', url: 'nope' }, signal))
      .rejects.toThrow(/is not a URL/u)
    await expect(service.save({ serverName: 'added', transport: 'streamable-http', url: 'ftp://x.test' }, signal))
      .rejects.toThrow(/must use http or https/u)
  })

  it('reports an unaddressable layer instead of overwriting it, and refuses its mutations', async () => {
    const service = await harness()
    writeFileSync(join(home, 'cordis.patch.yml'), 'insert: []\n')
    const snapshot = await service.list(signal)
    expect(snapshot.error).toMatch(/is not a Loader patch list/u)
    expect(snapshot.servers).toEqual([])
    await expect(service.save({ serverName: 'added', transport: 'stdio', command: 'npx' }, signal))
      .rejects.toThrow(/is not a Loader patch list/u)
    await expect(service.remove('added', signal)).rejects.toThrow(/is not a Loader patch list/u)
    await expect(service.setEnabled('added', false, signal)).rejects.toThrow(/is not a Loader patch list/u)
    await expect(service.addBuiltin('fetch', signal)).rejects.toThrow(/is not a Loader patch list/u)
  })

  it('reports a layer that does not parse', async () => {
    const service = await harness()
    writeFileSync(join(home, 'cordis.patch.yml'), '- insert:\n    - id: [\n')
    expect((await service.list(signal)).error).toMatch(/is not valid YAML/u)
  })

  it('refuses a disabled server the layer does not declare', async () => {
    const service = await harness()
    await expect(service.setEnabled('absent', false, signal)).rejects.toThrow(/declares no MCP server named/u)
  })

  it('propagates a write failure that is not a patch-layer refusal', async () => {
    const service = await harness()
    await service.save({ serverName: 'added', transport: 'stdio', command: 'npx' }, signal)
    chmodSync(home, 0o500)
    try {
      await expect(service.save({ serverName: 'second', transport: 'stdio', command: 'npx' }, signal))
        .rejects.toThrow()
    } finally {
      chmodSync(home, 0o700)
    }
  })

  it('stops before writing when the caller cancels', async () => {
    const service = await harness()
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(service.list(cancelled.signal)).rejects.toThrow()
    await expect(service.save({ serverName: 'added', transport: 'stdio', command: 'npx' }, cancelled.signal))
      .rejects.toThrow()
    await expect(service.remove('added', cancelled.signal)).rejects.toThrow()
    await expect(service.setEnabled('added', false, cancelled.signal)).rejects.toThrow()
    await expect(service.addBuiltin('fetch', cancelled.signal)).rejects.toThrow()
  })
})
