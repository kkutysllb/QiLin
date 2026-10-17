// @vitest-environment jsdom
/**
 * MenuGroup markup and its sticky-heading observations: heading identity,
 * viewport-crossing detection, height-driven strip observers, and disposal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MenuGroup, observeStickyMenuGroups } from '../src/MenuGroup.tsx'

class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []

  readonly observed = new Set<Element>()
  readonly options: IntersectionObserverInit
  disconnected = false

  constructor(private readonly callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.options = options
    IntersectionObserverStub.instances.push(this)
  }

  observe(element: Element): void { this.observed.add(element) }

  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }

  emit(entries: readonly Partial<IntersectionObserverEntry>[]): void {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []

  readonly observed = new Set<Element>()
  disconnected = false

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this)
  }

  observe(element: Element): void { this.observed.add(element) }

  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }

  resize(element: Element, height: number): void {
    this.callback(
      [{ target: element, contentRect: { height } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
}

/** One section heading record a spec drives directly. */
interface GroupParts {
  readonly section: HTMLElement
  readonly heading: HTMLElement
  readonly start: HTMLElement
}

/** Build a viewport whose direct children are menu-group sections. */
function buildViewport(sections: number, incomplete = false): { viewport: HTMLElement; groups: GroupParts[] } {
  const viewport = document.createElement('div')
  const groups: GroupParts[] = []
  for (let index = 0; index <= sections; index += 1) {
    const section = document.createElement('section')
    section.setAttribute('data-menu-group', '')
    if (incomplete && index === sections) {
      viewport.append(section)
      continue
    }
    const start = document.createElement('span')
    start.setAttribute('data-menu-group-start', '')
    const heading = document.createElement('div')
    heading.setAttribute('data-menu-group-heading', '')
    heading.textContent = `Group ${index}`
    section.append(start, heading)
    viewport.append(section)
    groups.push({ section, heading, start })
  }
  document.body.append(viewport)
  return { viewport, groups }
}

/** One intersection reading against a viewport whose top edge is zero. */
function reading(target: Element, over: Partial<IntersectionObserverEntry>): Partial<IntersectionObserverEntry> {
  return {
    target,
    rootBounds: { top: 0 } as DOMRectReadOnly,
    boundingClientRect: { top: 0, bottom: 0 } as DOMRectReadOnly,
    time: 1,
    isIntersecting: true,
    ...over,
  }
}

