/**
 * Workbench vocabulary and the preset-to-tag visibility fold (dual-workbench
 * design, plans/2026-10-05-dual-workbench-web-design.md D2): the tags are a
 * filter over sessions, not a composition change — `general` shows the
 * standard and creator presets, `coding` shows the coding and creator
 * presets, and a preset the fold does not know shows under both so a custom
 * preset can never make its sessions disappear from every list.
 */

/** The two workbench tags the left column switches between. */
export type WorkbenchTag = 'general' | 'coding'

/** Every workbench tag, in switcher order. */
export const WORKBENCH_TAGS: readonly WorkbenchTag[] = ['general', 'coding']

/** The persisted workbench state: active tag plus each tag's remembered new-task preset. */
export interface WorkbenchState {
  /** The tag whose sessions the lists show and whose preset new tasks carry. */
  readonly active: WorkbenchTag
  /** New-task preset per tag; defaults are the D3 mapping (general→standard, coding→ptc). */
  readonly presets: Readonly<Record<WorkbenchTag, string>>
}

/** Factory-fresh state: the general tag with each tag's D3 default preset. */
export const WORKBENCH_DEFAULT_STATE: WorkbenchState = {
  active: 'general',
  presets: { general: 'standard', coding: 'ptc' },
}

/** localStorage key for the per-browser workbench selection. */
export const WORKBENCH_STORAGE_KEY = 'qilin.workbench.v1'

/**
 * Shipped preset ids each tag shows (D2). A preset absent here — a user copy
 * or a future shipped one — is visible under both tags.
 */
export const WORKBENCH_TAG_PRESETS: Readonly<Record<WorkbenchTag, readonly string[]>> = {
  general: ['standard', 'cordis'],
  coding: ['ptc', 'cordis'],
}

/** Every preset id the D2 mapping names; anything else is a custom preset. */
const KNOWN_TAG_PRESETS: ReadonlySet<string> = new Set([
  ...WORKBENCH_TAG_PRESETS.general,
  ...WORKBENCH_TAG_PRESETS.coding,
])

/**
 * Whether a session whose creation header records `preset` appears under one
 * tag. Sessions with no recorded preset (a projection the account has not
 * received yet) stay visible everywhere rather than flashing out of the list,
 * and so does a preset the mapping does not name.
 * @param preset - the session's `agentPreset` projection value.
 * @param tag - the workbench tag whose list is rendered.
 * @returns whether the session belongs to the tag's list.
 */
export function workbenchShows(preset: string | null | undefined, tag: WorkbenchTag): boolean {
  if (preset === undefined || preset === null || !KNOWN_TAG_PRESETS.has(preset)) return true
  return WORKBENCH_TAG_PRESETS[tag].includes(preset)
}

/**
 * Whether one preset-less session shows under `tag` by its Workspace's Git
 * kind (the D2 fallback for sessions that predate the recorded preset): a Git
 * work tree's sessions are coding work, any other directory's are general.
 * `undefined` — still probing, probe failure, or no Workspace — shows the
 * session under both tags, so classification never hides a row on a guess it
 * has not made yet.
 * @param git - the Workspace's Git kind, or `undefined` while unknown.
 * @param tag - the workbench tag whose list is rendered.
 * @returns whether the fallback classifies the session into the tag.
 */
export function workbenchFallbackShows(git: boolean | undefined, tag: WorkbenchTag): boolean {
  if (git === undefined) return true
  return tag === (git ? 'coding' : 'general')
}

/**
 * Validate one rehydrated workbench state. Storage is a durable boundary, so
 * a document shaped by an older or broken build resets to the defaults
 * instead of leaking an unknown tag into the switcher.
 * @param value - the parsed localStorage document.
 * @returns a complete state; unknown shapes collapse to {@link WORKBENCH_DEFAULT_STATE}.
 */
export function rehydrateWorkbenchState(value: unknown): WorkbenchState {
  if (typeof value !== 'object' || value === null) return WORKBENCH_DEFAULT_STATE
  const candidate = value as Partial<WorkbenchState>
  if (candidate.active !== 'general' && candidate.active !== 'coding') return WORKBENCH_DEFAULT_STATE
  // The stored document may hold `presets: null` (or drop the field); the
  // cast states that boundary truth beyond the rehydrated interface's type.
  const presets = candidate.presets as Partial<Record<WorkbenchTag, string>> | null | undefined
  if (presets === undefined || presets === null
    || typeof presets.general !== 'string' || typeof presets.coding !== 'string') {
    return { active: candidate.active, presets: WORKBENCH_DEFAULT_STATE.presets }
  }
  return { active: candidate.active, presets: { general: presets.general, coding: presets.coding } }
}
