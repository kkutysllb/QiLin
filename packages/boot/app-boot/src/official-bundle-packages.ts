/** Package admission shared by offline catalog generation and release ordering. */

/**
 * Public QiLin releases that the Web and Desktop Plugins page lists for
 * on-demand installation. Each entry is an ordinary bundle installer target:
 * nothing here ships inside the QiLin distribution, and selecting one installs
 * it into the running installation before its profile layer applies.
 */
export const ON_DEMAND_BUNDLES: readonly string[] = [
  '@qilin-agent/subagent-claude-code',
  '@qilin-agent/subagent-codex',
]
