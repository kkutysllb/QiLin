// @vitest-environment jsdom
/** PerformanceUsagePolicy: the shared detail preference over a settings scope. */
import { describe, expect, it } from 'vitest'
import { stubConfigForm } from '@qilin-agent/client-test-runtime'
import type { ChatSettings } from '../src/chat-settings.ts'
import { PerformanceUsagePolicy } from '../src/client/performance-usage.ts'

/** One full accepted section: the fields this policy ignores ride their defaults. */
function section(performanceUsage: ChatSettings['performanceUsage']): ChatSettings {
  return { transcriptView: 'detailed', performanceUsage, linkOpening: 'sidebar' }
}

describe('PerformanceUsagePolicy', () => {
  it('starts at the shipped default and adopts an accepted Host preference', () => {
    const host = stubConfigForm<ChatSettings>()
    host.publish({ status: 'ready', value: section('compact'), revision: 1, writable: true })
    const policy = new PerformanceUsagePolicy(host.scope)
    try {
      expect(policy.mode.getSnapshot()).toBe('compact')
      expect(host.set).not.toHaveBeenCalled()
      host.publish({ value: section('detailed'), revision: 2 })
      expect(policy.mode.getSnapshot()).toBe('detailed')
    } finally {
      policy.dispose()
    }
    expect(host.listenerCount()).toBe(0)
  })

  it('publishes a changed choice and writes nothing when the choice is unchanged', () => {
    const host = stubConfigForm<ChatSettings>()
    const policy = new PerformanceUsagePolicy(host.scope)
    try {
      expect(policy.mode.getSnapshot()).toBe('detailed')
      policy.setMode('detailed')
      expect(host.set).not.toHaveBeenCalled()
      policy.setMode('compact')
      expect(policy.mode.getSnapshot()).toBe('compact')
      expect(host.set).toHaveBeenCalledExactlyOnceWith('performanceUsage', 'compact')
    } finally {
      policy.dispose()
    }
  })
})
