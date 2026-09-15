import { Context } from '@qilin/kylin'
import { onTestFinished } from 'vitest'
import SessionStore from '@qilin/session'
import FileSystem from '@qilin/fs-local'
import Subprocess from '@qilin/subprocess-local'
import Sandbox from '@qilin/sandbox-local'
import SandboxPolicy from '@qilin/sandbox-policy'
import SessionProjections from '@qilin/session-projection'
import type { SandboxMode } from '@qilin/sandbox'
import NodeRuntime from '../src/index.ts'
import type { Config } from '../src/index.ts'

export async function mountRuntime(ctx: Context, config: Config = {}, policy: { mode?: SandboxMode; workspaceRoot?: string } = {}) {
  onTestFinished(async () => { await ctx.fiber.dispose() })
  if (!ctx.get('sessions')) await ctx.plugin(SessionStore)
  if (!ctx.get('fs')) await ctx.plugin(FileSystem)
  if (!ctx.get('subprocess')) await ctx.plugin(Subprocess)
  if (!ctx.get('sandbox')) await ctx.plugin(Sandbox, {})
  if (!ctx.get('sessionProjections')) await ctx.plugin(SessionProjections)
  if (!ctx.get('sandboxPolicy')) await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', ...policy })
  await ctx.plugin(NodeRuntime, config)
  return ctx.ptcRuntime as NodeRuntime
}
