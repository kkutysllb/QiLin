// @vitest-environment jsdom
/** The sidechat plugin's two halves: the host no-op and the browser wiring. */
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@qilin-agent/client-test-runtime'
import { apply as applyHost } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { SIDECHAT_ID } from '../src/client/definition.tsx'
import { SidechatBody } from '../src/client/SidechatBody.tsx'
import { NS, zh } from '../src/client/locales.ts'
import type { SidechatInjected } from '../src/client/face.ts'

usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const register = vi.fn(() => () => {})
  runtime.ctx.provide('sidebarRightTabs', { register } as never)
  runtime.remote.provideNamespaces({ session: {} })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.root.declare({ 'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' } } as never, () => null)
  const feature = await runtime.mount({ inject: [...inject], apply })
  return { runtime, register, feature }
}

describe('ui-sidechat wiring', () => {
  it('host half is an inert plugin body', () => {
    expect(applyHost).toBeTypeOf('function')
    // The Node half contributes nothing to the host tree.
    applyHost()
  })

  it('registers the sidechat tab type beside its dictionary', async () => {
    const b = await bench()
    expect(b.register).toHaveBeenCalledTimes(1)
    expect(b.register).toHaveBeenCalledWith(expect.objectContaining({ id: SIDECHAT_ID, single: true }))
    expect(b.runtime.ctx.locale.bind(NS)('threads.new')).toBe(zh['threads.new'])
    await b.runtime.dispose()
  })

  it('contributes the panel body under the type id and removes it on dispose', async () => {
    const b = await bench()
    const entries = b.runtime.slots.entries('sidebar.right.pane.tab')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.key).toBe(SIDECHAT_ID)
    expect(entries[0]?.component).toBe(SidechatBody)
    const face = (entries[0]?.inject as unknown as () => SidechatInjected)()
    expect(face.hooks.sidechat.getSnapshot()).toMatchObject({ phase: 'idle', threads: [] })

    await b.feature.dispose()
    expect(b.runtime.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
    await b.runtime.dispose()
  })
})
