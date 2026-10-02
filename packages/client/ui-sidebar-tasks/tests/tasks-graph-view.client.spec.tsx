// @vitest-environment jsdom
/**
 * The tasks graph canvas over a real store instance: framing, pan, wheel
 * zoom-to-cursor, node drags, click routing with the slop rule, the control
 * cluster, and the per-kind card text.
 *
 * jsdom measures zero, so each framing test states the viewport it wants by
 * stubbing the wrap's box; gestures ride `fireEvent` plus window-level pointer
 * events, matching how the canvas listens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@qilin/client-test-runtime'
import type { TaskNodeVM, TasksGraphModel } from '../src/client/tasks-graph-model.ts'
import { TasksGraphView } from '../src/client/TasksGraphView.tsx'
import { createTasksGraphStore } from '../src/client/tasks-graph-store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * One view-model node with the given id and kind.
 * @param id - the node id.
 * @param kind - the node kind.
 * @param extra - the fields the test cares about.
 * @returns the node.
 */
function node(id: string, kind: TaskNodeVM['kind'], extra: Partial<TaskNodeVM> = {}): TaskNodeVM {
  return {
    id, kind, parentId: undefined, depth: 0, label: id, secondary: '', running: false,
    current: false, address: undefined, childCount: undefined, aggregateKey: undefined, ...extra,
  }
}

/**
 * One view model from a parent→children index.
 * @param childrenOf - the children index, the root first.
 * @returns the model.
 */
function modelOf(childrenOf: Record<string, TaskNodeVM[]>): TasksGraphModel {
  const nodes: TaskNodeVM[] = [node('root', 'main', { label: 'Root', running: true, current: true })]
  for (const [parent, kids] of Object.entries(childrenOf)) {
    for (const kid of kids) nodes.push(kid)
    void parent
  }
  return { nodes, childrenOf }
}

/** The root with two inactive subagent leaves. */
const TWO = modelOf({ root: [node('a', 'subagent'), node('b', 'subagent')] })

/** The lone-root model, for fit-ceiling math. */
const LONE = modelOf({})

/** A minimal instance store, as the framework mints one per session. */
type Instance = ReturnType<ReturnType<typeof createTasksGraphStore>['create']>

/** A test-local selector hook over the instance. */
function hookOf(inst: Instance) {
  const subscribe = inst.subscribe.bind(inst)
  const getSnapshot = inst.getSnapshot.bind(inst)
  return function useSelector<S>(sel: (snapshot: ReturnType<Instance['getSnapshot']>) => S): S {
    return sel(useSyncExternalStore(subscribe, getSnapshot))
  }
}

/**
 * Mount one canvas.
 * @param model - the view model to lay out.
 * @param setup - store writes to apply before the mount.
 * @returns the rendered view, the store instance, and the click recorder.
 */
function mountGraph(model: TasksGraphModel, setup?: (inst: Instance) => void) {
  const inst = createTasksGraphStore().create()
  setup?.(inst)
  const onNodeClick = vi.fn<(node: TaskNodeVM) => void>()
  const view = render(
    <TasksGraphView
      model={model}
      onNodeClick={onNodeClick}
      useStore={hookOf(inst)}
      actions={inst.actions}
      t={makeTranslate(zh)}
    />,
  )
  const wrap = view.container.querySelector('[data-tasks-graph]') as HTMLElement
  return { view, inst, onNodeClick, wrap }
}

/**
 * State the wrap's viewport box, so fit computes against real numbers.
 * @param wrap - the canvas wrap.
 * @param box - the client box and page offset to fake.
 */
function measure(wrap: HTMLElement, box: { w?: number; h?: number; left?: number; top?: number } = {}) {
  const { w = 0, h = 0, left = 0, top = 0 } = box
  Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: w })
  Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: h })
  vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
    left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top,
    toJSON: () => ({}),
  })
}

/** Run one block with a manually-triggerable ResizeObserver installed. */
function withFakeRO(fn: () => void): void {
  const previous = globalThis.ResizeObserver
  globalThis.ResizeObserver = FakeResizeObserver
  try {
    fn()
  } finally {
    globalThis.ResizeObserver = previous
  }
}

/** A manually resizable ResizeObserver double the canvas can trigger. */
class FakeResizeObserver {
  /** The spec-visible instances, for triggering. */
  static readonly all: FakeResizeObserver[] = []
  /** The observed callback. */
  readonly callback: ResizeObserverCallback
  /** Whether the canvas disconnected. */
  disconnected = false

