/** Service paths a mutation never reaches: registry reads, catalog shapes, pnpm lifecycle. */
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import PluginManagerGateway from '../src/index.ts'

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn(),
}))

const fetchMock = vi.fn()
const contexts: Context[] = []
const roots: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.mocked(spawn).mockReset()
  fetchMock.mockReset()
  vi.useRealTimers()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A pnpm child the test drives through stdout/stderr/exit events. */
function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function writePackage(nodeModulesDir: string, name: string, body: string): void {
  const target = join(nodeModulesDir, ...name.split('/'))
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'package.json'), body)
}

async function profile(manifest?: Record<string, unknown>): Promise<{ manager: PluginManagerGateway; dir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'qilin-plugin-service-'))
  roots.push(root)
  const installation = join(root, 'installation')
  const dir = join(root, 'profile')
  mkdirSync(installation, { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(installation, 'package.json'), JSON.stringify({ name: 'qilin-app', version: '0.0.0' }))
  writePackage(join(installation, 'node_modules'), '@qilin/base', JSON.stringify({ name: '@qilin/base', version: '3.0.0-seed' }))
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest ?? {
    name: 'profile', dependencies: { '@example/plugin': '1.2.3' },
    qilin: { profile: { bundles: ['@qilin/base', '@example/plugin', '@example/broken', '@example/numeric'] } },
  }))
  writePackage(join(dir, 'node_modules'), '@example/plugin', JSON.stringify({ name: '@example/plugin', version: '1.2.3' }))
  writePackage(join(dir, 'node_modules'), '@example/broken', '{ not json }')
  writePackage(join(dir, 'node_modules'), '@example/numeric', JSON.stringify({ name: '@example/numeric', version: 7 }))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('qilinProfile', { name: 'web', dir, home: root, installAnchor: join(installation, 'package.json'), patchReload: 'live', builtInBundles: ['@qilin/base', '@qilin/coding-sidebar'] })
  await ctx.plugin(PluginManagerGateway)
  return { manager: ctx.get('pluginManager') as PluginManagerGateway, dir }
}

/** Queue one JSON response for the next fetch call. */
function respond(body: unknown, ok = true): void {
  fetchMock.mockResolvedValueOnce({ ok, status: 404, json: async () => body })
}

describe('PluginManagerGateway registry reads', () => {
  it('reports a registry miss as an unknown latest version instead of failing', async () => {
    const { manager } = await profile()
    respond({ latest: '9.9.9' })
    respond({}, false)
    respond({ latest: 7 })
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    const snapshot = await manager.checkUpdates()
    expect(snapshot.entries.map(entry => entry.latestVersion)).toEqual(['9.9.9', null, null, null])
    expect(snapshot.entries[0]).toMatchObject({ name: '@qilin/base', currentVersion: '3.0.0-seed' })
  })

  it('lists no version for a layer whose manifest is unreadable', async () => {
    const { manager } = await profile()
    const entries = (await manager.list()).entries
    expect(entries.map(entry => [entry.name, entry.version])).toEqual([
      ['@qilin/base', '3.0.0-seed'],
      ['@example/plugin', '1.2.3'],
      ['@example/broken', null],
      ['@example/numeric', null],
    ])
  })
})

