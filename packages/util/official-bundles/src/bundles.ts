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
  '@qilin-agent/experimental-agent-team-profile',
  '@qilin-agent/experimental-voice-input-bundle',
  '@qilin-agent/experimental-auto-review',
  '@qilin-agent/experimental-inspector-profile',
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
 * Official bundles the Plugins page marks with the Experimental badge. Every
 * offered option belongs here, including the retired entry a profile may still
 * carry, so the badge never depends on a package name prefix.
 */
export const EXPERIMENTAL_BUNDLES: ReadonlySet<string> = new Set([
  '@qilin-agent/experimental-agent-team-profile',
  '@qilin-agent/experimental-auto-review',
  '@qilin-agent/experimental-badge-skill-bundle',
  '@qilin-agent/experimental-cot-translation-bundle',
  '@qilin-agent/experimental-forge-bundle',
  '@qilin-agent/experimental-inspector-profile',
  '@qilin-agent/experimental-plugin-market-bundle',
  '@qilin-agent/experimental-ralph-bundle',
  '@qilin-agent/experimental-schedule-bundle',
  '@qilin-agent/experimental-session-search',
  '@qilin-agent/experimental-session-titles-bundle',
  '@qilin-agent/experimental-terminal-bundle',
  '@qilin-agent/experimental-tool-worktree',
  '@qilin-agent/experimental-voice-input-bundle',
])

/**
 * Public QiLin releases the Plugins page offers for on-demand installation.
 * Nothing named here ships inside the QiLin distribution: selecting one installs
 * it into the running installation before its profile layer applies, and the
 * generated catalog in `@qilin-agent/app-boot` carries its display metadata.
 * The list is empty while the product ships no on-demand provider backend, and
 * every consumer then offers nothing and shows no on-demand affordance.
 */
export const ON_DEMAND_BUNDLES: readonly string[] = []
