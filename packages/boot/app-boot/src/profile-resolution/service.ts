/** Package metadata resolved through one profile resolution registration. */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Service, type Context } from '@qilin-agent/kylin'
import type { PluginLocalizedMeta } from '@qilin-agent/package-manifest'
import {
  barePackageName,
  installRuntimeInterception,
  registerWorkerResolution,
  type RuntimeInterception,
  type ProfileResolutionRegistration,
} from './resolver.ts'
import type { RuntimeResolution } from '../profile.ts'
import { readPluginMeta } from '../package-meta.ts'

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Deterministic package lookup for configured plugin specifiers. */
    pluginPackages: PluginPackages
  }
}

/** The package that owns a resolved module. */
export interface PluginPackage {
  /** Manifest package name. */
  name: string
  /** Manifest version when declared. */
  version: string | undefined
  /** Absolute package directory. */
  dir: string
  /** Absolute package.json path. */
  manifestPath: string
  /** Parsed manifest shared by metadata readers. */
  manifest: Record<string, unknown>
}

/** Optional runtime resolver installed and owned by {@link PluginPackages}. */
export interface PluginPackagesConfig {
  /** Complete package table; omit it to expose native package lookup only. */
  generation?: RuntimeResolution
  /** Enforce the table or compare it with a materialized fallback. */
  behavior?: RuntimeInterception
  /** Recompute the launch generation from disk for {@link PluginPackages.refresh}; the launcher supplies its own sources. */
  recompute?: () => Promise<RuntimeResolution>
}

function readPackage(dir: string, fallbackName: string): PluginPackage | undefined {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const name = manifest.name
  const version = manifest.version
  return {
    name: typeof name === 'string' ? name : fallbackName,
    version: typeof version === 'string' ? version : undefined,
    dir,
    manifestPath,
    manifest,
  }
}

/** Package lookup shared by metadata consumers in one profile process. */
export class PluginPackages extends Service {
  private packages = new Map<string, PluginPackage | undefined>()
  private current: RuntimeResolution | undefined
  private readonly resolver: ProfileResolutionRegistration | undefined
  private readonly behavior: RuntimeInterception
  private readonly recompute: (() => Promise<RuntimeResolution>) | undefined
  private disposeWorkerResolution: (() => void) | undefined

  constructor(ctx: Context, config: PluginPackagesConfig = {}) {
    super(ctx, 'pluginPackages')
    this.behavior = config.behavior ?? 'enforce'
    this.recompute = config.recompute
    if (config.generation === undefined) return
    this.current = config.generation
    const resolver = installRuntimeInterception(config.generation, this.behavior)
    this.disposeWorkerResolution = registerWorkerResolution(config.generation, this.behavior)
    this.resolver = resolver
    ctx.effect(() => () => {
      this.disposeWorkerResolution?.()
      resolver.dispose()
    }, 'profile package resolution')
  }

  /** The published package generation, or `undefined` when Node resolves packages alone. */
  get resolution(): RuntimeResolution | undefined {
    return this.current
  }

  /**
   * Publish a successor generation for this process and subsequently created Workers. Profile-scoped mappings may
   * leave the table; a retained profile mapping may change its version and declarer while its normalized directory and
   * scope stay. Existing modules and Node caches stay intact, so a caller replaces the loaded modules of an upgrade
   * in place separately.
   * @param generation - fully constructed successor generation.
   * @throws when the profile scope changes; `ResolutionRestartRequired` when a retained mapping changes its
   * normalized directory or scope, an installation mapping changes its metadata or leaves, or a new local name
   * overrides an existing mapping. A caller that stops the replaced plugins first catches it to report a restart.
   */
  replace(generation: RuntimeResolution): void {
    if (this.resolver === undefined) throw new Error('plugin-packages: runtime resolution is not installed')
    this.resolver.replace(generation)
    this.current = generation
    this.packages = new Map()
    this.disposeWorkerResolution?.()
    this.disposeWorkerResolution = registerWorkerResolution(generation, this.behavior)
  }

  /**
   * Recompute the launch generation from disk and publish it for this process and subsequently created Workers.
   * Package contents and loaded modules are not reloaded.
   * @throws when the launcher supplied no recompute for an installed runtime resolution.
   */
  async refresh(): Promise<void> {
    // A service without runtime resolution answers through native lookup, which disk changes already move.
    if (this.resolver === undefined) return
    if (this.recompute === undefined) throw new Error('plugin-packages: the installed runtime resolution cannot be recomputed')
    this.replace(await this.recompute())
  }

  /**
   * Locate the package named by a specifier without requiring a package export.
   * @param specifier - module specifier whose package owns the requested module.
   * @param parentURL - URL whose Node lookup order applies.
   * @returns the parsed package, or undefined when no package owns the request.
   */
  packageOf(specifier: string, parentURL: string): PluginPackage | undefined {
    const name = barePackageName(specifier)
    if (name === undefined) return undefined
    const dir = this.resolver === undefined
      ? packageDirFromParent(name, parentURL)
      : this.resolver.packageDir(name, parentURL)
    if (dir === undefined) return undefined
    const key = JSON.stringify({ dir, name })
    if (!this.packages.has(key)) this.packages.set(key, readPackage(dir, name))
    return this.packages.get(key)
  }

  /**
   * Read display metadata without loading or activating the target plugin.
   * @param specifier - configured package module, including package subpaths.
   * @param parentURL - owning Loader tree's resolution base.
   * @returns local display metadata or its diagnostic; undefined for non-package requests or absent metadata.
   */
  metaOf(specifier: string, parentURL: string): PluginLocalizedMeta | undefined {
    return readPluginMeta(specifier, parentURL)
  }
}

function packageDirFromParent(name: string, parentURL: string): string | undefined {
  for (const searchPath of createRequire(parentURL).resolve.paths(name) as string[]) {
    const candidate = join(searchPath, name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}
