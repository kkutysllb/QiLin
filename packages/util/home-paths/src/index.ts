/**
 * Shared filesystem path helpers for QiLin user data.
 *
 * @module @qilin-agent/home-paths
 */

import { opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Directory name for the default QiLin home under the OS home. */
export const QILIN_HOME_DIR_NAME = '.qilin'

/** Stable user-facing display form for the default QiLin home. */
export const DEFAULT_QILIN_HOME_DISPLAY = `~/${QILIN_HOME_DIR_NAME}`

/** Environment variable that overrides the default QiLin home. */
export const QILIN_HOME_ENV = 'QILIN_HOME'

/** Directory name for the default shared agent configuration root under the OS home. */
export const AGENTS_HOME_DIR_NAME = '.agents'

/** Stable user-facing display form for the default shared agent configuration root. */
export const DEFAULT_AGENTS_HOME_DISPLAY = `~/${AGENTS_HOME_DIR_NAME}`

/** Environment variable that overrides the default shared agent configuration root. */
export const AGENTS_HOME_ENV = 'QILIN_AGENTS_HOME'

/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export async function canonicalizeWatchPath(path: string): Promise<string> {
  let current = resolve(path)
  const missing: string[] = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        // A Windows file-as-parent probe reports ENOENT. Opening the resolved
        // ancestor preserves the cross-platform directory requirement.
        const directory = await opendir(canonical)
        await directory.close()
      }
      return join(canonical, ...missing.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * Resolve the default QiLin home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultQilinHome(): string {
  return join(homedir(), QILIN_HOME_DIR_NAME)
}

/**
 * Resolve the default shared agent configuration root using Node's platform path rules.
 * @returns the absolute default shared agent configuration root.
 */
export function defaultAgentsHome(): string {
  return join(homedir(), AGENTS_HOME_DIR_NAME)
}

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve one user-data root from an explicit path, an environment override, and a default.
 * @param configured - explicit path, which has highest precedence.
 * @param env - environment mapping to read.
 * @param envName - environment variable that overrides the default.
 * @param fallback - default root, used when neither the explicit path nor the environment provides one.
 * @returns the normalized absolute root.
 */
function resolveRoot(
  configured: string | undefined,
  env: Record<string, string | undefined>,
  envName: string,
  fallback: () => string,
): string {
  const fromEnv = env[envName]
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : fallback())
  return resolve(expandHomePath(selected))
}

/**
 * Label one resolved user-data root symbolically for user-facing display.
 * @param resolvedRoot - absolute path returned by the matching resolver.
 * @param defaultRoot - absolute default root whose symbolic label applies to a match.
 * @param defaultLabel - symbolic label for the default root.
 * @param envName - environment variable name that labels any other root.
 * @returns the symbolic label.
 */
function rootDisplay(resolvedRoot: string, defaultRoot: string, defaultLabel: string, envName: string): string {
  return resolvedRoot === resolve(defaultRoot) ? defaultLabel : `$${envName}`
}

/**
 * Resolve the single-root QiLin home.
 *
 * Precedence, highest first: an explicit configured path, `$QILIN_HOME`, then
 * `~/.qilin`. The harness keeps all user data under one root. An empty or
 * whitespace-only `$QILIN_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `QILIN_HOME`.
 * @returns the normalized absolute harness home path.
 */
export function resolveQilinHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  return resolveRoot(configured, env, QILIN_HOME_ENV, defaultQilinHome)
}

/**
 * Resolve the shared agent configuration root.
 *
 * Precedence, highest first: an explicit configured path, `$QILIN_AGENTS_HOME`,
 * then `~/.agents`. The root holds configuration shared with other agent tools,
 * so it stays independent of the QiLin home. An empty or whitespace-only
 * `$QILIN_AGENTS_HOME` is treated as unset, so a blank override never resolves
 * the root to the current working directory.
 * @param configured - explicit shared-root override, which has highest precedence.
 * @param env - environment mapping used to read `QILIN_AGENTS_HOME`.
 * @returns the normalized absolute shared agent configuration root.
 */
export function resolveAgentsHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  return resolveRoot(configured, env, AGENTS_HOME_ENV, defaultAgentsHome)
}

/**
 * Join path segments onto the resolved QiLin home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function qilinHomePath(...segments: string[]): string {
  return join(resolveQilinHome(), ...segments)
}

/**
 * Join path segments onto the resolved Harness home's `cache` directory without creating it; no arguments returns the directory itself.
 * @param optionsOrSegment - explicit home override, or the first path segment; omission uses the default home resolution.
 * @param segments - additional path segments after the first child, if any.
 * @returns the normalized absolute cache path.
 */
export function qilinCachePath(optionsOrSegment: { qilinHome?: string } | string = {}, ...segments: string[]): string {
  if (typeof optionsOrSegment === 'string') return qilinHomePath('cache', optionsOrSegment, ...segments)
  return join(resolveQilinHome(optionsOrSegment.qilinHome), 'cache', ...segments)
}

/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.qilin`, and any configured home is labelled `$QILIN_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveQilinHome}.
 * @returns `~/.qilin` for the default home, otherwise `$QILIN_HOME`.
 */
export function qilinHomeDisplay(resolvedHome: string): string {
  return rootDisplay(resolvedHome, defaultQilinHome(), DEFAULT_QILIN_HOME_DISPLAY, QILIN_HOME_ENV)
}

/**
 * Describe a resolved shared agent configuration root symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default root is labelled
 * `~/.agents`, and any configured root is labelled `$QILIN_AGENTS_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveAgentsHome}.
 * @returns `~/.agents` for the default root, otherwise `$QILIN_AGENTS_HOME`.
 */
export function agentsHomeDisplay(resolvedHome: string): string {
  return rootDisplay(resolvedHome, defaultAgentsHome(), DEFAULT_AGENTS_HOME_DISPLAY, AGENTS_HOME_ENV)
}

/**
 * Upstream-named compat surface for dsh plugins: third-party plugins import
 * this package under its upstream package name and read these upstream-named
 * exports. Every alias resolves to the QiLin implementation, so a dsh plugin
 * observes the home the deployment actually runs (the values above, not the
 * upstream literals).
 */
export const DSH_HOME_DIR_NAME = QILIN_HOME_DIR_NAME
export const DEFAULT_DSH_HOME_DISPLAY = DEFAULT_QILIN_HOME_DISPLAY
export const DSH_HOME_ENV = QILIN_HOME_ENV
export const defaultDshHome = defaultQilinHome
export const resolveDshHome = resolveQilinHome
export const dshHomePath = qilinHomePath
export const dshHomeDisplay = qilinHomeDisplay

/**
 * {@link qilinCachePath} under its upstream name, accepting the upstream
 * `dshHome` option key as well as `qilinHome`.
 * @param optionsOrSegment - the upstream options object, or a path segment.
 * @param segments - remaining path segments.
 * @returns the cache path under the resolved home.
 */
export function dshCachePath(optionsOrSegment: { dshHome?: string } | string = {}, ...segments: string[]): string {
  const normalized = typeof optionsOrSegment === 'object' && optionsOrSegment !== null && 'dshHome' in optionsOrSegment
    ? { qilinHome: optionsOrSegment.dshHome }
    : optionsOrSegment
  return qilinCachePath(normalized as { qilinHome?: string }, ...segments)
}
