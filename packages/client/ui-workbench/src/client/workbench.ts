/**
 * Workbench vocabulary and the preset-to-tag visibility fold (dual-workbench
 * design, plans/2026-10-05-dual-workbench-web-design.md D2): the tags are a
 * filter over sessions, not a composition change.
 *
 * The deployment ships one preset, so both tags name it and the fold admits
 * every session under either tag; the mapping stays in place while the tag
 * surfaces do. A preset the fold does not know shows under both, so a custom
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
  /** New-task preset per tag; both default to the deployment's one shipped preset. */
  readonly presets: Readonly<Record<WorkbenchTag, string>>
}

/** Factory-fresh state: the general tag with the shipped preset. */
export const WORKBENCH_DEFAULT_STATE: WorkbenchState = {
  active: 'general',
  presets: { general: 'ptc', coding: 'ptc' },
}

/** localStorage key for the per-browser workbench selection. */
export const WORKBENCH_STORAGE_KEY = 'qilin.workbench.v1'

/**
 * Shipped preset ids each tag shows (D2). A preset absent here — a user copy
 * or a future shipped one — is visible under both tags.
 */
export const WORKBENCH_TAG_PRESETS: Readonly<Record<WorkbenchTag, readonly string[]>> = {
  general: ['ptc'],
  coding: ['ptc'],
}

/**
 * Shipped preset ids a stored document may still name after the deployment
 * merged them into `ptc`. Storage outlives a release, so a remembered new-task
 * preset that no longer exists resets to the shipped default exactly as an
 * unknown tag does; this map retires with the tag machinery itself.
 */
const RETIRED_TAG_PRESETS: Readonly<Record<string, string>> = {
  standard: 'ptc',
  cordis: 'ptc',
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
 * Validate one rehydrated workbench state. Storage is a durable boundary, so
 * a document shaped by an older or broken build resets to the defaults
 * instead of leaking an unknown tag into the switcher.
 * A remembered new-task preset the deployment no longer ships also resets to
 * the default, because the id it names would fail to compose.
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
  const remembered = (id: string): string => RETIRED_TAG_PRESETS[id] ?? id
  return {
    active: candidate.active,
    presets: { general: remembered(presets.general), coding: remembered(presets.coding) },
  }
}