  /**
   * @param callback - the canvas's resize reaction.
   */
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.all.push(this)
  }

  /**
   * Accept the canvas's registration.
   */
  observe(): void {}

  /**
   * Drop the registration.
   */
  disconnect(): void {
    this.disconnected = true
  }

  /**
   * Unobserve one target; the canvas never calls it.
   */
  unobserve(): void {}

  /**
   * Fire the canvas's reaction once.
   */
  trigger(): void {
    this.callback([], this)
  }
}

describe('TasksGraphView framing', () => {
  /** A fresh two-leaf mount with a measured 500x300 viewport. */
  function measured() {
    const mounted = mountGraph(TWO)
    measure(mounted.wrap, { w: 500, h: 300 })
    return mounted
  }

  it('frames the content when a resize hands it a real viewport', () => {
    withFakeRO(() => {
      const { inst } = measured()
      FakeResizeObserver.all.at(-1)?.trigger()
      const camera = inst.getSnapshot().camera
      expect(camera?.userAdjusted).toBe(false)
      // min(500/524, 300/260) — the width governs.
      expect(camera?.k).toBeCloseTo(500 / 524, 5)
      expect(camera?.tx).toBeCloseTo(0, 5)
    })
  })

  it('caps the fit at the readable zoom for small content', () => {
    withFakeRO(() => {
      const mounted = mountGraph(LONE)
      measure(mounted.wrap, { w: 500, h: 300 })
      FakeResizeObserver.all.at(-1)?.trigger()
      // min(500/280, 300/130) would over-zoom a lone card.
      expect(mounted.inst.getSnapshot().camera?.k).toBe(1.25)
    })
  })

  it('does nothing while the viewport measures zero', () => {
    const { inst } = mountGraph(TWO)
    expect(inst.getSnapshot().camera).toBeUndefined()
  })

  it('leaves a user-held camera alone on mount', () => {
    const held = { k: 1, tx: 12, ty: 34, userAdjusted: true }
    const { inst } = mountGraph(TWO, (instance) => { instance.actions.cameraMoved(held) })
    expect(inst.getSnapshot().camera).toEqual(held)
  })

  it('refits on double-click even over a user-held camera, handing steering back', () => {
    const { inst, wrap } = mountGraph(TWO, (instance) => {
      instance.actions.cameraMoved({ k: 1, tx: 12, ty: 34, userAdjusted: true })
    })
    measure(wrap, { w: 500, h: 300 })
    fireEvent.dblClick(wrap)
    const camera = inst.getSnapshot().camera
    expect(camera?.k).toBeCloseTo(500 / 524, 5)
    expect(camera?.userAdjusted).toBe(false)
  })

  it('refits from the fit control', () => {
    const { inst, view } = measured()
    fireEvent.click(view.getByRole('button', { name: zh['graph.fit'] }))
    expect(inst.getSnapshot().camera?.k).toBeCloseTo(500 / 524, 5)
  })

  it('shows the frame transform of the camera in force', () => {
    const { view, wrap } = mountGraph(TWO, (inst) => {
      inst.actions.cameraMoved({ k: 2, tx: 5, ty: 6, userAdjusted: true })
    })
    void wrap
    const frame = view.container.querySelector('[data-tasks-graph-frame]')
    expect(frame?.getAttribute('transform')).toBe('translate(5 6) scale(2)')
  })
})

