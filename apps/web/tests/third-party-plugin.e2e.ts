// Open-gate acceptance: a bundle that lives outside packages/ — installed the
// way `qilin plugin add` installs one (a profile link plus its own patch) —
// reaches the tool registry, is discovered by an agent, and executes. Nothing
// in packages/ names the fixture, so a regression in third-party composition
// fails here rather than on a product surface.
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ToolCallId } from '@qilin-agent/llm'
import { SessionId } from '@qilin-agent/session'
import { RUN_CODE_NAME } from '@qilin-agent/tools'
// Carries the agent-presets Context merge (roster mount) this lane drives.
import type {} from '@qilin-agent/agent-presets'
import { afterAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/plugins/fixture-third-party', import.meta.url))

describe('third-party plugin bundle', () => {
  let scaffold: WebScaffold

  afterAll(async () => {
    await scaffold?.close()
  })

  it('installs, is discovered by an agent, and executes without a core change', async () => {
    // `qilin plugin add` leaves a bundle installed and listed in the profile's
    // enabled set; this option reproduces both halves on the managed profile.
    scaffold = await launchWebScaffold({ profile: { packages: [{ dir: FIXTURE, enabled: true }] } })
    const ctx = scaffold.ctx
    // Process-wide discovery: the fixture's tool is registered beside the
    // shipped host rows, which is what tells a third party its plugin mounted.
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('fixture_echo')

    const handle = await ctx.agents.create({
      sessionId: SessionId('third-party-plugin'),
      meta: { cwd: scaffold.workspaceCwd },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
    try {
      // The tool reaches the agent's model-facing roster too, so the fixture is
      // usable by the model and not merely registered in the host process.
      expect(ctx.tools.schemas(handle.agent).map(schema => schema.name)).toContain('fixture_echo')
      // The shipped `ptc` presentation denies model-direct calls to non-PTC
      // tools, so the call travels the product's own transport.
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('third-party-' + randomUUID()),
        name: RUN_CODE_NAME,
        arguments: {
          description: 'call the out-of-tree fixture tool',
          code: "return (await tools.fixture_echo({ token: 'THIRD_PARTY_OK' })).echoed",
        },
        agent: handle.agent,
      })
      expect(result.isError).toBe(false)
      expect(result.content).toEqual([{ type: 'text', text: 'THIRD_PARTY_OK' }])
    } finally {
      await handle.dispose()
    }
  }, 120_000)
})
