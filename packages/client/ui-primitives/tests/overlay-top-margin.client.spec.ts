// @vitest-environment jsdom
/** Overlays keep clear of the desktop frame's reserved top strip. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { overlayTopMargin } from '../src/overlay-top-margin.ts'

function frame(clearance: string | null, fullscreen: boolean): void {
  if (fullscreen) document.documentElement.setAttribute('data-fullscreen', '')
  else document.documentElement.removeAttribute('data-fullscreen')
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => (name === '--dsh-frame-top-clearance' ? clearance ?? '' : ''),
  } as CSSStyleDeclaration)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-fullscreen')
})

describe('overlayTopMargin', () => {
  it('keeps the overlay floor when the frame publishes no clearance', () => {
    frame(null, false)
    expect(overlayTopMargin(64)).toBe(64)
  })

  it('clears the frame strip plus 20px in a windowed desktop', () => {
    frame('38', false)
    expect(overlayTopMargin(0)).toBe(58)
    expect(overlayTopMargin(80)).toBe(80)
  })

  it('keeps only the 20px gap in fullscreen', () => {
    frame('38', true)
    expect(overlayTopMargin(0)).toBe(20)
    expect(overlayTopMargin(32)).toBe(32)
  })

  it('never pushes an overlay away from an anchor inside the top strip', () => {
    frame('38', false)
    // The anchor's bottom edge plus the gap is below the frame clearance, so
    // the panel may sit next to the control that opened it.
    expect(overlayTopMargin(12, { top: 6, bottom: 30 }, 4)).toBe(34)
    // An anchor below the strip leaves the clearance rule in charge.
    expect(overlayTopMargin(12, { top: 120, bottom: 140 }, 4)).toBe(58)
    // A scrolled-away anchor (negative top) does not cap the margin.
    expect(overlayTopMargin(12, { top: -40, bottom: -20 }, 4)).toBe(58)
  })
})