describe('TasksGraphView resize', () => {
  it('reframes on resize while the camera is auto, and stops once the user holds it', () => {
    const previous = globalThis.ResizeObserver
    globalThis.ResizeObserver = FakeResizeObserver
    try {
      const { inst, wrap } = mountGraph(TWO)
      measure(wrap, { w: 500, h: 300 })
      const observer = FakeResizeObserver.all.at(-1)
      observer?.trigger()
      expect(inst.getSnapshot().camera?.userAdjusted).toBe(false)
      // The user pans; the resize reaction must stop steering.
      fireEvent.pointerDown(wrap, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(window, { clientX: 40, clientY: 0 })
      fireEvent.pointerUp(window)
      const held = inst.getSnapshot().camera
      observer?.trigger()
      expect(inst.getSnapshot().camera).toEqual(held)
      // Unmount disconnects the observation.
      cleanup()
      expect(observer?.disconnected).toBe(true)
    } finally {
      globalThis.ResizeObserver = previous
    }
  })
})

describe('TasksGraphView pan', () => {
  it('moves the camera by the drag delta and hands the camera to the user', () => {
    const { inst, wrap } = mountGraph(TWO)
    fireEvent.pointerDown(wrap, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 20 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().camera).toMatchObject({ k: 1, tx: 50, ty: 10, userAdjusted: true })
  })

  it('ignores travel at or under the click slop', () => {
    const { inst, wrap } = mountGraph(TWO)
    fireEvent.pointerDown(wrap, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 2, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 5, clientY: 0 })
    fireEvent.pointerUp(window)
    // 2px stays a click; the next 3px crosses the slop and moves by itself.
    expect(inst.getSnapshot().camera).toMatchObject({ tx: 3, ty: 0 })
  })

  it('starts only from a left button', () => {
    const { inst, wrap } = mountGraph(TWO)
    fireEvent.pointerDown(wrap, { button: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().camera).toBeUndefined()
  })

  it('never starts from the control cluster', () => {
    const { inst, wrap, view } = mountGraph(TWO)
    const controls = view.container.querySelector('[data-tasks-graph-controls]') as HTMLElement
    fireEvent.pointerDown(controls, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 0 })
    void wrap
    expect(inst.getSnapshot().camera).toBeUndefined()
  })
})

describe('TasksGraphView wheel zoom', () => {
  it('zooms toward the cursor and marks the camera user-held', () => {
    const { inst, wrap } = mountGraph(TWO)
    measure(wrap, { w: 500, h: 300 })
    fireEvent.wheel(wrap, { deltaY: -100, clientX: 100, clientY: 50 })
    const camera = inst.getSnapshot().camera
    expect(camera?.userAdjusted).toBe(true)
    const k = Math.exp(0.15)
    expect(camera?.k).toBeCloseTo(k, 5)
    expect(camera?.tx).toBeCloseTo(100 - 100 * k, 5)
    expect(camera?.ty).toBeCloseTo(50 - 50 * k, 5)
  })

  it('clamps the zoom to the configured ceiling', () => {
    const { inst, wrap } = mountGraph(TWO)
    measure(wrap, { w: 500, h: 300 })
    fireEvent.wheel(wrap, { deltaY: -100_000, clientX: 0, clientY: 0 })
    expect(inst.getSnapshot().camera?.k).toBe(2.5)
  })
})

describe('TasksGraphView controls', () => {
  it('steps the zoom around the viewport center', () => {
    const { inst, view } = mountGraph(TWO)
    fireEvent.click(view.getByRole('button', { name: zh['graph.zoomIn'] }))
    expect(inst.getSnapshot().camera?.k).toBe(1.25)
    fireEvent.click(view.getByRole('button', { name: zh['graph.zoomOut'] }))
    expect(inst.getSnapshot().camera?.k).toBeCloseTo(1, 10)
  })

  it('clamps the button zoom at both ends', () => {
    const { inst, view } = mountGraph(TWO, (instance) => {
      instance.actions.cameraMoved({ k: 3, tx: 0, ty: 0, userAdjusted: true })
    })
    // 3*0.8 clamps after the multiply, not to the ceiling itself.
    fireEvent.click(view.getByRole('button', { name: zh['graph.zoomOut'] }))
    expect(inst.getSnapshot().camera?.k).toBeCloseTo(2.4, 10)
    fireEvent.click(view.getByRole('button', { name: zh['graph.zoomIn'] }))
    expect(inst.getSnapshot().camera?.k).toBe(2.5)
    fireEvent.click(view.getByRole('button', { name: zh['graph.zoomOut'] }))
    expect(inst.getSnapshot().camera?.k).toBeCloseTo(2, 10)

    cleanup()
    const other = mountGraph(TWO, (instance) => {
      instance.actions.cameraMoved({ k: 0.1, tx: 0, ty: 0, userAdjusted: true })
    })
    fireEvent.click(other.view.getByRole('button', { name: zh['graph.zoomOut'] }))
    expect(other.inst.getSnapshot().camera?.k).toBe(0.2)
  })

  it('arranges into each mode and marks the active chip', () => {
    const { inst, view } = mountGraph(TWO)
    for (const mode of ['compact', 'grid', 'tree'] as const) {
      fireEvent.click(view.getByRole('button', { name: new RegExp(zh[`graph.mode.${mode}`]) }))
      expect(inst.getSnapshot().mode).toBe(mode)
      expect(view.container.querySelector(`[data-tasks-graph-mode="${mode}"]`)?.getAttribute('aria-pressed')).toBe('true')
    }
    // An arrange also clears the manual layout and the camera.
    expect(inst.getSnapshot().offsets).toEqual({})
  })

  it('offers the reset only while a node is displaced, and resets on click', () => {
    const { inst, view, wrap } = mountGraph(TWO)
    expect(view.container.querySelector('[data-tasks-graph-reset]')).toBeNull()
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(a, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().offsets.a).toBeDefined()
    const reset = view.container.querySelector('[data-tasks-graph-reset]') as HTMLElement
    fireEvent.click(reset)
    expect(inst.getSnapshot().offsets).toEqual({})
    void wrap
  })
})

