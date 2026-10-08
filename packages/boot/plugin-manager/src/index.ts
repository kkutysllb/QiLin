/** Current-profile plugin and bundle management over shared qilin plugin operations. */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withFileLock, writeFileAtomic } from '@qilin-agent/atomic-write'
import { Context } from '@qilin-agent/kylin'
import type { EntryOptions } from '@qilin-agent/kylin-plugin-loader'
import type { PatchOptions } from '@qilin-agent/kylin-plugin-include'
import z from '@qilin-agent/schemastery'
import { TypertRemoteService, Remote } from '@qilin-agent/typert-protocol'
import { pluginEntryId, readPluginInventory } from '@qilin-agent/host-plugin-inventory'
import {
  readPluginMeta, readProfileManifest, resolveBundleDir, loadOverlayPatches, composeEntries, reconcileProfilePatches,
  readProfilePatches, OPTIONAL_BUNDLES, PROFILE_TEMPLATES, profileLayerUpdatable,
  evaluatePluginCompatibility, readProfileCompatibility, readProfileVersionExemptions, setProfileVersionExemption,
  PROFILE_COMPATIBILITY_FILENAME,
} from '@qilin-agent/app-boot'
import { bundlePatchOf } from '@qilin-agent/dsh-compat'
import type {} from '@qilin-agent/hmr'
import type { ProfileContext, ProfileManifest } from '@qilin-agent/app-boot'
import {
  bundleManifest, readProfileRegistry, registryArguments, runProfilePnpm, saveManifest, viewProfilePackage,
} from './operations.ts'
import { classifyInstallFailure } from './install-failure.ts'
import { InvalidInstallSpecError, dependencySpec, parseInstallSpec, type ParsedInstallSpec } from './install-spec.ts'
import { checkGithubConnection } from './github-connection.ts'
import { writePluginEnabled } from './patch.ts'
import { incompatiblePlugin, ManagementFailure } from './failure.ts'
import { attributeFailure, NPMMIRROR_REGISTRY, normalizeRegistry, REGISTRY_URL, registryPlan } from './registry.ts'
import { approveBuilds, readPendingBuilds } from './build-approval.ts'
import type {
  ReadOnlyReason,
  BundleInfo, BundleRowInfo, ChangeResult, CommunityPluginEntry, CommunityPluginSnapshot, InspectOptions, InstallBundleOptions,
  ManagementError, PackageResult, PluginAudience, PluginChange, PluginEntryId, PluginInfo, PluginInspectProblem, PluginInstallCancellation,
  PluginInstallProgress, PluginInstallRequestId, PluginRegistries, PluginSpecInspection, PluginUpdateEntry, PluginUpdateSnapshot, Registry,
} from './types.ts'
export type * from './types.ts'
export { classifyInstallFailure, type InstallFailureFacts } from './install-failure.ts'
export { InvalidInstallSpecError, parseInstallSpec, type ParsedInstallSpec } from './install-spec.ts'

/** The pnpm executable and the limits for package diagnostics and registry lookups. */
export interface Config {
  /** The pnpm executable name or path; resolved through `PATH` like the `qilin plugin` command. */
  pnpmCommand?: string
  /** Maximum retained pnpm diagnostic bytes per operation. */
  outputBytes?: number
  /** Maximum time to wait for another process's profile package operation. */
  lockWaitMs?: number
  /** Bound on one registry lookup an inspection runs, in milliseconds. */
  inspectTimeoutMs?: number
  /** Maximum duration of the GitHub repository connection check before installation, in milliseconds. */
  githubConnectionTimeoutMs?: number
  /** The registry lookups and installations ask first, as an http(s) URL; absent, the one pnpm's own configuration names. */
  registry?: string
  /**
   * Registries asked in turn, as http(s) URLs, while the one before is unreachable or holds no copy of the package.
   * A registry outside this set and `registry` is asked alone, and so is the one pnpm's own configuration names
   * unless that is npm's own registry or one of these.
   */
  fallbackRegistries?: string[]
}

const protectedModules = new Set([
  '@qilin-agent/plugin-manager', '@qilin-agent/kylin-plugin-loader',
  '@qilin-agent/kylin-plugin-include', '@qilin-agent/api-gateway',
  '@qilin-agent/host-webserver', '@qilin-agent/client-modules',
  '@qilin-agent/client-ui-settings-plugin-inventory', '@qilin-agent/client-ui-plugin-manager',
  '@qilin-agent/host-plugin-inventory', '@qilin-agent/typert-registry',
  '@qilin-agent/api-remotes',
  '@qilin-agent/kylin-plugin-timer', '@qilin-agent/client-connection',
  '@qilin-agent/host-frontend-static', '@qilin-agent/tools',
  '@qilin-agent/hmr',
])

/** The profile files an installation writes and a failed or cancelled one restores. */
const RESTORED_FILES = ['package.json', 'pnpm-lock.yaml'] as const

/** pnpm's colour escapes, which a JSON answer may be wrapped in. */
const ANSI_SEQUENCE = /\x1b\[[0-9;]*m/g

/** npm registry endpoint that answers one package's dist-tags. */
const REGISTRY_DIST_TAGS = 'https://registry.npmjs.org/-/package'

/** GitHub repository search endpoint for the plugin topic. */
const GITHUB_SEARCH = 'https://api.github.com/search/repositories'

/** Results one catalog page asks for; GitHub answering a full page means there may be more. */
const GITHUB_PAGE_SIZE = 50

/** Bound on one registry or GitHub lookup, in milliseconds. */
const LOOKUP_TIMEOUT_MS = 10_000

/** Flatten only the groups addressable by the profile's patch composer. */
function flatten(rows: EntryOptions[]): EntryOptions[] {
  return rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config as EntryOptions[]) : [])])
}

