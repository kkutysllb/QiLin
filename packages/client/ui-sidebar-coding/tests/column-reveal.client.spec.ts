// @vitest-environment jsdom
/**
 * The right-column reveal: content opens ask the frame to show the column the
 * coding body is rendered in, type-only opens leave that to their caller, and
 * the command declines while the general tag occupies the column or the
 * composition carries no frame write.
 */
import { describe, expect, it, vi } from 'vitest'
import { createColumnReveal, type ColumnRevealFace } from '../src/client/column-reveal.ts'
import { createBetterSidebarService } from '../src/client/service.ts'
import { createSidebarStore } from '../src/client/state.ts'
import type { Context } from '../src/context-types.ts'

/** A client context whose `ctx.get('sidebarRight')` answers with `face`. */
function contextWith(face: unknown): Context {
  return { get: (name: string) => (name === 'sidebarRight' ? face : undefined) } as unknown as Context
}

describe('createColumnReveal', () => {
  it('expands the column while the coding tag occupies it', () => {
    const toggleExpanded = vi.fn()
    const face: ColumnRevealFace = { isExpanded: () => false, toggleExpanded }
    createColumnReveal(contextWith(face), () => true)()
    expect(toggleExpanded).toHaveBeenCalledTimes(1)
  })

  it('leaves an already expanded column alone', () => {
    const toggleExpanded = vi.fn()
    createColumnReveal(contextWith({ isExpanded: () => true, toggleExpanded }), () => true)()
    expect(toggleExpanded).not.toHaveBeenCalled()
  })

  it('never touches the general tag column', () => {
    const toggleExpanded = vi.fn()
    createColumnReveal(contextWith({ isExpanded: () => false, toggleExpanded }), () => false)()
    expect(toggleExpanded).not.toHaveBeenCalled()
  })

  it('declines without the frame write or with no session surface mounted', () => {
    expect(() => { createColumnReveal(contextWith(undefined), () => true)() }).not.toThrow()
    expect(() => {
      createColumnReveal(contextWith({
        isExpanded: () => false,
        toggleExpanded: () => { throw new Error('sidebarRight: no session surface is mounted') },
      }), () => true)()
    }).not.toThrow()
  })
})

describe('BetterSidebar content opens', () => {
  it('asks for the column on a content open and stays silent on a type-only open', () => {
    const store = createSidebarStore()
    store.setSession('s-1')
    const revealColumn = vi.fn()
    const service = createBetterSidebarService(store, { revealColumn })
    service.registerTab({ id: 'editor', title: 'Editor', component: () => null })
    service.openTab({ type: 'editor', title: 'a.md', path: 'a.md', id: 'editor:a.md' })
    expect(revealColumn).toHaveBeenCalledTimes(1)
    service.openTab({ type: 'editor', title: 'Files' })
    expect(revealColumn).toHaveBeenCalledTimes(1)
  })

  it('does not reveal for an open targeted at another session', () => {
    const store = createSidebarStore()
    store.setSession('s-1')
    const revealColumn = vi.fn()
    const service = createBetterSidebarService(store, { revealColumn })
    service.registerTab({ id: 'editor', title: 'Editor', component: () => null })
    service.openTab({ type: 'editor', title: 'b.md', path: 'b.md', id: 'editor:b.md' }, { sessionId: 's-2' })
    expect(revealColumn).not.toHaveBeenCalled()
  })
})
