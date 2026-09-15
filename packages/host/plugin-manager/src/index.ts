/** Profile-scoped Remote service for installing and managing QiLin or DSH bundles. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROFILE_OWNED_BUNDLES, readProfileManifest, reconcileProfilePlugins, resolveBundleDir } from '@qilin/app-boot'
import type { LaunchProfileSnapshot } from '@qilin/app-boot'
import type { Context } from '@qilin/kylin'
import { Remote, TypertRemoteService } from '@qilin/typert-protocol'
import type {
  CommunityPluginEntry, CommunityPluginSnapshot, PluginManagerSnapshot, PluginMutationReceipt,
  PluginUpdateEntry, PluginUpdateSnapshot, UserPluginEntry,
} from './types.ts'

export type * from './types.ts'

const OUTPUT_LIMIT = 80
const COMMAND_TIMEOUT_MS = 120_000
const GITHUB_PAGE_SIZE = 50
const GITHUB_API = 'https://api.github.com/search/repositories'

/** Remote service that mutates only the selected profile project. */
export class PluginManagerGateway extends TypertRemoteService {
  static inject = ['qilinProfile']
  private mutation: Promise<void> = Promise.resolve()
  private readonly profile: LaunchProfileSnapshot

  constructor(ctx: Context) {
    super(ctx, 'pluginManager')
    if (ctx.qilinProfile === undefined) throw new Error('pluginManager: qilinProfile is not available')
    this.profile = ctx.qilinProfile
  }

  /**
   * Read installed bundle layers from the profile manifest and node_modules.
   * @returns current profile plugin entries in activation order.
   */
  @Remote('list')
  async list(): Promise<PluginManagerSnapshot> {
    // A profile that has never been initialized has no manifest: that is an empty
    // layer list, not a listing failure (application-owned and synthetic profiles
    // reach this with only a Loader config on disk).
    if (!existsSync(join(this.profile.dir, 'package.json'))) {
      return { profile: this.profile.name, entries: [] }
    }
    const manifest = readProfileManifest('pluginManager', this.profile.dir)
    const dependencies = new Set(Object.keys(manifest.dependencies ?? {}))
    const bundles = manifest.qilin?.profile?.bundles ?? manifest.dsh?.profile?.bundles ?? []
    const entries: UserPluginEntry[] = []
    for (const [layer, name] of bundles.entries()) {
      const shipped = this.profile.builtInBundles.includes(name)
      entries.push({
        name,
        version: installedVersion(this.profile, name),
        layer,
        source: shipped && !dependencies.has(name) ? 'builtin' : 'user',
        // A shipped layer resolves from the installation unless the profile owns it
        // ({@link PROFILE_OWNED_BUNDLES}), so only those layers can be upgraded in
        // place; the rest move with the running installation and are never removable.
        updatable: !shipped || PROFILE_OWNED_BUNDLES.includes(name),
        removable: !shipped,
      })
    }
    return { profile: this.profile.name, entries }
  }

  /**
   * Compare installed npm versions with registry latest dist-tags.
   * @returns current and latest versions for each installed layer.
   */
  @Remote('checkUpdates')
  async checkUpdates(): Promise<PluginUpdateSnapshot> {
    const snapshot = await this.list()
    const entries: PluginUpdateEntry[] = await Promise.all(snapshot.entries.map(async entry => ({
      name: entry.name,
      currentVersion: entry.version,
      latestVersion: await npmLatest(entry.name),
    })))
    return { entries }
  }

