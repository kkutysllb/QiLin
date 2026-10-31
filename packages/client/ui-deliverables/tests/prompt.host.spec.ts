/** Node-half coverage: the shared file-reference guidance is another plugin's section. */

import { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it } from 'vitest'
import SystemPrompt from '@qilin-agent/system-prompt'
import { apply, inject } from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('ui-deliverables node plugin', () => {
  it('leaves the shared file-reference guidance to its own plugin', async () => {
    expect(inject).not.toContain('systemPrompt')
    ctx = new Context()
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    ctx.provide('connection', { fetch: { register: () => () => {} } } as never)
    ctx.provide('sessionQuery', {} as never)
    ctx.provide('sessionController', {} as never)
    ctx.provide('workspaceFiles', {} as never)
    ctx.provide('fs', {} as never)
    ctx.provide('sandboxPolicy', {} as never)
    ctx.provide('workspaceChanges', {} as never)
    const mounted = ctx.plugin({ apply, inject })
    await mounted.await()

    // The separately mounted deliverable-file-references plugin owns this section.
    expect((await ctx.systemPrompt.assemble()).sections
      .some(entry => entry.name === 'ui:deliverable-file-references')).toBe(false)

    await mounted.dispose()
  })
})
