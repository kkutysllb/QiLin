/**
 * The graph store: the shared view state and its bounded mutation actions.
 *
 * The instance is real (`createTasksGraphStore().create()`), so the specs
 * observe what a mounted canvas observes — snapshot changes through
 * `subscribe`, and the guarded actions that must not notify when nothing
 * moves.
 */
import { describe, expect, it } from 'vitest'
import { createTasksGraphStore } from '../src/client/tasks-graph-store.ts'

/** One fresh instance with a change recorder. */
function fresh() {
  const instance = createTasksGraphStore().create()
  const changes: string[] = []
  instance.subscribe(() => { changes.push(instance.getSnapshot().view) })
  return { instance, changes }
}

describe('createTasksGraphStore defaults', () => {
  it('opens on the list form with a fresh camera and no manual layout', () => {
    const { instance } = fresh()
    expect(instance.getSnapshot()).toEqual({
      view: 'list',
      expanded: {},
      mode: 'tree',
      offsets: {},
      camera: undefined,
    })
  })
})

describe('viewSet', () => {
  it('switches the section form and notifies once per change', () => {
    const { instance, changes } = fresh()
    instance.actions.viewSet('graph')
    expect(instance.getSnapshot().view).toBe('graph')
    // The engine's guard folds a write of the value already in force.
    instance.actions.viewSet('graph')
    instance.actions.viewSet('list')
    expect(changes).toEqual(['graph', 'list'])
  })
})

describe('aggregateToggled', () => {
  it('folds by default and remembers each key independently', () => {
    const { instance, changes } = fresh()
    instance.actions.aggregateToggled('done-agg:s1')
    expect(instance.getSnapshot().expanded).toEqual({ 'done-agg:s1': true })
    instance.actions.aggregateToggled('standby-agg:s1')
    instance.actions.aggregateToggled('done-agg:s1')
    expect(instance.getSnapshot().expanded).toEqual({ 'standby-agg:s1': true })
    expect(changes).toHaveLength(3)
  })
})

describe('modeArranged', () => {
  it('changes the arrangement and clears the manual layout and camera', () => {
    const { instance } = fresh()
    instance.actions.viewSet('graph')
    instance.actions.offsetsDragged({ a: { x: 9, y: 9 } })
    instance.actions.cameraMoved({ k: 1.5, tx: 10, ty: 20, userAdjusted: true })
    instance.actions.modeArranged('grid')
    expect(instance.getSnapshot()).toMatchObject({ mode: 'grid', offsets: {}, camera: undefined })
  })
})

describe('offsetsDragged and offsetsReset', () => {
  it('installs the dragged offsets and resets them wholesale', () => {
    const { instance } = fresh()
    const offsets = { a: { x: 1, y: 2 } }
    instance.actions.offsetsDragged(offsets)
    expect(instance.getSnapshot().offsets).toEqual(offsets)
    instance.actions.offsetsReset()
    expect(instance.getSnapshot().offsets).toEqual({})
  })

  it('ignores a drag that carries the same offsets again', () => {
    const { instance, changes } = fresh()
    const offsets = { a: { x: 1, y: 2 } }
    instance.actions.offsetsDragged(offsets)
    const after = changes.length
    instance.actions.offsetsDragged({ a: { x: 1, y: 2 } })
    expect(changes).toHaveLength(after)
  })
})

describe('cameraMoved', () => {
  it('installs the new camera', () => {
    const { instance } = fresh()
    const camera = { k: 0.5, tx: -4, ty: 8, userAdjusted: true }
    instance.actions.cameraMoved(camera)
    expect(instance.getSnapshot().camera).toEqual(camera)
  })

  it('does not notify when a fit recomputes the identical frame', () => {
    const { instance, changes } = fresh()
    const camera = { k: 1, tx: 0, ty: 0, userAdjusted: false }
    instance.actions.cameraMoved(camera)
    const after = changes.length
    instance.actions.cameraMoved({ k: 1, tx: 0, ty: 0, userAdjusted: false })
    expect(changes).toHaveLength(after)
  })

  it('notifies when the fit result differs only in the user-adjusted bit', () => {
    const { instance, changes } = fresh()
    instance.actions.cameraMoved({ k: 1, tx: 0, ty: 0, userAdjusted: true })
    expect(changes).toHaveLength(1)
  })
})
