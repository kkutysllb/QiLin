/**
 * The roster's Settings integration: it opts out of automatic session
 * creation for its own namespace, and deleting the live default re-inherits
 * the composition posture when (and only when) the roster is a Loader entry.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import AgentPresets, { COMPOSITION_FILE } from '@qilin-agent/agent-presets'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** One temp preset root holding an empty composition named `id`. */
async function presetRoot(id: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-agent-presets-settings-'))
  roots.push(root)
  await mkdir(join(root, id))
  await writeFile(join(root, id, COMPOSITION_FILE), '[]\n')
  return root
}

/** The two Settings operations the roster uses. */
function settingsStub() {
  const configure = vi.fn((..._args: unknown[]) => () => {})
  const replace = vi.fn(async (..._args: unknown[]) => {})
  return { settings: { configure, replace }, configure, replace }
}

/** A context with the roster's required services and a Settings stub. */
async function context(baseUrl: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = baseUrl
  await ctx.plugin(Loader)
  await ctx.plugin(SessionProjectionRegistry)
  return ctx
}

describe('roster Settings integration', () => {
  it('opts out of automatic session creation and resets a deleted live default', async () => {
    const root = await presetRoot('temp')
    const ctx = await context(pathToFileURL(root).href + '/')
    const { settings, configure, replace } = settingsStub()
    ctx.provide('settings', settings as never)
    await liveConfig(ctx, AgentPresets, {
      default: 'temp',
      roots: [{ path: root, trust: 'user' }],
      includeShippedRoot: false,
      includeUserRoot: false,
    })
    expect(configure).toHaveBeenCalledOnce()
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    expect(ctx.agentPresets.defaultId).toBe('temp')
    // The roster's own context is not the Loader fiber in this harness; naming
    // the entry it belongs to is what the Loader composition supplies.
    const internals: unknown = ctx.agentPresets
    const owner = (internals as { ctx: { fiber: object } }).ctx.fiber
    Object.defineProperty(owner, 'entry', { value: { options: { id: 'agent-presets' } } })
    await ctx.agentPresets.remove('temp')
    expect(replace).toHaveBeenCalledOnce()
    expect(replace.mock.calls[0]?.[1]).toEqual({})
  })

  it('keeps a deleted default when the roster is not a Loader entry', async () => {
    const root = await presetRoot('direct')
    const ctx = await context(pathToFileURL(root).href + '/')
    const { settings, replace } = settingsStub()
    ctx.provide('settings', settings as never)
    await ctx.plugin(AgentPresets, {
      default: 'direct',
      roots: [{ path: root, trust: 'user' }],
      includeShippedRoot: false,
      includeUserRoot: false,
    })
    await ctx.agentPresets.remove('direct')
    expect(replace).not.toHaveBeenCalled()
  })
})