/** Preserve the exact observed diagnostic, including non-Error failures. */
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** An expected refusal keeps its code; anything else becomes an operation error carrying its exact diagnostic. */
function managementError(error: unknown): ManagementError {
  if (!(error instanceof ManagementFailure)) return { code: 'operation-error', diagnostic: messageOf(error) }
  return { code: error.code, ...error.incompatible === undefined ? {} : { incompatible: error.incompatible } }
}

/** The caller stopped an installation; its files are restored before this is thrown. */
class InstallCancelledError extends Error {
  constructor() {
    super('Installation cancelled')
    this.name = 'InstallCancelledError'
  }
}

/** One installation the manager owns until its call settles. */
interface InstallControl {
  readonly abort: AbortController
  /** `applying` once pnpm has exited and the bundle is being selected and loaded, which cannot be stopped. */
  phase: 'installing' | 'applying'
  /** Settlement of the install call, whichever way it ended. */
  settled: Promise<void>
}

/** A manifest field that is a string, when the manifest carries one. */
function stringField(manifest: object, field: string): string | undefined {
  const value = (manifest as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

/** The fields of the qilin installation's own manifest the manager reads. */
interface InstallationManifest {
  dependencies?: Record<string, string>
}

/** What a package manifest says about the package: identity, one-liner, whether it is a bundle, and the registry it was read from.
 * A package is a bundle when it declares a patch path in either manifest channel, the declaration profile loading accepts. */
function inspectionOf(kind: 'registry' | 'path', manifest: object, registry: Registry): Extract<PluginSpecInspection, { status: 'accepted' }> {
  const bundle = bundlePatchOf(manifest) !== undefined
  const name = stringField(manifest, 'name')
  const version = stringField(manifest, 'version')
  const description = stringField(manifest, 'description')
  return {
    status: 'accepted', kind, bundle, registry,
    ...name === undefined ? {} : { name },
    ...version === undefined ? {} : { version },
    ...description === undefined || description === '' ? {} : { description },
  }
}

function refused(problem: PluginInspectProblem, reason: string): PluginSpecInspection {
  return { status: 'refused', problem, reason }
}

/** The refusal `pnpm view --json` prints on stdout, `{ error: { code, message } }`, as one log line; empty for anything else. */
function printedError(printed: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(printed || 'null') }
  catch { return '' /* not JSON: nothing pnpm printed as a refusal */ }
  const error = typeof parsed === 'object' && parsed !== null ? (parsed as { error?: unknown }).error : undefined
  if (typeof error !== 'object' || error === null) return ''
  const { code, message } = error as { code?: unknown; message?: unknown }
  return [code, message].filter((part): part is string => typeof part === 'string').join('  ')
}

/**
 * The spec's parsed form, which the GitHub connection check reads: a form the parser refuses reads as a registry name,
 * and no host answers for it.
 */
function parsedForRegistry(spec: string): ParsedInstallSpec {
  try {
    return parseInstallSpec(spec)
  } catch (error) {
    /* v8 ignore next 2 -- parseInstallSpec throws nothing but its own refusal */
    if (!(error instanceof InvalidInstallSpecError)) throw error
    return { kind: 'registry', spec, name: spec }
  }
}

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Persistent management of the current profile's composition and packages. */
    pluginManager: PluginManager
  }
}

