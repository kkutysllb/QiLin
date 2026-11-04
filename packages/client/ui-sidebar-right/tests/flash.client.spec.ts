// @vitest-environment jsdom
/**
 * `flashPane`: the glow a reveal draws once on the pane holding the revealed
 * tab. The mark alternates with the request serial so a repeat restarts, and
 * only the animation this mark started may remove it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { SidebarRightFlash } from '../src/client/service.ts'
import { flashPane } from '../src/client/shell/flash.ts'

afterEach(() => { document.body.innerHTML = '' })

/**
 * Build a root holding one pane marked the way the docking kit marks it.
 * @param attribute - the docked or floating pane marker.
 * @param id - the pane id the request names.
 * @returns the root element and its pane.
 */
function rooted(attribute: 'data-dockkit-pane' | 'data-dockkit-float', id: string): { root: HTMLElement; pane: HTMLElement } {
  const root = document.createElement('div')
  const pane = document.createElement('div')
  pane.setAttribute(attribute, id)
  root.append(pane)
  document.body.append(root)
  return { root, pane }
}

/**
 * Deliver one animation event carrying a name, which jsdom's `Event` does not.
 * @param pane - the element the listener sits on.
 * @param type - the animation event type.
 * @param animationName - the animation the event reports.
 */
function animation(pane: HTMLElement, type: string, animationName: string): void {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  pane.dispatchEvent(event)
}

const request = (paneId: string, serial: number): SidebarRightFlash => ({ paneId, serial } as SidebarRightFlash)

describe('flashPane', () => {
  it('marks nothing without a panel or a request', () => {
    const { root } = rooted('data-dockkit-pane', 'pane-1')
    expect(flashPane(null, request('pane-1', 1))).toBeUndefined()
    expect(flashPane(root, undefined)).toBeUndefined()
  })

  it('marks nothing when no pane answers the request', () => {
    const { root } = rooted('data-dockkit-pane', 'pane-1')
    expect(flashPane(root, request('pane-2', 1))).toBeUndefined()
  })

  it('alternates the mark with the request serial and covers floating panes', () => {
    const docked = rooted('data-dockkit-pane', 'pane-1')
    const cleanup = flashPane(docked.root, request('pane-1', 1))
    expect(docked.pane.dataset.sidebarRightFlash).toBe('odd')
    cleanup?.()
    expect(docked.pane.dataset.sidebarRightFlash).toBeUndefined()
    const floating = rooted('data-dockkit-float', 'pane-2')
    flashPane(floating.root, request('pane-2', 2))
    expect(floating.pane.dataset.sidebarRightFlash).toBe('even')
  })

  it('clears only on the animation this mark started', () => {
    const { root, pane } = rooted('data-dockkit-pane', 'pane-1')
    flashPane(root, request('pane-1', 1))
    // A neighbouring animation on the same pane is not this glow's.
    animation(pane, 'animationend', 'unrelated')
    expect(pane.dataset.sidebarRightFlash).toBe('odd')
    animation(pane, 'animationstart', 'sidebar-right-flash')
    animation(pane, 'animationend', 'unrelated')
    expect(pane.dataset.sidebarRightFlash).toBe('odd')
    animation(pane, 'animationend', 'sidebar-right-flash')
    expect(pane.dataset.sidebarRightFlash).toBeUndefined()
  })

  it('clears a cancelled animation and keeps a descendent target from ending it', () => {
    const { root, pane } = rooted('data-dockkit-pane', 'pane-1')
    const child = document.createElement('span')
    pane.append(child)
    const cleanup = flashPane(root, request('pane-1', 1))
    // A bubbled event from a child is not the pane's own animation, in either direction.
    animation(child, 'animationstart', 'sidebar-right-flash')
    animation(child, 'animationend', 'sidebar-right-flash')
    animation(pane, 'animationstart', 'sidebar-right-flash')
    expect(pane.dataset.sidebarRightFlash).toBe('odd')
    animation(pane, 'animationcancel', 'sidebar-right-flash')
    expect(pane.dataset.sidebarRightFlash).toBeUndefined()
    cleanup?.()
  })
})