beforeEach(() => {
  IntersectionObserverStub.instances = []
  ResizeObserverStub.instances = []
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('MenuGroup markup', () => {
  it('names one section by its own heading and renders the rows', () => {
    const view = render(<MenuGroup label="Files"><button type="button">a.ts</button></MenuGroup>)
    const section = view.container.querySelector('section')!
    const heading = section.querySelector('[data-menu-group-heading]')!
    expect(section.getAttribute('role')).toBe('group')
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.textContent).toBe('Files')
    expect(section.querySelector('[data-menu-group-start]')?.getAttribute('aria-hidden')).toBe('true')
    expect(view.getByRole('button', { name: 'a.ts' })).toBeDefined()
  })

  it('renders without children', () => {
    const view = render(<MenuGroup label="Empty" />)
    expect(view.container.querySelector('section')?.textContent).toBe('Empty')
  })
})

describe('observeStickyMenuGroups', () => {
  it('acquires nothing without groups or without the observer APIs', () => {
    const empty = document.createElement('div')
    observeStickyMenuGroups(empty)()
    expect(IntersectionObserverStub.instances).toHaveLength(0)

    const { viewport } = buildViewport(1)
    vi.unstubAllGlobals()
    const dispose = observeStickyMenuGroups(viewport)
    expect(() => { dispose() }).not.toThrow()
    expect(viewport.querySelector('[data-menu-group-heading]')?.hasAttribute('data-stuck')).toBe(false)
  })

  it('drops sections missing their heading or sentinel', () => {
    const { viewport, groups } = buildViewport(1, true)
    observeStickyMenuGroups(viewport)
    expect(groups).toHaveLength(1)
    expect(IntersectionObserverStub.instances[0]!.observed).toEqual(new Set([groups[0]!.start]))
  })

  it('marks a section stuck once a sentinel above the top and a crossing strip agree', () => {
    const { viewport, groups } = buildViewport(2)
    observeStickyMenuGroups(viewport)
    const startObserver = IntersectionObserverStub.instances[0]!
    expect(startObserver.options).toMatchObject({ root: viewport, threshold: [0, 1] })
    expect(ResizeObserverStub.instances[0]!.observed).toEqual(new Set([viewport]))

    ResizeObserverStub.instances[0]!.resize(viewport, 300)
    const stripObserver = IntersectionObserverStub.instances[1]!
    expect(stripObserver.options).toMatchObject({ root: viewport, rootMargin: '0px 0px -299px 0px', threshold: 0 })
    expect(stripObserver.observed).toEqual(new Set(groups.map(group => group.section)))

    startObserver.emit([reading(groups[0]!.start, { boundingClientRect: { top: -5 } as DOMRectReadOnly, time: 10 })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: -5, bottom: 40 } as DOMRectReadOnly, time: 11,
    })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(true)
    expect(groups[1]!.heading.hasAttribute('data-stuck')).toBe(false)
  })

  it('ignores stale, rootless, and unknown observations', () => {
    const { viewport, groups } = buildViewport(1)
    observeStickyMenuGroups(viewport)
    const startObserver = IntersectionObserverStub.instances[0]!
    ResizeObserverStub.instances[0]!.resize(viewport, 200)
    const stripObserver = IntersectionObserverStub.instances[1]!

    startObserver.emit([
      reading(document.createElement('span'), { time: 3 }),
      reading(groups[0]!.start, { rootBounds: null, time: 4 }),
      reading(groups[0]!.start, { boundingClientRect: { top: -1 } as DOMRectReadOnly, time: 5 }),
    ])
    stripObserver.emit([
      reading(document.createElement('section'), { time: 6 }),
      reading(groups[0]!.section, { rootBounds: null, time: 7 }),
      reading(groups[0]!.section, { boundingClientRect: { top: -1, bottom: 30 } as DOMRectReadOnly, time: 8 }),
    ])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(true)

    // An observation older than the last one for the same group cannot unstick it.
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: 5, bottom: 9 } as DOMRectReadOnly, time: 2, isIntersecting: false,
    })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(true)

    // A section that stops crossing the strip unsticks; the sentinel reading keeps the top fact.
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: -1, bottom: 4 } as DOMRectReadOnly, time: 9, isIntersecting: false,
    })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)

    // The strip reading also owns the "above" fact: a section back in normal flow unsticks.
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: 5, bottom: 30 } as DOMRectReadOnly, time: 12,
    })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)
    // A sentinel below the fold keeps it unstuck even while the strip still crosses.
    startObserver.emit([reading(groups[0]!.start, { boundingClientRect: { top: 4 } as DOMRectReadOnly, time: 13 })])
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: 6, bottom: 30 } as DOMRectReadOnly, time: 14,
    })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)
  })

  it('rebuilds the strip observer only when the viewport height moves', () => {
    const { viewport } = buildViewport(1)
    observeStickyMenuGroups(viewport)
    const resize = ResizeObserverStub.instances[0]!
    resize.resize(document.createElement('div'), 400)
    expect(IntersectionObserverStub.instances).toHaveLength(1)
    resize.resize(viewport, 400)
    expect(IntersectionObserverStub.instances).toHaveLength(2)
    resize.resize(viewport, 400)
    expect(IntersectionObserverStub.instances).toHaveLength(2)
    const first = IntersectionObserverStub.instances[1]!
    resize.resize(viewport, 500)
    const second = IntersectionObserverStub.instances[2]!
    expect(first.disconnected).toBe(true)
    // The replaced observer's queued callback commits nothing.
    first.emit([reading(document.createElement('section'), { time: 9 })])
    second.emit([reading(document.createElement('section'), { time: 9 })])
    expect(IntersectionObserverStub.instances).toHaveLength(3)
  })

  it('stops observing and clears managed attributes on disposal', () => {
    const { viewport, groups } = buildViewport(1)
    const dispose = observeStickyMenuGroups(viewport)
    const startObserver = IntersectionObserverStub.instances[0]!
    const sizeObserver = ResizeObserverStub.instances[0]!
    sizeObserver.resize(viewport, 100)
    const stripObserver = IntersectionObserverStub.instances[1]!
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: -2, bottom: 20 } as DOMRectReadOnly, time: 2,
    })])
    startObserver.emit([reading(groups[0]!.start, { boundingClientRect: { top: -2 } as DOMRectReadOnly, time: 3 })])
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(true)

    dispose()
    expect(startObserver.disconnected).toBe(true)
    expect(stripObserver.disconnected).toBe(true)
    expect(sizeObserver.disconnected).toBe(true)
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)

    // Queued callbacks after disposal change nothing and acquire nothing.
    const observers = IntersectionObserverStub.instances.length
    stripObserver.emit([reading(groups[0]!.section, {
      boundingClientRect: { top: -2, bottom: 20 } as DOMRectReadOnly, time: 9,
    })])
    startObserver.emit([reading(groups[0]!.start, { boundingClientRect: { top: -2 } as DOMRectReadOnly, time: 9 })])
    sizeObserver.resize(viewport, 777)
    expect(IntersectionObserverStub.instances).toHaveLength(observers)
    expect(groups[0]!.heading.hasAttribute('data-stuck')).toBe(false)
    expect(() => { dispose() }).not.toThrow()
  })
})
