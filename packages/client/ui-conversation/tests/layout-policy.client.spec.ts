// @vitest-environment jsdom
/** ConversationLayoutPolicy: width writes, the durable adoption, and the
 * pre-durable localStorage handoff. */
import { beforeEach, describe, expect, it } from 'vitest'
import { stubSettingsScope } from '@qilin/client-test-runtime'
import { ConversationLayoutPolicy } from '../src/client/layout-policy.ts'
import {
  CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN,
} from '../src/conversation-settings.ts'
import type { ConversationSettings } from '../src/conversation-settings.ts'

const LEGACY_WIDTH_KEY = 'qilin.conversation.contentWidth'

const ENTER_ONLY: ConversationSettings = { busyEnter: 'queue', contentWidth: CONTENT_WIDTH_ADAPTIVE }

beforeEach(() => { localStorage.clear() })

describe('ConversationLayoutPolicy', () => {
  it('starts at the adaptive clamp without a scope', () => {
    const policy = new ConversationLayoutPolicy()
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_ADAPTIVE)
  })

  it('rounds a drag request, publishes it locally, then writes it through the scope', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    policy.setContentWidth(969.6)
    expect(policy.contentWidth.getSnapshot()).toBe(970)
    expect(host.set).toHaveBeenCalledWith('contentWidth', 970)
    expect(host.set).toHaveBeenCalledOnce()
  })

  it('bounds an explicit width to the persistable range', () => {
    const policy = new ConversationLayoutPolicy()
    policy.setContentWidth(120)
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_MIN)
    policy.setContentWidth(9000)
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_MAX)
  })

  it('reverts to the adaptive clamp by clearing the override', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    policy.setContentWidth(970)
    policy.setContentWidth(CONTENT_WIDTH_ADAPTIVE)
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_ADAPTIVE)
    expect(host.unset).toHaveBeenCalledWith('contentWidth')
    expect(host.unset).toHaveBeenCalledOnce()
  })

  it('leaves an identical width untouched', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    policy.setContentWidth(970)
    policy.setContentWidth(970.2)
    expect(host.set).toHaveBeenCalledOnce()
  })

  it('adopts a Host width without writing it back', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    host.publish({
      status: 'ready', value: { ...ENTER_ONLY, contentWidth: 1100 }, user: { contentWidth: 1100 }, revision: 1, writable: true,
    })
    expect(policy.contentWidth.getSnapshot()).toBe(1100)
    expect(host.set).not.toHaveBeenCalled()
  })

  it('carries a pre-durable dragged width into the namespace that has no override', () => {
    localStorage.setItem(LEGACY_WIDTH_KEY, '860')
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    // The live value is current immediately, so the transcript never flashes back.
    expect(policy.contentWidth.getSnapshot()).toBe(860)
    host.publish({ status: 'ready', value: ENTER_ONLY, user: {}, revision: 1, writable: true })
    expect(host.set).toHaveBeenCalledWith('contentWidth', 860)
    expect(policy.contentWidth.getSnapshot()).toBe(860)
    expect(localStorage.getItem(LEGACY_WIDTH_KEY)).toBeNull()
  })

  it('lets a stored Host override win over the pre-durable width', () => {
    localStorage.setItem(LEGACY_WIDTH_KEY, '860')
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    host.publish({
      status: 'ready', value: { ...ENTER_ONLY, contentWidth: 1500 }, user: { contentWidth: 1500 }, revision: 1, writable: true,
    })
    expect(policy.contentWidth.getSnapshot()).toBe(1500)
    expect(host.set).not.toHaveBeenCalled()
  })

  it('drops a corrupt pre-durable value', () => {
    localStorage.setItem(LEGACY_WIDTH_KEY, 'wide')
    const policy = new ConversationLayoutPolicy()
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_ADAPTIVE)
    expect(localStorage.getItem(LEGACY_WIDTH_KEY)).toBeNull()
  })

  it('a width chosen before the first Host view supersedes the carried value', () => {
    localStorage.setItem(LEGACY_WIDTH_KEY, '860')
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new ConversationLayoutPolicy(host.scope)
    policy.setContentWidth(CONTENT_WIDTH_ADAPTIVE)
    host.publish({ status: 'ready', value: ENTER_ONLY, user: {}, revision: 1, writable: true })
    expect(host.set).not.toHaveBeenCalled()
    expect(policy.contentWidth.getSnapshot()).toBe(CONTENT_WIDTH_ADAPTIVE)
  })
})
