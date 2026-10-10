/**
 * DSH-era module-name aliases.
 *
 * QiLin renamed every harness package (`@deepseek-ai/cordis` → `@qilin-agent/kylin`,
 * `@deepseek-ai/dsh-client-ui-slots` → `@qilin-agent/client-ui-slots`, …), but the
 * DSH plugin ecosystem ships prebuilt bundles whose factories `require()` the
 * old names. The static platform aliases keep those `require` calls resolvable
 * against QiLin's module table, and {@link dshCompatModuleId} canonicalizes the
 * package-name edges (boot-graph `inject`/`external` lists) onto the renamed
 * rows. The mapping mirrors the mechanical rewrite table of the vendored
 * channel sync (`dsh-coding-sidebar` `scripts/sync-to-qilin.mjs` IMPORT_MAP) —
 * keep the two tables consistent by hand: this package is the runtime source.
 * @module @qilin-agent/dsh-compat/aliases
 */

/**
 * Exact aliases for the DSH-era platform (static) module names, including the
 * bare `cordis` spelling some bundles require. Keys are DSH-era specifiers;
 * values are QiLin platform module names (each also a static seed-table key).
 */
export const DSH_PLATFORM_MODULE_ALIASES: Readonly<Record<string, string>> = {
  'cordis': '@qilin-agent/kylin',
  '@deepseek-ai/cordis': '@qilin-agent/kylin',
  '@deepseek-ai/schemastery': '@qilin-agent/schemastery',
  '@deepseek-ai/dsh-client-store': '@qilin-agent/client-store',
  '@deepseek-ai/dsh-client-ui-slots': '@qilin-agent/client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives': '@qilin-agent/client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit': '@qilin-agent/client-ui-dockkit',
}

/**
 * Exact aliases for DSH-era application package names, which no prefix rule
 * reaches: the DSH CLI application (`@deepseek-ai/dsh`) is
 * `@qilin-agent/cli` here. Applications stay out of
 * {@link DSH_PLATFORM_MODULE_ALIASES} because the browser shell resolves every
 * value of that table against its static seed table, which carries platform
 * modules only.
 */
export const DSH_APPLICATION_MODULE_ALIASES: Readonly<Record<string, string>> = {
  '@deepseek-ai/dsh': '@qilin-agent/cli',
}

/** The scoped prefix every renamed DSH engine package shares. */
const DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'

/** The QiLin scope the prefix rule maps package heads onto. */
const QILIN_SCOPE = '@qilin-agent/'

/**
 * Package heads whose QiLin name is not the mechanical `dsh-` strip. The DSH
 * client module system (`client-runtime`) is QiLin's `client-modules`; the
 * Cordis runner and tool family, the agent preset, and the DSH-SDK subagent
 * provider carry QiLin names without a `cordis` or `dsh` head.
 */
const DSH_PACKAGE_RENAMES: Readonly<Record<string, string>> = {
  'client-runtime': 'client-modules',
  'tool-cordis': 'tool-kylin',
  'ui-cordis': 'client-ui-kylin',
  'cordis-host-runner': 'kylin-host-runner',
  'cordis-client-runner': 'kylin-client-runner',
  'agent-preset': 'agent-presets',
  'subagent-dsh-sdk': 'subagent-qilin-sdk',
  // QiLin classifies these capability packages as experimental, so their
  // published names carry the \`experimental-\` prefix the classification policy
  // requires (upstream keeps the un-prefixed name inside its own group).
  'hook-protocol': 'experimental-hook-protocol',
  'hooks-claude-code': 'experimental-hooks-claude-code',
  'hooks-codex': 'experimental-hooks-codex',
  'webhook': 'experimental-webhook',
  'webhook-github': 'experimental-webhook-github',
  'tool-terminal': 'experimental-tool-terminal',
  'tool-ralph': 'experimental-tool-ralph',
  'tool-session-query': 'experimental-tool-session-query',
  'skill-badge': 'experimental-skill-badge',
  'session-title-all-prompts-llm': 'experimental-session-title-all-prompts-llm',
}

/**
 * Canonicalize one module specifier for QiLin's module graph: an exact
 * platform or application alias wins; a scoped `@deepseek-ai/dsh-<pkg>[/subpath]` name maps
 * onto `@qilin-agent/<pkg>[/subpath]` with the rename table applied to the package
 * head; every other specifier (including unrenamed `@deepseek-ai/*` names such
 * as `@qilin-agent/schemastery`, which QiLin keeps verbatim) passes through
 * unchanged.
 * @param specifier - the specifier a manifest edge or a bundle `require` named.
 * @returns the QiLin-canonical specifier for graph and seed-table lookups.
 */
export function dshCompatModuleId(specifier: string): string {
  const exact = DSH_PLATFORM_MODULE_ALIASES[specifier] ?? DSH_APPLICATION_MODULE_ALIASES[specifier]
  if (exact !== undefined) return exact
  if (!specifier.startsWith(DSH_PACKAGE_PREFIX)) return specifier
  const [head = '', ...subpath] = specifier.slice(DSH_PACKAGE_PREFIX.length).split('/')
  const renamed = DSH_PACKAGE_RENAMES[head] ?? head
  return QILIN_SCOPE + [renamed, ...subpath].join('/')
}