describe('TasksGraphView node gestures', () => {
  const NESTED = modelOf({
    root: [node('a', 'subagent')],
    a: [node('g', 'subagent')],
  })

  it('drags a card with its subtree, scaled by the zoom', () => {
    const { inst, view } = mountGraph(NESTED, (instance) => {
      instance.actions.cameraMoved({ k: 2, tx: 0, ty: 0, userAdjusted: true })
    })
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(a, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 4 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().offsets).toEqual({ a: { x: 15, y: 2 }, g: { x: 15, y: 2 } })
  })

  it('drags one card alone under Alt', () => {
    const { inst, view } = mountGraph(NESTED)
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(a, { button: 0, clientX: 0, clientY: 0, altKey: true })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().offsets).toEqual({ a: { x: 12, y: 0 } })
  })

  it('writes nothing while the pointer stays under the slop', () => {
    const { inst, view } = mountGraph(NESTED)
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(a, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 2, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().offsets).toEqual({})
  })

  it('starts a card drag only from a left button', () => {
    const { inst, view } = mountGraph(NESTED)
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(a, { button: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 0 })
    fireEvent.pointerUp(window)
    expect(inst.getSnapshot().offsets).toEqual({})
  })
})

describe('TasksGraphView activation', () => {
  it('routes a plain click and both keyboard activations', () => {
    const { onNodeClick, view } = mountGraph(TWO)
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    expect(a.getAttribute('role')).toBe('button')
    expect(a.getAttribute('tabindex')).toBe('0')
    fireEvent.click(a)
    expect(onNodeClick).toHaveBeenCalledTimes(1)
    expect(onNodeClick.mock.calls[0]?.[0]?.id).toBe('a')
    fireEvent.keyDown(a, { key: 'Enter' })
    fireEvent.keyDown(a, { key: ' ' })
    expect(onNodeClick).toHaveBeenCalledTimes(3)
    fireEvent.keyDown(a, { key: 'Tab' })
    expect(onNodeClick).toHaveBeenCalledTimes(3)
  })

  it('marks the current Session card', () => {
    const { view } = mountGraph(TWO)
    const root = view.container.querySelector('[data-tasks-graph-node="root"]') as Element
    expect(root.getAttribute('aria-current')).toBe('true')
  })

  it('suppresses the click after a pan or a card drag actually moved', () => {
    const { onNodeClick, view, wrap } = mountGraph(TWO)
    const a = view.container.querySelector('[data-tasks-graph-node="a"]') as Element
    fireEvent.pointerDown(wrap, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 50, clientY: 0 })
    fireEvent.pointerUp(window)
    fireEvent.click(a)
    expect(onNodeClick).not.toHaveBeenCalled()

    fireEvent.pointerDown(a, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 })
    fireEvent.pointerUp(window)
    fireEvent.click(a)
    expect(onNodeClick).not.toHaveBeenCalled()
  })

  it('draws non-activating kinds inert', () => {
    const model = modelOf({ root: [node('x', 'diagnostic')] })
    const { onNodeClick, view } = mountGraph(model)
    const x = view.container.querySelector('[data-tasks-graph-node="x"]') as Element
    expect(x.getAttribute('aria-disabled')).toBe('true')
    expect(x.getAttribute('role')).toBeNull()
    fireEvent.click(x)
    expect(onNodeClick).not.toHaveBeenCalled()
  })
})

