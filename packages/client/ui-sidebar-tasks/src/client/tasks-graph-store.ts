/**
 * The tasks page's graph view state: which form the subagents section draws,
 * which aggregate groups the user expanded, and the canvas's arrangement,
 * manual node offsets, and camera — the state that survives the body's
 * unmounts. One bucket per store instance; the registration is session-scoped,
 * so a tree's framing comes back with its Session.
 */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'
import type { NodeOffsets, TaskLayoutMode } from './tasks-graph-layout.ts'

/** Which form the subagents section draws. */
export type TasksGraphViewKind = 'list' | 'graph'

/** The canvas camera: zoom, translate, and whether the user took it over. */
export interface TasksGraphCamera {
  readonly k: number
  readonly tx: number
  readonly ty: number
  /**
   * The user panned or zoomed: the auto-fit policy stops steering the canvas
   * until an arrange resets the framing.
   */
  readonly userAdjusted: boolean
}

/** The graph view's state. */
export interface TasksGraphState {
  /** Which form the subagents section draws; the list stays the default. */
  view: TasksGraphViewKind
  /** Aggregate keys the user expanded, keyed `done-agg:${id}` / `standby-agg:${id}`. */
  expanded: Record<string, boolean>
  /** The canvas arrangement. */
  mode: TaskLayoutMode
  /** Manual node offsets from drags, relative to the auto layout. */
  offsets: NodeOffsets
  /** The canvas camera; `undefined` until the first fit. */
  camera: TasksGraphCamera | undefined
}

/** The store's write set. */
type TasksGraphActions = {
  /**
   * Switch the subagents section's form.
   * @param d - draft state.
   * @param view - the form to show.
   */
  viewSet: (d: TasksGraphState, view: TasksGraphViewKind) => void
  /**
   * Expand or collapse one aggregate group.
   * @param d - draft state.
   * @param key - the aggregate's fold key.
   */
  aggregateToggled: (d: TasksGraphState, key: string) => void
  /**
   * Rearrange the canvas: the new mode clears the manual offsets and the
   * camera, so the next auto-fit frames the fresh arrangement.
   * @param d - draft state.
   * @param mode - the arrangement to apply.
   */
  modeArranged: (d: TasksGraphState, mode: TaskLayoutMode) => void
  /**
   * Record one node drag's offsets, replacing the previous gesture frame.
   * @param d - draft state.
   * @param offsets - the offsets in force after this frame.
   */
  offsetsDragged: (d: TasksGraphState, offsets: NodeOffsets) => void
  /**
   * Drop every manual offset; every node returns to its auto-layout spot.
   * @param d - draft state.
   */
  offsetsReset: (d: TasksGraphState) => void
  /**
   * Move the canvas camera. A frame identical to the one in force writes
   * nothing, so a settled auto-fit cannot loop re-publishing itself.
   * @param d - draft state.
   * @param camera - the camera to put in force.
   */
  cameraMoved: (d: TasksGraphState, camera: TasksGraphCamera) => void
}

/**
 * Declare the graph view's store.
 * @returns the store handle the registration declares.
 */
export function createTasksGraphStore(): EngineStoreHandle<TasksGraphState, TasksGraphActions> {
  return defineStore({
    init: (): TasksGraphState => ({
      view: 'list',
      expanded: {},
      mode: 'tree',
      offsets: {},
      camera: undefined,
    }),
    actions: {
      /**
       * Switch the subagents section's form.
       * @param d - draft state.
       * @param view - the form to show.
       */
      viewSet: (d, view: TasksGraphViewKind) => {
        d.view = view
      },
      /**
       * Expand or collapse one aggregate group. Collapsing removes the key, so
       * the record stays minimal over long sessions.
       * @param d - draft state.
       * @param key - the aggregate's fold key.
       */
      aggregateToggled: (d, key: string) => {
        if (d.expanded[key] === true) Reflect.deleteProperty(d.expanded, key)
        else d.expanded[key] = true
      },
      /**
       * Rearrange the canvas, dropping manual offsets and the camera.
       * @param d - draft state.
       * @param mode - the arrangement to apply.
       */
      modeArranged: (d, mode: TaskLayoutMode) => {
        d.mode = mode
        d.offsets = {}
        d.camera = undefined
      },
      /**
       * Record one node drag's offsets. Offsets equal field-for-field to the
       * ones in force write nothing, so a drag frame that settles cannot loop
       * re-publishing itself.
       * @param d - draft state.
       * @param offsets - the offsets in force after this frame.
       */
      offsetsDragged: (d, offsets: NodeOffsets) => {
        const held = d.offsets
        const heldKeys = Object.keys(held)
        const nextKeys = Object.keys(offsets)
        if (heldKeys.length === nextKeys.length
          && heldKeys.every(key => held[key]?.x === offsets[key]?.x && held[key]?.y === offsets[key]?.y)) return
        d.offsets = offsets
      },
      /**
       * Drop every manual offset.
       * @param d - draft state.
       */
      offsetsReset: (d) => {
        d.offsets = {}
      },
      /**
       * Move the canvas camera; an identical frame writes nothing.
       * @param d - draft state.
       * @param camera - the camera to put in force.
       */
      cameraMoved: (d, camera: TasksGraphCamera) => {
        const held = d.camera
        if (held !== undefined
          && held.k === camera.k
          && held.tx === camera.tx
          && held.ty === camera.ty
          && held.userAdjusted === camera.userAdjusted) return
        d.camera = camera
      },
    },
  })
}
