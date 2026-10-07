/**
 * Workbench plugin, browser half. Owns the general/coding workbench selection
 * as one provided `workbench` service: the active tag, each tag's remembered
 * new-task preset, and the preset-to-tag visibility fold. The service is pure
 * state — sessions, remotes, and rebind orchestration stay with the consumer
 * surfaces (the session list today; the right bar and plugin filtering as the
 * dual-workbench slices land), which keeps the dependency edge one-directional.
 */
import { Service, type Context } from '@qilin/kylin'
import { createSnapshotStore, type SnapshotStore } from '@qilin/client-store'
import {
  rehydrateWorkbenchState, workbenchFallbackShows, workbenchShows, WORKBENCH_STORAGE_KEY, WORKBENCH_TAG_PRESETS,
  type WorkbenchState, type WorkbenchTag,
} from './workbench.ts'

export {
  rehydrateWorkbenchState, WORKBENCH_DEFAULT_STATE, WORKBENCH_STORAGE_KEY, WORKBENCH_TAG_PRESETS,
  WORKBENCH_TAGS, workbenchFallbackShows, workbenchShows,
  type WorkbenchState, type WorkbenchTag,
} from './workbench.ts'

declare module '@qilin/kylin' {
  interface Context {
    /** The general/coding workbench selection and its per-tag preset memory. */
    workbench: Workbench
  }
}

/** Consumer face of the workbench state owner, provided as the `workbench` service. */
export interface Workbench {
  /** The persisted selection; subscribes re-render on every switch. */
  readonly state: SnapshotStore<WorkbenchState>
  /**
   * Switch the active tag. Rebinding the on-screen blank session to the tag's
   * preset is the caller's job: this service has no session or remote access.
   * @param tag - the tag to show.
   */
  setActive(tag: WorkbenchTag): void
  /**
   * The new-task preset a tag currently carries: its remembered choice, or
   * the D3 default when the user never diverged.
   * @param tag - the tag asking for its new-task preset.
   * @returns the preset id new sessions in this tag are created with.
   */
  presetFor(tag: WorkbenchTag): string
  /**
   * Remember one tag's new-task preset choice (the per-tag "remember the
   * creator pick" rule). Persistence rides the state store.
   * @param tag - the tag whose choice is recorded.
   * @param presetId - the picked preset id.
   */
  setPresetFor(tag: WorkbenchTag, presetId: string): void
  /**
   * The shipped preset ids one tag's new-task menu offers, in menu order (D2).
   * A roster preset absent from both tags' lists is a custom copy and trails
   * the shipped ones in the menu.
   * @param tag - the tag asking for its menu vocabulary.
   * @returns the tag's shipped preset ids in order.
   */
  tagChoices(tag: WorkbenchTag): readonly string[]
  /**
   * The visibility fold over one session's recorded preset (D2).
   * @param preset - the session's `agentPreset` projection value.
   * @param tag - the tag whose list is rendered.
   * @returns whether the session belongs to the tag's list.
   */
  shows(preset: string | null | undefined, tag: WorkbenchTag): boolean
  /**
   * The visibility fold over one preset-less session's Workspace Git kind (the
   * D2 fallback for sessions predating the recorded preset). Consumed through
   * the service face because the client bundle purity gate forbids cross-plugin
   * value imports of the pure fold.
   * @param git - the Workspace's Git kind, or `undefined` while unknown.
   * @param tag - the tag whose list is rendered.
   * @returns whether the fallback classifies the session into the tag.
   */
  fallbackShows(git: boolean | undefined, tag: WorkbenchTag): boolean
}

/** Implements the workbench state owner; registration is the Service name. */
class WorkbenchServiceImpl extends Service implements Workbench {
  /** Persisted per-browser state; a malformed document resets to the defaults. */
  readonly state: SnapshotStore<WorkbenchState>

  /**
   * @param ctx - client root context.
   */
  constructor(ctx: Context) {
    super(ctx, 'workbench')
    this.state = createSnapshotStore<WorkbenchState>(
      { active: 'general', presets: { general: 'standard', coding: 'ptc' } },
      { persist: { name: WORKBENCH_STORAGE_KEY } },
    )
    // attachPersistence applies the stored document synchronously during the
    // store's creation, so this one validation observes the rehydrated value.
    this.state.set(rehydrateWorkbenchState(this.state.getSnapshot()))
  }

  setActive(tag: WorkbenchTag): void {
    const current = this.state.getSnapshot()
    if (current.active === tag) return
    this.state.set({ ...current, active: tag })
  }

  presetFor(tag: WorkbenchTag): string {
    return this.state.getSnapshot().presets[tag]
  }

  setPresetFor(tag: WorkbenchTag, presetId: string): void {
    const current = this.state.getSnapshot()
    if (current.presets[tag] === presetId) return
    this.state.set({ ...current, presets: { ...current.presets, [tag]: presetId } })
  }

  tagChoices(tag: WorkbenchTag): readonly string[] {
    return WORKBENCH_TAG_PRESETS[tag]
  }

  shows(preset: string | null | undefined, tag: WorkbenchTag): boolean {
    return workbenchShows(preset, tag)
  }

  fallbackShows(git: boolean | undefined, tag: WorkbenchTag): boolean {
    return workbenchFallbackShows(git, tag)
  }
}

/** Required cordis services: none — the owner reads no other client service. */
export const inject: readonly string[] = []

/**
 * Provide the `workbench` service on the client root.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  new WorkbenchServiceImpl(ctx)
}
