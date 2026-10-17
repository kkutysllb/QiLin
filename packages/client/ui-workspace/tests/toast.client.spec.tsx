// @vitest-environment jsdom
/**
 * The keyed Workspace notice factory, its two shipped registrations, and the
 * overlay dispatcher, rendered with hand-built props. The store that raises
 * notices and the clipboard write live in apply.client.spec.
 */
import { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { en as commonEn } from '@qilin-agent/client-locale/src/locales/en.ts'
import { registerToasts } from '../src/client/toast/register.ts'
import { ToastEntry, WorkspaceToast } from '../src/client/toast/Toast.tsx'
import { RowActionToast } from '../src/client/toast/RowActionToast.tsx'
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import type { ToastDisplayInjected } from '../src/client/contract/toast.ts'
import type { RowToastState } from '../src/client/contract/slots.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)
const tEn = makeTranslate(en, commonEn)

/** Selector hook over one fixed snapshot: how the renderer binds an injected source. */
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

/** The global standard seat every root-scope entry receives (nothing the notices read). */
const standard = {
  useSessions: hook({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
  useSessionStatus: hook(new Map()),
  useSessionRetainInfo: () => undefined,
  usePanelInfo: (selector: (info: { activePanelId: null }) => unknown) => selector({ activePanelId: null }),
  useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined }),
  useRemoteAccess: () => true,
  useWorkspaces: hook({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
} as unknown as GlobalStandardProps

describe('RowActionToast', () => {
  it('renders nothing while no notice is displayed', () => {
    const renderSlot = vi.fn()
    const view = render(<RowActionToast useToast={hook(null)} dismissToast={vi.fn()} renderSlot={renderSlot} {...standard} />)
    expect(view.container.childElementCount).toBe(0)
    expect(renderSlot).not.toHaveBeenCalled()
  })

  it('dispatches the current notice to its keyed presentation', () => {
    const dismissToast = vi.fn()
    const renderSlot = vi.fn(() => null)
    const notice: RowToastState = { kind: 'sessionIdCopied', seq: 7 }
    render(<RowActionToast useToast={hook(notice)} dismissToast={dismissToast} renderSlot={renderSlot} {...standard} />)
    expect(renderSlot).toHaveBeenCalledWith(
      'workspace.toast',
      { ...notice, dismissToast },
      { entryKey: 'sessionIdCopied' },
    )
  })
})

describe('WorkspaceToast', () => {
  it.each([
    ['plain' as const, 'Session ID copied'],
    ['success' as const, 'Session ID copied'],
    ['warning' as const, 'Copy failed. Try again.'],
  ])('presents %s display text through the shared primitive', (tone, text) => {
    const props = { seq: 1, text, tone, onDone: vi.fn(), renderFactorySlot: vi.fn(), useFactorySlot: vi.fn(), ...standard }
    render(<WorkspaceToast {...props} />)
    expect(screen.getByText(text).textContent).toBe(text)
  })

  it('remounts on a new display identity and keeps its own completion callback', () => {
    const onDone = vi.fn()
    const view = render(<WorkspaceToast seq={1} text="Copy failed. Try again." tone="warning" onDone={onDone} renderFactorySlot={vi.fn()} useFactorySlot={vi.fn()} {...standard} />)
    view.rerender(<WorkspaceToast seq={2} text="Copy failed. Try again." tone="warning" onDone={onDone} renderFactorySlot={vi.fn()} useFactorySlot={vi.fn()} {...standard} />)
    expect(screen.getByText('Copy failed. Try again.')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('ToastEntry', () => {
  it('renders the Factory with the display mapping, sequence, and dismissal', () => {
    const dismissToast = vi.fn()
    const renderFactorySlot = vi.fn(() => null)
    const display = (_notice: { kind: string }, translate: (key: string) => string) =>
      ({ text: translate('toast.sessionIdCopied'), tone: 'success' as const })
    ToastEntry({
      kind: 'sessionIdCopied', dismissToast, renderFactorySlot, seq: 3, t, display,
    } as never)
    expect(renderFactorySlot).toHaveBeenCalledWith('workspace.toast.content', {
      text: 'Session ID 已复制', tone: 'success', seq: 3, onDone: dismissToast,
    })
  })
})

describe('registerToasts', () => {
  /** A registry with the keyed notice slot declared, as the overlay entry declares it. */
  async function bench() {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({ name: 'root', children: { 'workspace.toast': { kind: 'keyed', scope: 'root' } } } as never, () => null)
    return { ctx, slots }
  }

  it('registers one presentation for each notice kind', async () => {
    const { ctx, slots } = await bench()
    registerToasts(ctx)
    await Promise.resolve()
    expect(slots.entries('workspace.toast').map(entry => entry.options.key)).toEqual(['sessionIdCopied', 'sessionIdCopyFailed'])
    const displayOf = (index: number) =>
      (slots.entries('workspace.toast')[index]!.inject as unknown as () => ToastDisplayInjected<'sessionIdCopied' | 'sessionIdCopyFailed'>)()
    expect(displayOf(0).display({ kind: 'sessionIdCopied', seq: 1 }, t, vi.fn()))
      .toEqual({ text: 'Session ID 已复制', tone: 'success' })
    expect(displayOf(1).display({ kind: 'sessionIdCopyFailed', seq: 1 }, t, vi.fn()))
      .toEqual({ text: '复制失败，请重试', tone: 'warning' })
    // The English dictionary serves the same keys.
    expect(displayOf(1).display({ kind: 'sessionIdCopyFailed', seq: 1 }, tEn, vi.fn()))
      .toEqual({ text: 'Copy failed. Try again.', tone: 'warning' })
  })
})
