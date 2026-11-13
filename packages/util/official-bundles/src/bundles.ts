/**
 * The bundle package names the QiLin installation offers, hides, orders, marks
 * experimental, or installs on demand. The Host admits bundles from these lists
 * and the Plugins page renders from them, so neither keeps a copy of its own.
 */

/**
 * Built-in profile layers and bundles with no page of their own. Their Host
 * availability and activation stay intact; the Plugins page leaves them out
 * because switching the composition they build would strand the session.
 */
export const HIDDEN_BUNDLES: ReadonlySet<string> = new Set([
  '@qilin-agent/base',
  '@qilin-agent/web-app',
  '@qilin-agent/headless',
  '@qilin-agent/sdk-app',
  '@qilin-agent/acp-app',
  '@qilin-agent/sdk-minimal',
])

/**
 * The optional bundles the Plugins page always holds on its main list, in this
 * order. {@link MORE_BUNDLES}, not this list, decides whether a bundle appears
 * on the main list.
 */
export const EXTENSION_BUNDLES: readonly string[] = [
  '@qilin-agent/agent-team-profile',
  '@qilin-agent/experimental-schedule-bundle',
  '@qilin-agent/experimental-voice-input-bundle',
  '@qilin-agent/experimental-auto-review',
]

/**
 * The optional bundles the main list leaves out until the profile enables them;
 * the More list holds every eligible bundle and ranks these last, in this order.
 */
export const MORE_BUNDLES: readonly string[] = [
  '@qilin-agent/experimental-tool-worktree',
  '@qilin-agent/experimental-cot-translation-bundle',
  '@qilin-agent/experimental-terminal-bundle',
  '@qilin-agent/experimental-session-search',
  '@qilin-agent/experimental-session-titles-bundle',
  '@qilin-agent/experimental-badge-skill-bundle',
  '@qilin-agent/experimental-ralph-bundle',
  '@qilin-agent/experimental-plugin-market-bundle',
]

/**
 * Official bundles the Plugins page marks with the Experimental badge. A bundle
 * outside this set renders without the badge and belongs to the built-in plugin
 * group, so promotion is one deletion here rather than a rename of the packages.
 */
export const EXPERIMENTAL_BUNDLES: ReadonlySet<string> = new Set([
  '@qilin-agent/experimental-auto-review',
  '@qilin-agent/experimental-badge-skill-bundle',
  '@qilin-agent/experimental-cot-translation-bundle',
  '@qilin-agent/experimental-forge-bundle',
  '@qilin-agent/experimental-plugin-market-bundle',
  '@qilin-agent/experimental-ralph-bundle',
  '@qilin-agent/experimental-session-search',
  '@qilin-agent/experimental-session-titles-bundle',
  '@qilin-agent/experimental-terminal-bundle',
  '@qilin-agent/experimental-tool-worktree',
  '@qilin-agent/experimental-voice-input-bundle',
])

/**
 * Bundles the product no longer ships. A profile that still selects one keeps
 * booting: app-boot drops the name from `qilin.profile.bundles` while loading the
 * profile and reports the removal, instead of failing on a bundle nothing installs.
 */
export const RETIRED_BUNDLES: ReadonlySet<string> = new Set([
  '@qilin-agent/experimental-inspector-profile',
])

/**
 * Bundles a profile's selected bundle replaces, keyed by the replacing bundle. The
 * forge bundle inserts the same `worktree` and `tool-worktree` rows the standalone
 * worktree bundle ships, so a profile that keeps both selects duplicate ids and the
 * rows those ids feed stay read-only; selecting the replacing bundle retires the other.
 */
export const SUPERSEDED_BUNDLES: Readonly<Record<string, readonly string[]>> = {
  '@qilin-agent/experimental-forge-bundle': ['@qilin-agent/experimental-tool-worktree'],
}

/**
 * Public QiLin releases the Plugins page offers for on-demand installation.
 * Nothing named here ships inside the QiLin distribution: selecting one installs
 * it into the running installation before its profile layer applies, and the
 * generated catalog in `@qilin-agent/app-boot` carries its display metadata.
 * The list is empty while the product ships no on-demand provider backend, and
 * every consumer then offers nothing and shows no on-demand affordance.
 */
export const ON_DEMAND_BUNDLES: readonly string[] = []
