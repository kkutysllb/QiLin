import { Context } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import { mountAgentLoopTestDependencies } from '@qilin-agent/agent-loop-testkit'
import { LocalBashExecutor } from '@qilin-agent/bash-local'
import * as BashEnvPlugin from '@qilin-agent/shell-env'
import LocalSubprocessRuntime from '@qilin-agent/subprocess-local'
import * as ToolBash from '@qilin-agent/tool-bash'
import * as LlmDeepSeek from '@qilin-agent/llm-deepseek-api-key'
import SubagentRuntime from '@qilin-agent/subagent'
import * as Spawn from '../src/index.ts'
import * as ToolSubagent from '@qilin-agent/tool-subagent'
import { mountWorkingDirectoryFixture } from '../../subagent/tests/working-directory-fixture.ts'

/**
 * Shared harness for the spawn-backend e2e: the full real stack (DeepSeek
 * adapter + real bash tool + the subagent tool bound to the spawn backend), so
 * a real parent agent can delegate to a real in-process child that does real
 * work (writes a file). Lives outside the *.e2e.ts pattern so importing it never
 * re-registers another file's tests.
 */
export async function spawnHarness(workdir: string): Promise<Context> {
  const ctx = new Context()
  // This harness installs only the global default persona, so both parent and
  // spawned children render it. It stays neutral for both roles; the
  // delegation nudge lives in the e2e's user prompt and the subagent tool's
  // own description.
  await mountAgentLoopTestDependencies(ctx, {
    systemPrompt: { personaPrefix: 'You are a coding agent. Report only when the requested work is done.' },
  })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LlmDeepSeek)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(BashEnvPlugin)
  await ctx.plugin(LocalBashExecutor, { cwd: workdir, timeoutMs: 30_000 })
  await ctx.plugin(ToolBash)
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  // The model-facing subagent tool, bound to the spawn backend.
  await ctx.plugin(ToolSubagent, { provider: 'spawn' })
  return ctx
}

export function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}
