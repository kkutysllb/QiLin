// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StateDot } from '@qilin-agent/client-ui-primitives'
import type { StateDotState } from '@qilin-agent/client-ui-primitives'

afterEach(cleanup)

describe('StateDot', () => {
  it.each(['done', 'warning', 'ongoing', 'error', 'idle'] as const)('renders state %s as data-state', (state) => {
    const { container } = render(<StateDot state={state} />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.dataset['state']).toBe(state)
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  it('solid states are spans; ongoing is an svg pixel matrix', () => {
    const { container, rerender } = render(<StateDot state="done" />)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
    rerender(<StateDot state="ongoing" />)
    const matrix = container.firstElementChild as SVGSVGElement
    expect(matrix.tagName).toBe('svg')
    const cells = matrix.querySelectorAll('rect')
    expect(cells).toHaveLength(8)
    // Chase phase: every cell carries its own negative animation delay.
    const delays = [...cells].map(cell => (cell).style.animationDelay)
    expect(new Set(delays).size).toBe(8)
  })

  it('sizes via the size prop in both shapes', () => {
    const { container, rerender } = render(<StateDot state="done" size={12} />)
    const dot = container.firstElementChild as HTMLElement
    expect(dot.style.width).toBe('12px')
    expect(dot.style.height).toBe('12px')
    rerender(<StateDot state="ongoing" size={12} />)
    const ring = container.firstElementChild as SVGSVGElement
    expect(ring.getAttribute('width')).toBe('12')
    expect(ring.getAttribute('height')).toBe('12')
  })

  it('rejects unknown states at the type level', () => {
    const bad = (state: StateDotState) => state
    // @ts-expect-error 'paused' is not one of the five states
    expect(bad('paused')).toBe('paused')
  })
})

describe('StateDot ongoing phase', () => {
  it('pins every loader animation to document time zero on mount', () => {
    const animations = [{ startTime: 42 }, { startTime: 7 }]
    const getAnimations = vi.fn(() => animations)
    const proto = SVGElement.prototype as { getAnimations?: () => { startTime: number }[] }
    proto.getAnimations = getAnimations
    try {
      const { unmount } = render(<StateDot state="ongoing" />)
      expect(getAnimations).toHaveBeenCalledWith({ subtree: true })
      expect(animations.map(animation => animation.startTime)).toEqual([0, 0])
      unmount()
      expect(getAnimations).toHaveBeenCalledTimes(1)
    } finally {
      delete proto.getAnimations
    }
  })

  it('re-pins animations that restart after mount', () => {
    const animations = [{ startTime: 0 }]
    const proto = SVGElement.prototype as { getAnimations?: () => { startTime: number }[] }
    proto.getAnimations = () => animations
    try {
      const { container } = render(<StateDot state="ongoing" />)
      animations[0]!.startTime = 438
      container.querySelector('rect')!.dispatchEvent(new Event('animationstart', { bubbles: true }))
      expect(animations[0]!.startTime).toBe(0)
    } finally {
      delete proto.getAnimations
    }
  })
})
