/** Shared context for the Python runtime suites: real confinement plus owned teardown. */
import { Context } from '@qilin-agent/kylin'
import Sandbox from '@qilin-agent/sandbox-local'
import SandboxPolicy from '@qilin-agent/sandbox-policy'
import SessionProjections from '@qilin-agent/session-projection'
import { onTestFinished } from 'vitest'
import type { SandboxMode } from '@qilin-agent/sandbox'

/**
 * Mount the policy and confinement providers the runtime injects.
 * @param policy - overriding file-effect mode and workspace root; full access by default.
 * @returns the context the runtime can mount into.
 */
export async function createRuntimeContext(policy: { mode?: SandboxMode; workspaceRoot?: string } = {}): Promise<Context> {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(Sandbox, {})
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', ...policy })
  return ctx
}
