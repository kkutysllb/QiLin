/**
 * apply_patch's composition-dependent registration: escalation fields under a
 * confining filesystem, and guidance that follows the scope's tool visibility.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import { createScope, type Scope } from '@qilin-agent/scope'
import SystemPrompt, { renderPrompt } from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import SandboxPolicyService from '@qilin-agent/sandbox-policy'
import { SandboxedFileSystem } from '@qilin-agent/fs-sandbox'
import { LocalFileSystem } from '@qilin-agent/fs-local'
import * as ToolFs from '@qilin-agent/tool-fs'

const GUIDANCE = 'Prefer apply_patch over separate edit calls'

let dir: string
let ctx: Context

/**
 * Mount the tool over a confining or unconfined filesystem.
 * @param confining - whether the mounted provider reports a sandbox mode.
 */
async function boot(confining = false): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'qilin-apply-patch-schema-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  if (confining) {
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: dir })
    await ctx.plugin(SandboxedFileSystem, { cwd: dir })
  } else await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(ToolFs, { applyPatch: true })
}

afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

describe('apply_patch registration', () => {
  it('advertises the escalation fields when the mounted filesystem confines', async () => {
    await boot(true)
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'apply_patch')
    if (schema === undefined) throw new Error('expected apply_patch to be registered')
    const properties = (schema.parameters as { properties: Record<string, unknown> }).properties
    // The same one-shot escalation pair write and edit advertise beside the tool.
    expect(properties['sandbox_permissions']).toBeDefined()
    expect(properties['justification']).toBeDefined()
  })

  it('keeps its guidance out of a scope that cannot see the tool', async () => {
    await boot()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain(GUIDANCE)
    const key = {}
    let scope!: Scope
    await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) },
      { inject: ['tools', 'systemPrompt'] }))
    // A preset that keeps only reading hides the patch tool from one agent alone.
    const release = scope.ctx.tools.restrict({ allow: ['read'] })
    try {
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).not.toContain(GUIDANCE)
    } finally {
      release()
      await scope.dispose()
    }
  })
})