describe('TasksGraphView card text', () => {
  it('renders the per-kind badge, label, and status words', () => {
    const model: TasksGraphModel = {
      nodes: [
        node('root', 'main', { label: 'Root', running: true, current: true }),
        node('s1', 'subagent', { label: 'Scout', secondary: zh['subagents.mode.continuable'], running: true, depth: 1, parentId: 'root' }),
        node('d-agg', 'done-agg', { label: 'Alpha · Beta', secondary: '6', childCount: 6, aggregateKey: 'done-agg:root', depth: 1, parentId: 'root' }),
        node('w-agg', 'standby-agg', { label: 'Watcher', childCount: 7, aggregateKey: 'standby-agg:root', depth: 1, parentId: 'root' }),
        node('ph', 'placeholder', { label: '', childCount: 2, depth: 1, parentId: 'root' }),
        node('dg', 'diagnostic', { label: 'bad', depth: 1, parentId: 'root' }),
        node('run1', 'run', { label: 'Pipeline', childCount: 2, running: true, depth: 1, parentId: 'root' }),
        node('phase1', 'phase', { label: 'plan', childCount: 1, depth: 2, parentId: 'run1' }),
        node('phase0', 'phase', { label: '', childCount: 0, depth: 2, parentId: 'run1' }),
        node('m1', 'member', { label: 'M1', secondary: 'ok', depth: 3, parentId: 'phase1' }),
        node('m2', 'member', { label: 'M2', secondary: '', running: true, depth: 3, parentId: 'phase1' }),
        node('m3', 'member', { label: 'M3', depth: 3, parentId: 'phase1' }),
        node('m4', 'member', { label: 'M4', secondary: '', depth: 3, parentId: 'phase1' }),
        node('d2', 'done-agg', { label: 'Bare', secondary: '', aggregateKey: 'done-agg:x', depth: 1, parentId: 'root' }),
        node('ph2', 'phase', { label: 'bare', depth: 2, parentId: 'run1' }),
        node('s2', 'subagent', { label: '', secondary: '', depth: 1, parentId: 'root' }),
      ],
      childrenOf: {},
    }
    const { view } = mountGraph({ ...model, childrenOf: {
      root: [...model.nodes.slice(1, 7), model.nodes[13] as TaskNodeVM, model.nodes[15] as TaskNodeVM],
      run1: [...model.nodes.slice(7, 9), model.nodes[14] as TaskNodeVM] as TaskNodeVM[],
      phase1: model.nodes.slice(9, 13),
    } })
    const text = (id: string) =>
      (view.container.querySelector(`[data-tasks-graph-node="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text('root')).toContain(zh['graph.badge.main'])
    expect(text('root')).toContain(zh['graph.status.running'])
    expect(text('s1')).toContain(zh['graph.badge.subagent'])
    expect(text('s1')).toContain(zh['graph.status.running'])
    expect(text('d-agg')).toContain('Alpha · Beta +6')
    expect(text('d-agg')).toContain(`${zh['graph.badge.done']} 6`)
    expect(text('w-agg')).toContain(zh['graph.badge.standby'])
    expect(text('ph')).toContain(zh['graph.badge.placeholder'])
    expect(text('ph')).toContain(zh['graph.loading'])
    expect(text('dg')).toContain(zh['graph.badge.diagnostic'])
    expect(text('dg')).toContain(zh['graph.status.idle'])
    expect(text('run1')).toContain(zh['graph.badge.run'])
    expect(text('phase1')).toContain(zh['graph.badge.phase'])
    expect(text('phase0')).toContain(zh['graph.unphased'])
    expect(text('m1')).toContain(zh['graph.badge.member'])
    expect(text('m1')).toContain('ok')
    expect(text('m2')).toContain(zh['graph.status.running'])
    // A settled member shows its recorded outcome, else the kind word.
    expect(text('m3')).toContain(zh['graph.badge.member'])
    expect(text('m4')).toContain(zh['graph.badge.member'])
    // Aggregates and phases tolerate a missing count; a wordless card is a read.
    expect(text('d2')).toContain(zh['graph.badge.done'])
    expect(text('ph2')).toContain('0')
    expect(text('s2')).toContain(zh['graph.loading'])
    expect(text('s2')).toContain(zh['graph.status.idle'])
  })

  it('elides a label past the card budget and keeps one within it', () => {
    const model = modelOf({ root: [node('长'.repeat(30), 'subagent'), node('短', 'subagent')] })
    const { view } = mountGraph(model)
    const text = view.container.querySelector('[data-tasks-graph]')?.textContent ?? ''
    expect(text).toContain('…')
    expect(text).toContain('短')
  })
})
