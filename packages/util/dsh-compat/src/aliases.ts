/**
 * DSH-era module-name aliases.
 *
 * QiLin renamed every harness package (`@deepseek-ai/cordis` → `@qilin/kylin`,
 * `@deepseek-ai/dsh-client-ui-slots` → `@qilin/client-ui-slots`, …), but the
 * DSH plugin ecosystem ships prebuilt bundles whose factories `require()` the
 * old names. The static platform aliases keep those `require` calls resolvable
 * against QiLin's module table, and {@link dshCompatModuleId} canonicalizes the
 * package-name edges (boot-graph `inject`/`external` lists) onto the renamed
 * rows. The mapping mirrors the mechanical rewrite table of the vendored
 * channel sync (`dsh-coding-sidebar` `scripts/sync-to-qilin.mjs` IMPORT_MAP) —
 * keep the two tables consistent by hand: this package is the runtime source.
 * @module @qilin/dsh-compat/aliases
 */

/**
 * Exact aliases for the DSH-era platform (static) module names, including the
 * bare `cordis` spelling some bundles require. Keys are DSH-era specifiers;
 * values are QiLin platform module names (each also a static seed-table key).
 */
export const DSH_PLATFORM_MODULE_ALIASES: Readonly<Record<string, string>> = {
  'cordis': '@qilin/kylin',
  '@deepseek-ai/cordis': '@qilin/kylin',
  '@deepseek-ai/dsh-client-store': '@qilin/client-store',
  '@deepseek-ai/dsh-client-ui-slots': '@qilin/client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives': '@qilin/client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit': '@qilin/client-ui-dockkit',
}

/** The scoped prefix every renamed DSH engine package shares. */
const DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'

/** The QiLin scope the prefix rule maps package heads onto. */
const QILIN_SCOPE = '@qilin/'

/**
 * Package heads whose QiLin name is not the mechanical `dsh-` strip: the
 * DSH client module system (`dsh-client-runtime`) is QiLin's
 * `@qilin/client-modules`.
 */
const DSH_PACKAGE_RENAMES: Readonly<Record<string, string>> = {
  'client-runtime': 'client-modules',
}

/**
 * Canonicalize one module specifier for QiLin's module graph: an exact
 * platform alias wins; a scoped `@deepseek-ai/dsh-<pkg>[/subpath]` name maps
 * onto `@qilin/<pkg>[/subpath]` with the rename table applied to the package
 * head; every other specifier (including unrenamed `@deepseek-ai/*` names such
 * as `@deepseek-ai/schemastery`, which QiLin keeps verbatim) passes through
 * unchanged.
 * @param specifier - the specifier a manifest edge or a bundle `require` named.
 * @returns the QiLin-canonical specifier for graph and seed-table lookups.
 */
export function dshCompatModuleId(specifier: string): string {
  const exact = DSH_PLATFORM_MODULE_ALIASES[specifier]
  if (exact !== undefined) return exact
  if (!specifier.startsWith(DSH_PACKAGE_PREFIX)) return specifier
  const [head = '', ...subpath] = specifier.slice(DSH_PACKAGE_PREFIX.length).split('/')
  const renamed = DSH_PACKAGE_RENAMES[head] ?? head
  return QILIN_SCOPE + [renamed, ...subpath].join('/')
}
