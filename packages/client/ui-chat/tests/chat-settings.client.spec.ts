import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import { SettingsProvider, type SettingsNamespace } from '@qilin-agent/settings'
import {
  CHAT_SETTINGS_NAMESPACE, DEFAULT_TRANSCRIPT_VIEW_MODE, apply,
} from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('ui-chat Host settings', () => {
  it('registers, validates, and disposes the transcript-view namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = CHAT_SETTINGS_NAMESPACE

    expect(ctx.settings.get(ns)).toEqual({
      transcriptView: DEFAULT_TRANSCRIPT_VIEW_MODE, performanceUsage: 'detailed', linkOpening: 'sidebar',
    })
    // The durable section keeps saved legacy values verbatim; the browser
    // policy reads them as their current-generation modes.
    await ctx.settings.update(ns, { transcriptView: 'normal' })
    expect(ctx.settings.get(ns)).toEqual({
      transcriptView: 'normal', performanceUsage: 'detailed', linkOpening: 'sidebar',
    })
    await ctx.settings.update(ns, { transcriptView: 'expanded', performanceUsage: 'compact', linkOpening: 'new-tab' })
    expect(ctx.settings.get(ns)).toEqual({
      transcriptView: 'expanded', performanceUsage: 'compact', linkOpening: 'new-tab',
    })
    // Unrecognized saved modes do not reject: the loose schema falls back to Standard.
    await ctx.settings.update(ns, { transcriptView: 'dense' })
    expect(ctx.settings.get(ns)).toEqual({
      transcriptView: 'detailed', performanceUsage: 'compact', linkOpening: 'new-tab',
    })

    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('loads without a settings provider', async () => {
    const ctx = new Context()
    await expect(ctx.plugin({ apply }).await()).resolves.toBeDefined()
  })
})