describe('PluginManagerGateway launch facts', () => {
  it('refuses to construct without the launch profile snapshot', () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => new PluginManagerGateway(ctx)).toThrow('qilinProfile is not available')
  })

  it('reads a legacy DSH layer list and an empty manifest', async () => {
    const legacy = await profile({
      name: 'legacy', dsh: { profile: { bundles: ['@example/plugin'] } },
    })
    expect((await legacy.manager.list()).entries.map(entry => entry.name)).toEqual(['@example/plugin'])

    const bare = await profile({ name: 'bare' })
    expect((await bare.manager.list()).entries).toEqual([])

    // A profile with only a Loader config on disk lists no layers instead of failing.
    const uninitialized = await profile()
    rmSync(join(uninitialized.dir, 'package.json'))
    await expect(uninitialized.manager.list()).resolves.toEqual({ profile: 'web', entries: [] })
  })
})
describe('PluginManagerGateway catalog', () => {
  it('maps search hits and drops rows without a repository name', async () => {
    const { manager } = await profile()
    respond({
      items: [
        { full_name: 'owner/one', html_url: 'https://example.test/one', description: 'One', stargazers_count: 5, updated_at: 'now' },
        { full_name: 'owner/two', html_url: 'https://example.test/two', description: null },
        { html_url: 'https://example.test/three' },
        null,
        'not-a-repository',
      ],
    })
    await expect(manager.catalog('  sidebar  ', 0)).resolves.toEqual({
      entries: [
        { fullName: 'owner/one', description: 'One', stars: 5, updatedAt: 'now', url: 'https://example.test/one' },
        { fullName: 'owner/two', description: null, stars: 0, updatedAt: '', url: 'https://example.test/two' },
      ],
      page: 1,
      hasMore: false,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page=1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('topic%3Adsh-plugin%20sidebar')
  })

  it('reports a full page as having more results', async () => {
    const { manager } = await profile()
    respond({ items: Array.from({ length: 50 }, (_, index) => ({ full_name: 'owner/p' + String(index), html_url: 'u' })), total_count: 120 })
    await expect(manager.catalog('', 2)).resolves.toMatchObject({ page: 2, hasMore: true })
  })

  it('treats a missing item list as an empty page', async () => {
    const { manager } = await profile()
    respond({})
    await expect(manager.catalog('', 1)).resolves.toMatchObject({ entries: [], hasMore: false })
  })

  it('fails loud when GitHub refuses the search', async () => {
    const { manager } = await profile()
    respond({}, false)
    await expect(manager.catalog('', 1)).rejects.toThrow('GitHub search failed with HTTP 404')
  })
})

describe('PluginManagerGateway mutations', () => {
  it('refuses a pnpm flag in the install field', async () => {
    const { manager } = await profile()
    await expect(manager.installPlugin('--frozen-lockfile')).rejects.toThrow('package spec')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses an unknown layer for update and uninstall', async () => {
    const { manager } = await profile()
    await expect(manager.updatePlugin('@example/absent')).rejects.toThrow('cannot be updated')
    await expect(manager.uninstallPlugin('@example/absent')).rejects.toThrow('cannot be removed')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('removes a user layer through pnpm remove', async () => {
    const { manager, dir } = await profile()
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const pending = manager.uninstallPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    child.stdout.emit('data', Buffer.from('Removing @example/plugin'))
    child.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ changed: true, restartRequired: true, outputTail: ['Removing @example/plugin'] })
    expect(vi.mocked(spawn)).toHaveBeenCalledWith('pnpm', ['remove', '@example/plugin'], expect.objectContaining({ cwd: dir }))
  })

  it('reports a failed pnpm exit with its retained output', async () => {
    const { manager } = await profile()
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const pending = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    child.stderr.emit('data', Buffer.from('ERR_PNPM_FETCH_404  not found'))
    child.emit('close', 1)
    await expect(pending).rejects.toThrow('pnpm add failed')
    await expect(pending).rejects.toThrow('ERR_PNPM_FETCH_404')
  })

  it('keeps only the last eighty output lines', async () => {
    const { manager } = await profile()
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const pending = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    child.stdout.emit('data', Buffer.from(Array.from({ length: 100 }, (_, index) => 'line ' + String(index)).join(String.fromCharCode(10)) + String.fromCharCode(10)))
    child.emit('close', 0)
    const receipt = await pending
    expect(receipt.outputTail).toHaveLength(80)
    expect(receipt.outputTail[0]).toBe('line 20')
    expect(receipt.outputTail.at(-1)).toBe('line 99')
  })

  it('fails the mutation when pnpm cannot be spawned', async () => {
    const { manager } = await profile()
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const pending = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    child.emit('error', new Error('spawn pnpm ENOENT'))
    await expect(pending).rejects.toThrow('spawn pnpm ENOENT')
  })

  it('stops waiting after the command timeout and kills the child', async () => {
    const { manager } = await profile()
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    vi.useFakeTimers()
    const pending = manager.installPlugin('@example/plugin')
    const settled = expect(pending).rejects.toThrow('timed out after 120000ms')
    await vi.advanceTimersByTimeAsync(120_001)
    await settled
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })
  it('resolves a missing exit code as failure and ignores late child events', async () => {
    const { manager } = await profile({
      name: 'profile',
      qilin: { profile: { bundles: ['@example/plugin'] } },
    })
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const pending = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    // A child that never reports a code is a failure, not a silent success.
    child.emit('close', null)
    await expect(pending).rejects.toThrow('pnpm add failed')

    // Both settlement handlers stay registered; whichever lands first wins and a
    // later event from the other one must not settle the mutation twice.
    const second = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(second as never)
    const failing = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(2) })
    second.emit('error', new Error('late pnpm error'))
    await expect(failing).rejects.toThrow('late pnpm error')
    second.emit('close', 0)

    const third = fakeChild()
    vi.mocked(spawn).mockReturnValueOnce(third as never)
    const settled = manager.installPlugin('@example/plugin')
    await vi.waitFor(() => { expect(spawn).toHaveBeenCalledTimes(3) })
    third.emit('close', 0)
    await expect(settled).resolves.toMatchObject({ changed: true })
    third.emit('error', new Error('late pnpm error after close'))
  })
})
