// @vitest-environment jsdom
/** The preview frame's navigator seats and its clipped-path marker. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { PreviewFrame, type PreviewFrameProps } from '../src/client/PreviewFrame.tsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const tabActions = { openResource: vi.fn(), openTab: vi.fn(), close: vi.fn(), replace: vi.fn() }
const useTabInfo = (() => ({
  sidebar: { expanded: true, fullscreen: false },
  panel: { id: 'pane-1', isFloating: false },
  tab: {
    id: 'tab-1', kind: 'text', contentId: 'file:///w/a.ts', title: 'a.ts', visible: true,
    navigation: { address: 'file:///w/a.ts', params: undefined, revision: 1 },
    signal: new AbortController().signal,
    actions: tabActions,
  },
})) as unknown as PreviewFrameProps['useTabInfo']

function frame(over: Partial<PreviewFrameProps> & { factories?: (key: string, props: unknown) => ReactNode } = {}) {
  const factoryCalls: { key: string; props: unknown }[] = []
  const { factories, ...rest } = over
  const props: PreviewFrameProps = {
    path: '/w/src/a.ts',
    pathTrigger: {},
    useTabInfo,
    renderFactorySlot: (key: string, props: unknown) => {
      factoryCalls.push({ key, props })
      return factories === undefined ? null : factories(key, props)
    },
    children: createElement('p', null, 'body'),
    ...rest,
  }
  const view = render(createElement(PreviewFrame, props))
  return { view, factoryCalls }
}

it('opens a resource through the navigator factory seat at the content position', () => {
  const { factoryCalls, view } = frame()
  expect(view.container.querySelector('[data-textpreview-content]')).not.toBeNull()
  const navigator = factoryCalls.find(call => call.key === 'sidebar.files.navigator')
  expect(navigator).toBeDefined()
  const seat = navigator?.props as { useTabInfo: unknown; onOpen: (address: string) => void }
  expect(seat.useTabInfo).toBe(useTabInfo)
  seat.onOpen('file:///w/b.ts')
  expect(tabActions.openResource).toHaveBeenCalledWith('file:///w/b.ts', { replaceTab: true })
  // The header's own toggle seat renders with the tab hook only.
  const toggle = factoryCalls.find(call => call.key === 'sidebar.files.navigator.toggle')
  expect(toggle?.props).toEqual({ useTabInfo })
})

it('marks a path that overflows its box and observes both boxes when ResizeObserver exists', () => {
  const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('ResizeObserver', class {
    readonly observe = vi.fn()
    readonly disconnect = vi.fn()
    constructor(_callback: ResizeObserverCallback) { observers.push(this) }
  })
  const descriptors = {
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 120 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 })
  try {
    const { view } = frame()
    const path = view.container.querySelector('[data-textpreview-path]') as HTMLElement
    expect(path.hasAttribute('data-textpreview-path-clipped')).toBe(true)
    expect(observers).toHaveLength(1)
    expect(observers[0]?.observe).toHaveBeenCalledTimes(2)
    cleanup()
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce()
  } finally {
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name)
      else Object.defineProperty(HTMLElement.prototype, name, descriptor)
    }
  }
})

it('leaves the path unmarked when it fits and no ResizeObserver exists', () => {
  vi.stubGlobal('ResizeObserver', undefined)
  const { view } = frame()
  const path = view.container.querySelector('[data-textpreview-path]') as HTMLElement
  expect(path.hasAttribute('data-textpreview-path-clipped')).toBe(false)
})
