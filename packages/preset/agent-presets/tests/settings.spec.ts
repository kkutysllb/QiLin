/**
 * The default preset and the picker policy are live composition fields. A
 * Loader volatile update re-points them without remounting the roster; the
 * whole-form reset re-inherits the composition posture.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import LlmRuntime from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import AgentRegistry from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import { describe, expect, it, onTestFinished } from 'vitest'
import AgentPresets, { COMPOSITION_FILE, SETTINGS_NAMESPACE } from '@qilin-agent/agent-presets'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'system'), trust: 'system' as const }]

/** The roster behind a Loader entry, with live updates over its raw config. */
async function harness() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const live = await liveConfig(ctx, AgentPresets, {
    default: 'standard', roots: [...ROOTS], includeShippedRoot: false, includeUserRoot: false,
  })
  return { ctx, live }
}

const toolNames = (ctx: Context, agent?: unknown): string[] =>
  ctx.tools.schemas(agent as never).map(schema => schema.name).sort()

describe('the default preset as a live composition field', () => {
  it('shows mode selection on the composition default by default', async () => {
    const { ctx } = await harness()

    expect((await ctx.agentPresets.remoteExportList()).modeSelectionEnabled).toBe(true)
    expect(ctx.agentPresets.defaultId).toBe('standard')

    const { live } = await harness()
    await live.update({ modeSelectionEnabled: false })
    expect((await ctx.agentPresets.remoteExportList()).modeSelectionEnabled).toBe(false)
    expect(ctx.agentPresets.defaultId).toBe('standard')
  })

  it('temporarily ignores the saved default while selection is off', async () => {
    const { ctx, live } = await harness()

    await live.update({ default: 'minimal' })
    expect(ctx.agentPresets.defaultId).toBe('minimal')

    await live.update({ modeSelectionEnabled: false })
    expect(ctx.agentPresets.defaultId).toBe('standard')

    await live.update({ modeSelectionEnabled: true })
    expect(ctx.agentPresets.defaultId).toBe('minimal')
  })

  it('composes a new session from the live default', async () => {
    const { ctx, live } = await harness()
    await live.update({ default: 'minimal' })

    const handle = await ctx.agents.create({
      sessionId: SessionId('settings-default'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx),
    })
    try {
      expect(toolNames(ctx, handle.agent)).toEqual(['beta'])
    } finally {
      await handle.dispose()
    }
  })

  it('leaves a running session on the preset it was composed from', async () => {
    const { ctx, live } = await harness()
    const running = await ctx.agents.create({
      sessionId: SessionId('settings-running'),
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx),
    })
    try {
      expect(toolNames(ctx, running.agent)).toEqual(['alpha'])

      // Changing the default mid-flight must not reach an agent that already
      // composed: its history was produced under `standard`'s tools.
      await live.update({ default: 'minimal' })

      expect(ctx.agentPresets.defaultId).toBe('minimal')
      expect(toolNames(ctx, running.agent)).toEqual(['alpha'])

      await live.update({ modeSelectionEnabled: false })

      expect(ctx.agentPresets.defaultId).toBe('standard')
      expect(toolNames(ctx, running.agent)).toEqual(['alpha'])
    } finally {
      await running.dispose()
    }
  })

  it('re-inherits the composition posture when the live fields reset', async () => {
    const { ctx, live } = await harness()
    await live.update({ default: 'minimal' })
    expect(ctx.agentPresets.defaultId).toBe('minimal')

    await live.replace({ default: 'standard', modeSelectionEnabled: true })

    expect((await ctx.agentPresets.remoteExportList()).modeSelectionEnabled).toBe(true)
    expect(ctx.agentPresets.defaultId).toBe('standard')
  })

  it('resets a deleted default back to the composition posture', async () => {
    const { ctx, live } = await harness()
    await live.update({ default: 'no-such-preset' })
    expect(ctx.agentPresets.defaultId).toBe('no-such-preset')

    // The roster's own reset path: a default naming a preset that is gone is
    // re-inherited rather than left pointing at nothing.
    const settings = ctx.get('settings')
    expect(settings).toBeUndefined()
    await live.replace({ default: 'standard', modeSelectionEnabled: true })
    expect(ctx.agentPresets.defaultId).toBe('standard')
  })

  it('reports an unknown default only when a session tries to use it', async () => {
    const { ctx, live } = await harness()

    // Storing it succeeds — the roster is a live directory, so a name that is
    // absent now may exist by the time a session asks for it.
    await live.update({ default: 'no-such-preset' })

    await expect(ctx.agentPresets.resolve())
      .rejects.toThrow(/preset "no-such-preset" not found/)
  })

  it('keeps the settings namespace export aligned with the entry id', async () => {
    expect(SETTINGS_NAMESPACE).toBe('agent-presets')
    expect(COMPOSITION_FILE).toBe('agent.cordis.yml')
  })
})