/** Manage profile files and apply their declared reload lifecycle. */
export class PluginManager extends TypertRemoteService {
  static inject = ['loader', 'profileContext']
  static Config: z<Config> = z.object({
    pnpmCommand: z.string().default('pnpm'),
    outputBytes: z.number().step(1).min(1).default(16384),
    lockWaitMs: z.number().step(1).min(0).default(120000),
    inspectTimeoutMs: z.number().step(1).min(1000).default(20000),
    githubConnectionTimeoutMs: z.number().step(1).min(1000).default(5000),
    registry: z.string().pattern(REGISTRY_URL),
    fallbackRegistries: z.array(z.string().pattern(REGISTRY_URL)).default([NPMMIRROR_REGISTRY]),
  })
  private readonly ownerEntryId: string | undefined
  private readonly packageOperations = new Set<Promise<unknown>>()
  private readonly profile: ProfileContext
  private readonly outputBytes: number
  private readonly lockWaitMs: number
  private readonly inspectTimeoutMs: number
  private readonly githubConnectionTimeoutMs: number
  private readonly pnpmCommand: string
  private readonly configuredRegistries: Omit<PluginRegistries, 'resolved'>
  private readonly ownerContext: Context
  private readonly abort = new AbortController()
  /** Installations by request id, from their call until it settles. */
  private readonly installs = new Map<PluginInstallRequestId, InstallControl>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'pluginManager')
    this.ownerEntryId = ctx.fiber.entry?.id
    this.ownerContext = ctx
    this.profile = ctx.profileContext
    this.outputBytes = (config as Required<Config>).outputBytes
    this.lockWaitMs = (config as Required<Config>).lockWaitMs
    this.inspectTimeoutMs = (config as Required<Config>).inspectTimeoutMs
    this.githubConnectionTimeoutMs = (config as Required<Config>).githubConnectionTimeoutMs
    this.pnpmCommand = (config as Required<Config>).pnpmCommand
    this.configuredRegistries = {
      registry: config.registry === undefined ? null : normalizeRegistry(config.registry),
      fallbackRegistries: (config as Required<Config>).fallbackRegistries.map(normalizeRegistry),
    }
    ctx.effect(() => async () => {
      this.abort.abort()
      await Promise.allSettled([...this.packageOperations])
    }, 'plugin-manager: package cancellation')
  }

  /** Read exact plugin-version exemptions saved in this profile.
   * @returns Accepted package-name@version keys with the runtime versions they may run on, and any
   * record or file problem the reader rejected, which the caller reports instead of failing.
   */
  @Remote
  listVersionExemptions(): { exemptions: Record<string, string[]>; warnings: string[] } {
    const { exemptions, warnings } = readProfileCompatibility(this.profile.dir)
    return { exemptions, warnings }
  }

  /** Grant or revoke one exact plugin/runtime exemption and reevaluate live plugins.
   * @param packageVersion Exact manifest package name followed by @ and its version; never an installation spec or alias.
   * @param runtimeVersion Exact current qilin version for grants; revocation may name a previous runtime.
   * @param enabled Whether to grant rather than revoke the exemption.
   * @param acceptRisk Required true for grants after the user accepts possible crashes and data loss.
   * @returns Saved and runtime outcomes. Startup-only profiles require restart.
   */
  @Remote
  setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult> {
    return this.change(result => this.configure(async () => {
      await setProfileVersionExemption(this.profile.dir, packageVersion, runtimeVersion, enabled, acceptRisk === true)
      result.warnings = await this.reload()
    }), { stage: 'enable', target: packageVersion, enabled }, 'bundle')
  }

  /** Read current plugins, including why a row cannot be changed through the profile patch.
   * @returns Current runtime entries with persistent patch targets.
   */
  @Remote
  async listPlugins(): Promise<PluginInfo[]> {
    const rows = flatten(composeEntries([readProfilePatches('qilin', this.profile)]))
    const snapshot = await readPluginInventory(this.ctx)
    return snapshot.entries.map((entry) => {
      const actual = [...this.ctx.loader.entries()].find(row => row.id === entry.entryId)
      const candidates = rows.filter(row => row.id === actual?.options.id)
      const candidate = candidates[0]
      if (protectedModules.has(entry.moduleName) || entry.entryId === this.ownerEntryId) {
        return { ...entry, readOnlyReason: 'management-required' as const }
      }
      if (candidate === undefined || candidates.length > 1 || candidate.name !== entry.moduleName
        || actual?.parent.tree.ctx.fiber.entry?.id !== 'include') {
        return { ...entry, readOnlyReason: 'unaddressable' as const }
      }
      return { ...entry, patchId: candidate.id }
    })
  }

  /** Read the profile's installed bundles, the bundles this qilin installation supplies, and the selected names that are not bundles.
   * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
   * @returns Package versions, one-liners, rows, activation selections, whether the installation offers the
   * bundle, and removal availability.
   */
  @Remote
  listBundles(): Promise<BundleInfo[]> {
    const manifest = readProfileManifest('qilin', this.profile.dir)
    const exemptions = readProfileVersionExemptions(this.profile.dir)
    const audiences = manifest.qilin?.profile?.audiences ?? {}
    const audienceOf = (name: string): PluginAudience => audiences[name] ?? 'both'
    const selected = manifest.qilin?.profile?.bundles ?? []
    const recorded = manifest.dependencies ?? {}
    const dependencies = Object.keys(manifest.dependencies ?? {})
    const installation = JSON.parse(readFileSync(this.profile.installAnchor, 'utf8')) as InstallationManifest
    const names = [...new Set([...selected, ...dependencies, ...Object.keys(installation.dependencies ?? {})])]
    // The shipped template names the layers an installation owns; a profile
    // switches one off through its rows, never by dropping the layer.
    const builtIn = [...PROFILE_TEMPLATES[this.profile.name]?.bundles ?? []]
    const bundles: BundleInfo[] = []
    for (const name of names) {
      const installed = dependencies.includes(name)
      const optional = OPTIONAL_BUNDLES.includes(name)
      const updatable = profileLayerUpdatable(name, builtIn)
      const removable = installed && !Object.hasOwn(installation.dependencies ?? {}, name)
      // Bundle resolution reads the installation first, so a profile dependency the installation manifest also
      // names, like one it forbids removing, is not the loaded copy.
      const sourceOf = (packageName?: string): { source?: string } =>
        removable ? { source: dependencySpec(name, recorded[name] as string, this.profile.dir, packageName) } : {}
      const enabled = selected.includes(name)
      try {
        const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor)
        if (info === undefined) {
          if (enabled) bundles.push({ name, ...sourceOf(), enabled, installed, optional, updatable, removable, audience: audienceOf(name), error: { code: 'not-bundle' }, rows: [], overrides: [] })
          continue
        }
        const readOnlyReason = this.layerLock(name, builtIn)
        const compatibility = evaluatePluginCompatibility(info, exemptions)
        if (compatibility !== undefined && !compatibility.exempted) {
          throw new ManagementFailure('incompatible-version', [incompatiblePlugin(compatibility)])
        }
        // Localized display text reads through the package's own exported locale files; a metadata
        // diagnostic rides along while the bundle stays fully manageable.
        const meta = readPluginMeta(info.name ?? name, pathToFileURL(join(this.profile.dir, 'package.json')).href)
        bundles.push({ name, ...(info.version === undefined ? {} : { version: info.version }),
          ...meta === undefined ? {} : { meta },
          ...(info.description === undefined || info.description === '' ? {} : { description: info.description }),
          ...sourceOf(info.name),
          enabled, installed, optional, updatable, removable: removable && readOnlyReason === undefined,
          audience: audienceOf(name),
          ...(readOnlyReason === undefined ? {} : { readOnlyReason }),
          ...this.declaredRows(name, info) })
      } catch (error) {
        if (enabled || installed) {
          bundles.push({ name, ...sourceOf(), enabled, installed, optional, updatable, removable,
            audience: audienceOf(name), error: managementError(error), rows: [], overrides: [] })
        }
      }
    }
    return Promise.resolve(bundles)
  }

  /** Compare each manageable layer with its registry's `latest` dist-tag.
   * A name the registry cannot answer for keeps its row with a null `latestVersion`, so a network
   * failure reads as an unknown version rather than as a failed listing. A name the Host cannot read
   * as a bundle is left out: it is a plain dependency the profile selected, not a layer to upgrade.
   * @returns One row per readable layer {@link listBundles} lists, in the same order.
   */
  @Remote
  async checkUpdates(): Promise<PluginUpdateSnapshot> {
    const bundles = (await this.listBundles()).filter(bundle => bundle.error === undefined)
    return {
      entries: await Promise.all(bundles.map(async (bundle): Promise<PluginUpdateEntry> => ({
        name: bundle.name,
        currentVersion: bundle.version ?? null,
        latestVersion: await npmLatest(bundle.name),
      }))),
    }
  }

  /** Search GitHub for repositories the plugin topic tags.
   * @param query - additional search text; empty searches the topic alone.
   * @param page - one-based result page; anything but a positive safe integer reads as page 1.
   * @returns The page's repositories and whether GitHub reports another page.
   * @throws {Error} when GitHub answers a status outside 2xx.
   */
  @Remote
  async catalog(query: string, page: number): Promise<CommunityPluginSnapshot> {
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
    const q = ['topic:dsh-plugin', query.trim()].filter(Boolean).join(' ')
    const response = await fetch(
      `${GITHUB_SEARCH}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${String(GITHUB_PAGE_SIZE)}&page=${String(safePage)}`,
      { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    )
    if (!response.ok) throw new Error(`qilin: GitHub search failed with HTTP ${String(response.status)}`)
    const body = await response.json() as { items?: unknown }
    const items = Array.isArray(body.items) ? body.items : []
    return { entries: items.flatMap(communityEntry), page: safePage, hasMore: items.length === GITHUB_PAGE_SIZE }
  }

  /** Read the registries this manager asks: the configured first one, its fallbacks in order, and what pnpm's own configuration names.
   * @returns The registries in pnpm's comparison form; null is the one pnpm's own configuration names, `resolved` as pnpm reads it now.
   */
  @Remote
  async registries(): Promise<PluginRegistries> {
    return {
      ...this.configuredRegistries, fallbackRegistries: [...this.configuredRegistries.fallbackRegistries],
      resolved: await readProfileRegistry(this.profile.dir, {
        ...this.profile.packageManager ?? { command: this.pnpmCommand }, timeoutMs: this.inspectTimeoutMs,
      }),
    }
  }

  /** Read what a spec names before installing it.
   * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
   * @param options The registry asked first.
   * @param signal Ends a registry lookup early.
   * @returns The package the spec names, or why it is refused.
   */
  @Remote
  async inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection> {
    let parsed
    try {
      parsed = parseInstallSpec(spec)
    } catch (error) {
      /* v8 ignore next 2 -- parseInstallSpec throws nothing but its own refusal */
      if (!(error instanceof InvalidInstallSpecError)) throw error
      return refused('invalid-spec', error.reason)
    }
    const manifest = readProfileManifest('qilin', this.profile.dir)
    const installation = JSON.parse(readFileSync(this.profile.installAnchor, 'utf8')) as InstallationManifest
    const known = new Set([
      ...manifest.qilin?.profile?.bundles ?? [],
      ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(installation.dependencies ?? {}),
    ])
    const plan = registryPlan(options?.registry, await this.registries())
    const registry = plan[0] as Registry
    switch (parsed.kind) {
      case 'git': return { status: 'accepted', kind: 'git', bundle: null, registry, host: parsed.host }
      case 'tarball':
        if (parsed.path !== undefined && !existsSync(parsed.path)) return refused('not-a-package', 'the tarball does not exist')
        return { status: 'accepted', kind: 'tarball', bundle: null, registry, ...parsed.host === undefined ? {} : { host: parsed.host } }
      case 'path': {
        if (!existsSync(parsed.path)) return refused('not-a-package', 'the path does not exist')
        let read: object
        try {
          read = JSON.parse(await readFile(join(parsed.path, 'package.json'), 'utf8')) as object
        } catch (error) {
          return refused('not-a-package', `no readable package.json at the path: ${messageOf(error)}`)
        }
        const inspection = inspectionOf('path', read, registry)
        if (inspection.name === undefined) return refused('not-a-package', 'the package.json names no package')
        if (known.has(inspection.name)) return refused('already-installed', `${inspection.name} is already installed`)
        if (!inspection.bundle) return refused('not-a-bundle', `${inspection.name} declares no qilin.bundle.patch or dsh.bundle.patch`)
        return inspection
      }
      case 'registry': {
        if (known.has(parsed.name)) return refused('already-installed', `${parsed.name} is already installed`)
        const registries: Registry[] = []
        const refusedBy = (problem: PluginInspectProblem, reason: string): PluginSpecInspection =>
          ({ status: 'refused', problem, reason, registries })
        for (const current of plan) {
          registries.push(current)
          const view = await viewProfilePackage(this.profile.dir, spec.trim(), {
            ...this.profile.packageManager ?? { command: this.pnpmCommand },
            timeoutMs: this.inspectTimeoutMs, ...signal === undefined ? {} : { signal }, registry: current,
          })
          const printed = view.stdout.replace(ANSI_SEQUENCE, '').trim()
          if (view.exitCode !== 0 || view.cause !== undefined || view.timedOut) {
            // pnpm prints a refusal as `{ error: { code, message } }` on stdout, with nothing on stderr.
            const log = [view.stderr.trim(), printedError(printed), view.cause === undefined ? '' : messageOf(view.cause)].filter(Boolean).join('\n')
            const kind = classifyInstallFailure({ log, timedOut: view.timedOut, ...view.cause === undefined ? {} : { cause: view.cause } })
            // A lookup the caller dropped is not carried to the next registry.
            if (registries.length < plan.length && signal?.aborted !== true && attributeFailure(kind, log, parsed) === 'registry') continue
            const reason = view.timedOut ? `pnpm view timed out after ${String(this.inspectTimeoutMs)}ms` : log || printed || `pnpm view exited with ${String(view.exitCode)}`
            if (kind === 'not-found' || kind === 'no-matching-version') return refusedBy('not-found', reason)
            if (kind === 'network' || kind === 'timeout') return refusedBy('network', reason)
            return refusedBy('unknown', reason)
          }
          let answer: unknown
          try {
            answer = JSON.parse(printed || 'null')
          } catch (error) {
            return refusedBy('unknown', `unreadable pnpm view output: ${messageOf(error)}`)
          }
          // A range answers one object per matching version, oldest first.
          const latest: unknown = Array.isArray(answer) ? answer.at(-1) : answer
          if (typeof latest !== 'object' || latest === null) return refusedBy('unknown', 'pnpm view answered no package')
          const inspection = inspectionOf('registry', latest, current)
          const named = inspection.name === undefined ? { ...inspection, name: parsed.name } : inspection
          if (!named.bundle) return refusedBy('not-a-bundle', `${named.name} declares no qilin.bundle.patch or dsh.bundle.patch`)
          return named
        }
        /* v8 ignore next -- the plan is never empty: every attempt returns or continues to the next */
        throw new Error('no registry was asked')
      }
    }
  }

  /** Persist a plugin entry's desired enablement and apply it on live profiles.
   * @param id Loader entry identity returned by listPlugins.
   * @param enabled Whether the plugin should run.
   * @returns Saved and runtime outcomes, including higher-priority overrides.
   */
  @Remote
  setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult> {
    return this.change(result => this.configure(async () => {
      const row = (await this.listPlugins()).find(item => item.entryId === id)
      if (row === undefined) throw new ManagementFailure('unknown-plugin')
      if (row.readOnlyReason !== undefined) throw new ManagementFailure(row.readOnlyReason)
      await writePluginEnabled(this.profile.patchPath, row.patchId, row.moduleName, enabled)
      result.warnings = await this.reload(enabled ? [row.patchId] : [])
      const current = (await this.listPlugins()).find(item => item.entryId === id)
      return current?.enabled !== enabled && this.ownerContext.get('hmr') !== undefined ? 'overridden' : undefined
    }), { stage: 'enable', target: id, enabled }, 'plugin')
  }

  /** Select or remove a bundle layer while retaining installed dependencies.
   * @param name Bundle package name.
   * @param enabled Whether the bundle contributes its patch layer.
   * @returns Persisted and runtime outcomes.
   */
  @Remote
  setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult> {
    return this.change(result => this.configure(async () => {
      await this.selectBundle(name, enabled)
      if (enabled) await this.refreshPackages()
      result.warnings = await this.reload(enabled ? this.bundleRows(name).map(row => row.id) : [])
      if (!enabled && this.ownerContext.get('hmr') !== undefined) await this.refreshPackages()
    }), { stage: 'enable', target: name, enabled }, 'bundle')
  }

  /**
   * Set which workbench surfaces present one bundle's UI. Presentation-only:
   * the profile composition keeps the bundle, so no reload follows and only
   * the changed event drives clients to re-filter.
   * @param name Bundle package name.
   * @param audience The surfaces to present on.
   * @returns Persisted outcomes; `changed` false names an already-equal record.
   */
  @Remote
  setAudience(name: string, audience: PluginAudience): Promise<ChangeResult> {
    return this.change(() => this.configure(async () => {
      const manifest = readProfileManifest('qilin', this.profile.dir)
      const selected = manifest.qilin?.profile?.bundles ?? []
      const installed = Object.keys(manifest.dependencies ?? {})
      if (!selected.includes(name) && !installed.includes(name)) throw new ManagementFailure('unknown-plugin')
      const builtIn = [...PROFILE_TEMPLATES[this.profile.name]?.bundles ?? []]
      if (this.layerLock(name, builtIn) !== undefined) throw new ManagementFailure('shipped-layer')
      await this.writeAudience(name, audience)
    }), { stage: 'enable', target: name, enabled: true }, 'bundle')
  }

  /**
   * Install a package using the same pnpm implementation as qilin plugin. GitHub
   * repositories get a connection check bounded by githubConnectionTimeoutMs before pnpm starts;
   * only network failures or timeouts stop installation, while pnpm owns authentication and transport fallback.
   * A run that fails, is cancelled, or adds a package without a bundle patch restores
   * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
   * @param spec One package spec, including local paths relative to the invocation directory.
   * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names,
   * the pending build scripts to allow for this profile before pnpm runs, and the registry asked first.
   * @returns Package-manager diagnostics, the registries asked, and the observed activation outcome.
   */
  @Remote
  installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult> {
    const requestId = options?.requestId
    const control: InstallControl = { abort: new AbortController(), phase: 'installing', settled: Promise.resolve() }
    const stopped = (): boolean => control.abort.signal.aborted
    if (requestId !== undefined) this.installs.set(requestId, control)
    const announce = (phase: PluginInstallProgress['phase'], attempt?: PluginInstallProgress['attempt']): void => {
      if (requestId !== undefined) {
        this.ownerContext.emit('plugin-manager/install-state', { requestId, phase, ...attempt === undefined ? {} : { attempt } })
      }
    }
    const result = this.change(async (result) => {
      if (spec.trim() === '' || spec.startsWith('-')) throw new ManagementFailure('invalid-spec')
      if (stopped()) throw new InstallCancelledError()
      if (options?.approvedBuilds !== undefined) {
        await approveBuilds(this.profile.dir, options.approvedBuilds)
        result.approvedBuilds = options.approvedBuilds
      }
      const files = await this.readRestoredFiles()
      const before = readProfileManifest('qilin', this.profile.dir).dependencies ?? {}
      let name: string
      let version: string | undefined
      try {
        result.registries = []
        const connection = checkGithubConnection(parsedForRegistry(spec), this.profile.dir, {
          timeoutMs: this.githubConnectionTimeoutMs, outputBytes: this.outputBytes,
          signal: AbortSignal.any([this.abort.signal, control.abort.signal]),
          ...this.profile.packageManager?.env === undefined ? {} : { env: this.profile.packageManager.env },
        })
        this.packageOperations.add(connection)
        let connectionFailure: PackageResult | undefined
        try { connectionFailure = await connection }
        finally { this.packageOperations.delete(connection) }
        if (stopped()) throw new InstallCancelledError()
        if (connectionFailure?.kind === 'network' || connectionFailure?.kind === 'timeout') {
          result.packageResult = connectionFailure
          result.failedAt = 'spec-host'
          throw new Error(connectionFailure.output)
        }
        // The last run is the result's; the registries asked stay listed whatever the outcome.
        const plan = registryPlan(options?.registry, await this.registries())
        let run: PackageResult | undefined
        for (const [index, registry] of plan.entries()) {
          if (index > 0) await this.restoreFiles(files)
          // A stop that landed while the files went back, or before the first run, starts no run with a dead signal.
          if (stopped()) throw new InstallCancelledError()
          result.registries.push(registry)
          announce('installing', { registry, index: index + 1, total: plan.length })
          run = await this.runPnpm(['add', spec, ...registryArguments(registry)], control.abort.signal, requestId)
          result.packageResult = run
          if (stopped()) throw new InstallCancelledError()
          // A compatibility refusal is the package's own answer, so no other registry is asked.
          if (run.incompatible !== undefined) throw new ManagementFailure('incompatible-version', run.incompatible)
          if (run.exitCode === 0) break
          /* v8 ignore next 2 -- runPnpm classifies every run it does not report as succeeded */
          if (run.kind === undefined) break
          // What the last failed run could not reach; a later run that succeeds leaves nothing to say.
          delete result.failedAt
          const failedAt = attributeFailure(run.kind, run.output, parsedForRegistry(spec))
          if (failedAt !== 'other') result.failedAt = failedAt
          if (failedAt !== 'registry' || index === plan.length - 1) break
        }
        /* v8 ignore next -- the plan is never empty, so a run always settled */
        if (run === undefined) throw new Error('no registry was asked')
        if (run.exitCode === 0) delete result.failedAt
        if (run.exitCode !== 0) {
          // pnpm-workspace.yaml is not restored, so the names pnpm left undecided there can be offered for approval.
          try { result.pendingBuilds = await readPendingBuilds(this.profile.dir) }
          catch (error) {
            this.ownerContext.logger.warn('Could not read pending build approvals after pnpm failed', error)
          }
          throw new Error(run.output)
        }
        const after = readProfileManifest('qilin', this.profile.dir).dependencies ?? {}
        const installed = Object.keys(after).filter(name => before[name] !== after[name])
        // Registry retries can retain the saved range after a partial installation.
        if (installed.length === 0) installed.push(...Object.keys(after).filter(name => spec === name || spec.startsWith(`${name}@`)))
        const target = installed[0]
        if (installed.length !== 1 || target === undefined) throw new ManagementFailure('ambiguous-install')
        name = target
        const dir = resolveBundleDir('qilin', name, this.profile.installAnchor, this.profile.dir)
        const manifest = readProfileManifest('qilin', dir)
        const patch = bundlePatchOf(manifest)
        if (patch === undefined) throw new ManagementFailure('not-bundle')
        const compatibility = evaluatePluginCompatibility(manifest, readProfileVersionExemptions(this.profile.dir))
        if (compatibility !== undefined && !compatibility.exempted) {
          throw new ManagementFailure('incompatible-version', [incompatiblePlugin(compatibility)])
        }
        loadOverlayPatches('qilin', join(dir, patch))
        version = manifest.version
      } catch (error) {
        // pnpm has exited by now, so the files it rewrote go back as they were.
        await this.restoreFiles(files)
        throw error
      }
      control.phase = 'applying'
      announce('applying')
      result.bundle = name
      if (version !== undefined) result.version = version
      result.target = name
      result.stage = 'enable'
      return this.configure(async () => {
        // The audience rides along even for a disabled install, so the later enable keeps the choice.
        await this.selectBundle(name, options?.enabled !== false, options?.audience)
        if (Object.hasOwn(before, name)) return 'restart-required'
        await this.refreshPackages()
        if (options?.enabled !== false) result.warnings = await this.reload()
      })
    }, { stage: 'install', target: spec, enabled: options?.enabled !== false }, 'install')
    /* v8 ignore next -- change() folds every failure into its result; only a lock or disposal error rejects */
    control.settled = result.then(() => undefined, () => undefined)
    return result.finally(() => { if (requestId !== undefined) this.installs.delete(requestId) })
  }

  /** Stop an installation this manager owns and wait until its files are back.
   * @param requestId The id the installation was started with.
   * @returns `cancelled` once pnpm exited and the files are restored, `too-late` once the bundle is being
   * applied, `not-running` for any other id.
   */
  @Remote
  async cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation> {
    const control = this.installs.get(requestId)
    if (control === undefined) return { status: 'not-running' }
    if (control.phase === 'applying') return { status: 'too-late' }
    this.ownerContext.emit('plugin-manager/install-state', { requestId, phase: 'cancelling' })
    control.abort.abort()
    await control.settled
    return { status: 'cancelled' }
  }

  /** Unload and remove a profile-owned bundle dependency through qilin plugin's pnpm path.
   * @param name Installed dependency name.
   * @returns Removal diagnostics and the remaining profile state.
   */
  @Remote
  removeBundle(name: string): Promise<ChangeResult> {
    return this.change(async (result) => {
      await this.configure(async () => {
        const bundle = (await this.listBundles()).find(item => item.name === name)
        if (bundle === undefined || !bundle.removable) throw new ManagementFailure('not-removable')
        if (this.ownerContext.get('hmr') === undefined && (this.profile.startedBundles.includes(name)
          || this.bundleRows(name).some(row => [...this.ctx.loader.entries()]
            .some(entry => entry.options.id === row.id && entry.fiber !== undefined)))) {
          throw new ManagementFailure('stop-profile')
        }
        const contributions = bundle.error === undefined ? this.bundleRows(name) : []
        if (bundle.enabled) {
          await this.selectBundle(name, false)
          result.warnings = await this.reload()
        }
        if ([...this.ctx.loader.entries()].some(entry => entry.fiber?.uid != null
          && contributions.some(row => row.id === entry.options.id && row.name === entry.options.name))) {
          throw new ManagementFailure('bundle-in-use')
        }
      })
      result.packageResult = await this.runPnpm(['remove', name])
      if (result.packageResult.exitCode !== 0) throw new Error(result.packageResult.output)
      await this.writeAudience(name, undefined)
      await this.configure(() => this.refreshPackages())
    }, { stage: 'remove', target: name }, 'remove')
  }

  /** The rows a bundle's patch inserts and the existing rows it changes; an unreadable patch throws. */
  private declaredRows(name: string, info: ProfileManifest): Pick<BundleInfo, 'rows' | 'overrides'> {
    const patch = bundlePatchOf(info)
    /* v8 ignore next -- bundleManifest answers only manifests that declare a patch */
    if (patch === undefined) return { rows: [], overrides: [] }
    const dir = resolveBundleDir('qilin', name, this.profile.installAnchor, this.profile.dir)
    const patches: PatchOptions[] = loadOverlayPatches('qilin', join(dir, patch))
    // One entry per row id: the Loader keeps a single entry for an id, whichever layer declared it last.
    const live = new Map<string, PluginEntryId>()
    for (const entry of this.ctx.loader.entries()) {
      /* v8 ignore next -- the Loader gives every entry an id before it is listed */
      if (typeof entry.options.id === 'string') live.set(entry.options.id, pluginEntryId(entry.id))
    }
    const rows: BundleRowInfo[] = []
    for (const row of flatten(composeEntries([patches.filter(item => item.insert !== undefined)]))) {
      if (typeof row.id !== 'string' || typeof row.name !== 'string') continue
      const entryId = live.get(row.id)
      rows.push({ rowId: row.id, moduleName: row.name, ...entryId === undefined ? {} : { entryId } })
    }
    const declared = new Set(rows.map(row => row.rowId))
    const overrides = [...new Set(patches.flatMap(item =>
      item.insert === undefined && typeof item.id === 'string' && !declared.has(item.id) ? [item.id] : []))]
    return { rows, overrides }
  }

  /** Run one pnpm command in the profile, streaming its output as install-log chunks. */
  /**
   * Why a layer cannot be switched off as a layer, when it cannot: the manager
   * needs its own package, and a shipped layer arrives with the release.
   * @param name - the bundle's package name.
   * @param builtIn - bundle names supplied by the selected shipped template.
   * @returns the lock reason, or undefined when the layer is the person's own to switch.
   */
  private layerLock(name: string, builtIn: readonly string[]): ReadOnlyReason | undefined {
    if (this.protectsManager(name)) return 'management-required'
    return builtIn.includes(name) ? 'shipped-layer' : undefined
  }

  private async runPnpm(
    args: readonly string[], signal?: AbortSignal, requestId?: PluginInstallRequestId,
  ): Promise<PackageResult> {
    const jobId = randomUUID()
    const argv = ['pnpm', ...args]
    const cwd = this.profile.dir
    const identity = requestId === undefined ? {} : { requestId }
    const task = runProfilePnpm({ ...this.profile, profile: this.profile.name }, args, {
      execution: 'service', ...this.profile.packageManager ?? { command: this.pnpmCommand },
      signal: signal === undefined ? this.abort.signal : AbortSignal.any([this.abort.signal, signal]),
      outputBytes: this.outputBytes, activateNewBundles: false,
      lookupTimeoutMs: this.inspectTimeoutMs,
      onOutput: (text, stream) => {
        this.ownerContext.emit('plugin-manager/install-log', { ...identity, jobId, argv, cwd, stream, text })
      },
    })
    this.packageOperations.add(task)
    try {
      const result = await task
      this.ownerContext.emit('plugin-manager/install-log', {
        ...identity, jobId, argv, cwd, stream: 'stdout', text: '', exitCode: signal?.aborted === true ? null : result.exitCode,
      })
      return result.exitCode === 0 ? result : { ...result, kind: classifyInstallFailure({ log: result.output }) }
    } catch (error) {
      this.ownerContext.emit('plugin-manager/install-log', { ...identity, jobId, argv, cwd, stream: 'stderr', text: messageOf(error), exitCode: null })
      throw error
    } finally {
      this.packageOperations.delete(task)
    }
  }

  /** The profile files an installation may rewrite, as they are now; absent files read as undefined. */
  private async readRestoredFiles(): Promise<Map<string, string | undefined>> {
    const files = new Map<string, string | undefined>()
    for (const name of RESTORED_FILES) {
      const path = join(this.profile.dir, name)
      files.set(path, existsSync(path) ? await readFile(path, 'utf8') : undefined)
    }
    return files
  }

  /** Put the profile files back; pnpm has exited by the time this runs. */
  private async restoreFiles(files: Map<string, string | undefined>): Promise<void> {
    for (const [path, content] of files) {
      if (content === undefined) await rm(path, { force: true })
      else await writeFileAtomic(path, content, { mode: 0o600 })
    }
  }

  private async selectBundle(name: string, enabled: boolean, audience?: PluginAudience): Promise<void> {
    const manifest = readProfileManifest('qilin', this.profile.dir)
    const previous = manifest.qilin?.profile?.bundles ?? []
    if (enabled || !previous.includes(name)) {
      const metadata = bundleManifest(name, this.profile.dir, this.profile.installAnchor)
      if (metadata === undefined) throw new ManagementFailure('not-bundle')
      if (enabled) {
        const compatibility = evaluatePluginCompatibility(metadata, readProfileVersionExemptions(this.profile.dir))
        if (compatibility !== undefined && !compatibility.exempted) {
          throw new ManagementFailure('incompatible-version', [incompatiblePlugin(compatibility)])
        }
        this.bundleRows(name)
      }
    }
    if (!enabled && previous.includes(name)) {
      if (this.protectsManager(name)) throw new ManagementFailure('management-required')
    }
    const bundles = enabled ? [...previous, ...previous.includes(name) ? [] : [name]] : previous.filter(item => item !== name)
    // Only an explicit choice records an audience; a selection without one keeps any
    // existing record, and a bundle named by no record presents on both surfaces.
    const audiences = { ...manifest.qilin?.profile?.audiences }
    if (audience !== undefined) audiences[name] = audience
    const bundlesChanged = JSON.stringify(previous) !== JSON.stringify(bundles)
    if (!bundlesChanged && JSON.stringify(manifest.qilin?.profile?.audiences ?? {}) === JSON.stringify(audiences)) return
    manifest.qilin = { ...manifest.qilin, profile: { ...manifest.qilin?.profile, bundles, audiences } }
    await saveManifest(this.profile.dir, manifest)
  }

  /**
   * Persist one bundle's audience record, or drop it with `undefined`. A name
   * whose record already matches saves nothing.
   * @param name Bundle package name.
   * @param audience The surfaces to record, or `undefined` to remove the record (reads as `both`).
   */
  private async writeAudience(name: string, audience: PluginAudience | undefined): Promise<void> {
    const manifest = readProfileManifest('qilin', this.profile.dir)
    const source = manifest.qilin?.profile?.audiences ?? {}
    const audiences = audience === undefined
      ? Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))
      : { ...source, [name]: audience }
    if (JSON.stringify(source) === JSON.stringify(audiences)) return
    manifest.qilin = { ...manifest.qilin, profile: { ...manifest.qilin?.profile, audiences } }
    await saveManifest(this.profile.dir, manifest)
  }

  private bundleRows(name: string): EntryOptions[] {
    const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor)
    const patch = info === undefined ? undefined : bundlePatchOf(info)
    /* v8 ignore next -- bundleManifest answers only manifests that declare a patch */
    if (info === undefined || patch === undefined) return []
    const dir = resolveBundleDir('qilin', name, this.profile.installAnchor, this.profile.dir)
    return flatten(composeEntries([loadOverlayPatches('qilin', join(dir, patch))]))
  }

  private protectsManager(name: string): boolean {
    return this.bundleRows(name).some(row => protectedModules.has(row.name) || `include:${row.id}` === this.ownerEntryId)
  }

  private configure<T>(operation: () => Promise<T>): Promise<T> {
    const hmr = this.ownerContext.get('hmr')
    const apply = () => { this.abort.signal.throwIfAborted(); return operation() }
    return hmr === undefined ? apply() : hmr.runExclusive(apply)
  }

  private async reload(requiredIds: readonly string[] = []): Promise<string[]> {
    if (this.ownerContext.get('hmr') === undefined) return []
    return reconcileProfilePatches(this.ownerContext.root, readProfilePatches('qilin', this.profile), 'qilin', requiredIds)
  }

  private async refreshPackages(): Promise<void> {
    if (this.ownerContext.get('hmr') === undefined) {
      const selected = readProfileManifest('qilin', this.profile.dir).qilin?.profile?.bundles ?? []
      // Deselected startup bundles still run without HMR and need the existing package table.
      if (this.profile.startedBundles.some(name => !selected.includes(name))) return
    }
    await this.ownerContext.get('pluginPackages')?.refresh()
  }

  private async change(
    operation: (result: ChangeResult) => Promise<ChangeResult['application'] | void>,
    request: Pick<ChangeResult, 'stage' | 'target' | 'enabled'>,
    reason: PluginChange['reason'],
  ): Promise<ChangeResult> {
    return withFileLock(join(this.profile.dir, 'package.json'), async () => {
      this.abort.signal.throwIfAborted()
      const before = this.diskState()
      const result: ChangeResult = { ...request, changed: false,
        application: this.ownerContext.get('hmr') !== undefined ? 'applied' : 'restart-required' }
      try {
        result.application = await operation(result) ?? result.application
      } catch (error) {
        if (error instanceof InstallCancelledError) {
          result.application = 'cancelled'
        } else {
          result.application = 'failed'
          result.error = managementError(error)
        }
      }
      result.changed = before !== this.diskState()
      this.ownerContext.emit('plugin-manager/changed', { reason })
      return result
    }, { waitMs: this.lockWaitMs })
  }

  private diskState(): string {
    return ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', PROFILE_COMPATIBILITY_FILENAME].map((file) => {
      try { return readFileSync(join(this.profile.dir, file), 'utf8') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
        throw error
      }
    }).join('\0')
  }
}

/** Read one package's registry `latest` dist-tag.
 * @param name - package name to ask the registry about.
 * @returns the latest version, or null when the registry cannot be read or answers none.
 */
async function npmLatest(name: string): Promise<string | null> {
  try {
    const response = await fetch(`${REGISTRY_DIST_TAGS}/${encodeURIComponent(name)}/dist-tags`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.json() as { latest?: unknown }
    return typeof body.latest === 'string' ? body.latest : null
  } catch {
    // An unreachable registry leaves the latest version unknown; the row reports null.
    return null
  }
}

/** Read the repository fields the catalog shows, dropping a row GitHub answered without an identity.
 * @param value - one entry of GitHub's `items` array, of unknown shape.
 * @returns the entry, or an empty list when the value names no repository.
 */
function communityEntry(value: unknown): CommunityPluginEntry[] {
  if (typeof value !== 'object' || value === null) return []
  const row = value as Record<string, unknown>
  if (typeof row.full_name !== 'string' || typeof row.html_url !== 'string') return []
  return [{
    fullName: row.full_name,
    description: typeof row.description === 'string' ? row.description : null,
    stars: typeof row.stargazers_count === 'number' ? row.stargazers_count : 0,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
    url: row.html_url,
  }]
}

export default PluginManager