  /**
   * Search GitHub's public DSH plugin topic.
   * @param query - optional repository search text.
   * @param page - one-based result page.
   * @returns matching community repositories and pagination state.
   */
  @Remote('catalog')
  async catalog(query: string, page: number): Promise<CommunityPluginSnapshot> {
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
    const q = ['topic:dsh-plugin', query.trim()].filter(Boolean).join(' ')
    const response = await fetch(GITHUB_API + '?q=' + encodeURIComponent(q)
      + '&sort=stars&order=desc&per_page=' + String(GITHUB_PAGE_SIZE) + '&page=' + String(safePage), {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('pluginManager: GitHub search failed with HTTP ' + String(response.status))
    const body = await response.json() as { items?: unknown[] }
    const raw = Array.isArray(body.items) ? body.items : []
    const entries: CommunityPluginEntry[] = raw.flatMap(value => communityEntry(value))
    return { entries, page: safePage, hasMore: raw.length === GITHUB_PAGE_SIZE }
  }

  /**
   * Install one pnpm package spec into the profile.
   * @param spec - package, tarball, Git, or local path accepted by pnpm.
   * @returns mutation receipt with bounded output and restart status.
   */
  @Remote('installPlugin')
  async installPlugin(spec: string): Promise<PluginMutationReceipt> {
    if (!validSpec(spec)) throw new Error('pluginManager: install requires a package spec, not a pnpm flag')
    return this.mutate(['add', spec])
  }

  /**
   * Upgrade one profile-managed package to the registry latest version.
   * @param name - installed package name.
   * @returns mutation receipt with bounded output and restart status.
   */
  @Remote('updatePlugin')
  async updatePlugin(name: string): Promise<PluginMutationReceipt> {
    const row = (await this.list()).entries.find(entry => entry.name === name)
    if (row === undefined || !row.updatable) throw new Error('pluginManager: plugin ' + JSON.stringify(name) + ' cannot be updated')
    // A shipped layer outside the profile dependency graph has no edge for
    // `pnpm update` to follow, so it upgrades through `add <name>@latest`; the
    // profile copy then wins resolution over the installation seed.
    return this.mutate(row.source === 'builtin'
      ? ['add', name + '@latest']
      : ['update', '--latest', name])
  }

  /**
   * Remove one user-managed bundle from the profile.
   * @param name - installed package name.
   * @returns mutation receipt with bounded output and restart status.
   */
  @Remote('uninstallPlugin')
  async uninstallPlugin(name: string): Promise<PluginMutationReceipt> {
    const row = (await this.list()).entries.find(entry => entry.name === name)
    if (row === undefined || !row.removable) throw new Error('pluginManager: plugin ' + JSON.stringify(name) + ' cannot be removed')
    return this.mutate(['remove', name])
  }

  private async mutate(args: readonly string[]): Promise<PluginMutationReceipt> {
    const previous = this.mutation
    let release!: () => void
    this.mutation = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      const before = readProfileManifest('pluginManager', this.profile.dir)
      const result = await runPnpm(this.profile.dir, args)
      if (result.code !== 0) throw new Error('pluginManager: pnpm ' + args[0] + ' failed\n' + result.outputTail.join('\n'))
      reconcileProfilePlugins('pluginManager', before, this.profile.dir, this.profile.installAnchor)
      return { changed: true, restartRequired: true, outputTail: result.outputTail }
    } finally {
      release()
    }
  }
}

/** Validate a pnpm package spec before passing it to a subprocess. */
function validSpec(spec: string): boolean {
  return spec.trim() !== '' && !spec.startsWith('-') && !/[\r\n]/u.test(spec)
}

/**
 * Read one layer's installed version through the bundle resolution order:
 * the profile copy for profile-owned layers, the installation seed otherwise.
 * @param profile - launch facts naming both resolution anchors.
 * @param name - bundle package name from the profile's layer list.
 * @returns the installed version, or null when the layer resolves nowhere.
 */
function installedVersion(profile: LaunchProfileSnapshot, name: string): string | null {
  try {
    const dir = resolveBundleDir('pluginManager', name, profile.installAnchor, profile.dir)
    const value = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof value.version === 'string' ? value.version : null
  } catch (_unresolvedOrUnreadable) {
    // Declared but installed nowhere, or an unreadable manifest: the row reports no version.
    return null
  }
}

/** Read the registry latest tag without surfacing network failure as a mutation error. */
async function npmLatest(name: string): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/-/package/' + encodeURIComponent(name) + '/dist-tags', {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const body = await response.json() as { latest?: unknown }
    return typeof body.latest === 'string' ? body.latest : null
  } catch {
    return null
  }
}

/** Parse the small public field set consumed by the Settings catalog. */
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

/** Run pnpm without a shell and retain a bounded diagnostic tail. */
function runPnpm(cwd: string, args: readonly string[]): Promise<{ code: number; outputTail: string[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd, env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32' })
    const lines: string[] = []
    let settled = false
    const append = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/u)) {
        if (line !== '') lines.push(line)
        if (lines.length > OUTPUT_LIMIT) lines.shift()
      }
    }
    // Close and error both clear this timer, so the guard below only absorbs a
    // callback the timers phase had already queued.
    const timer = setTimeout(() => {
      /* v8 ignore next 2 -- cleared by close and error; unreachable in tests. */
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error('pluginManager: pnpm timed out after ' + String(COMMAND_TIMEOUT_MS) + 'ms'))
    }, COMMAND_TIMEOUT_MS)
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? 1, outputTail: lines })
    })
  })
}

export default PluginManagerGateway
