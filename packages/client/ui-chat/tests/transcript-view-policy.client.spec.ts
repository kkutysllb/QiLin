// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { stubSettingsScope } from '@qilin/client-test-runtime'
import type { ChatSettings } from '../src/chat-settings.ts'
import { TranscriptViewPolicy } from '../src/client/transcript-view.ts'

/** One full accepted section: the fields the policy ignores ride their defaults. */
function section(transcriptView: ChatSettings['transcriptView']): ChatSettings {
  return { transcriptView, performanceUsage: 'detailed', linkOpening: 'sidebar' }
}

describe('TranscriptViewPolicy', () => {
  it('defaults to Standard and publishes explicit choices before persistence settles', () => {
    const host = stubSettingsScope<ChatSettings>()
    const observed: string[] = []
    let current = (): string => 'unconstructed'
    const scope: typeof host.scope = {
      ...host.scope,
      set: (field, value) => {
        observed.push(`${field}=${String(value)}:${current()}`)
        return host.scope.set(field, value)
      },
    }
    const policy = new TranscriptViewPolicy(scope)
    current = () => policy.mode.getSnapshot()

    expect(policy.mode.getSnapshot()).toBe('standard')
    policy.setMode('verbose')
    expect(policy.mode.getSnapshot()).toBe('verbose')
    expect(observed).toEqual(['transcriptView=verbose:verbose'])
    expect(host.set).toHaveBeenCalledWith('transcriptView', 'verbose')
  })

  it('adopts Host state and ignores identical writes', () => {
    const host = stubSettingsScope<ChatSettings>()
    const policy = new TranscriptViewPolicy(host.scope)

    host.publish({ status: 'ready', value: section('standard'), revision: 1, writable: true })
    expect(policy.mode.getSnapshot()).toBe('standard')
    policy.setMode('standard')
    expect(host.set).not.toHaveBeenCalled()

    host.publish({ value: section('compact'), revision: 2 })
    expect(policy.mode.getSnapshot()).toBe('compact')
  })

  it('reads the saved two-mode generation as Standard without offering it', () => {
    const host = stubSettingsScope<ChatSettings>()
    host.publish({ status: 'ready', value: section('normal'), revision: 1, writable: true })
    expect(new TranscriptViewPolicy(host.scope).mode.getSnapshot()).toBe('standard')
  })

  it('reads saved `expanded` values as Detailed', () => {
    const host = stubSettingsScope<ChatSettings>()
    host.publish({ status: 'ready', value: section('expanded'), revision: 1, writable: true })
    expect(new TranscriptViewPolicy(host.scope).mode.getSnapshot()).toBe('detailed')
  })

  it('adopts an accepted section standing at construction', () => {
    const host = stubSettingsScope<ChatSettings>()
    host.publish({ status: 'ready', value: section('detailed'), revision: 1, writable: true })
    expect(new TranscriptViewPolicy(host.scope).mode.getSnapshot()).toBe('detailed')
  })
})
