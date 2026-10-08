/**
 * The browser roster of a `qilin --profile`, read from its bundle patch files
 * the way the launcher composes them: each bundle's declared patch list
 * (`qilin.bundle.patch`, or the DSH-era `dsh.bundle.patch`) is parsed with the
 * include plugin's YAML dialect (`entryListSchema`) and composed by its
 * `applyEntryPatches`; every enabled row whose package declares a web client
 * platform in either manifest channel (`qilin.client`, or the DSH-era
 * `dsh.client`) becomes a roster row carrying that declaration's `inject`
 * (canonicalized through `dshCompatModuleId` like the client module graph) and
 * `immediately`; rows nested in Loader groups count
 * like the Loader counts them, a disabled group disabling every row beneath
 * it. A patch that matches nothing
 * throws here where the launcher warns. Nothing is copied from the bundles: a
 * bundle change is visible at the next import. Node only — the
 * whole-client tier runs under vitest, and this is the one place it reads the
 * repository.
 * @module @qilin-agent/client-test-runtime/src/assembly/bundle-roster
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EntryOptions } from '@qilin-agent/kylin-plugin-loader'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@qilin-agent/kylin-plugin-include'
import { bundlePatchOf, clientDeclarationOf, dshCompatModuleId } from '@qilin-agent/dsh-compat'
import { exactPackageSpecifier, parseQilinClient } from '@qilin-agent/client-modules/client'
import * as yaml from 'js-yaml'
import { ClientRoster, type ClientRosterRow } from './roster.ts'

/** The `web` profile's bundle layers, in the order `qilin --profile web` applies them (app-boot `PROFILE_TEMPLATES.web`). */
export const WEB_PROFILE_BUNDLES: readonly string[] = ['@qilin-agent/base', '@qilin-agent/web-app']

interface PackageManifest {
  name?: unknown
  qilin?: { bundle?: { patch?: unknown }; client?: unknown }
  dsh?: { bundle?: { patch?: unknown }; client?: unknown }
}

/** One bundle: where its package.json is (plugin names resolve from there) and its parsed patch list. */
interface BundleLayer {
  readonly manifestPath: string
  readonly patches: PatchOptions[]
}

/**
 * Compose the browser roster of `bundles`, applied in order.
 * @param bundles - bundle package names in application order.
 * @param anchor - file whose package resolution locates the bundles; default this package.
 * @returns the roster in composition order, one row per package.
 * @throws {Error} when a bundle, its patch file, or an enabled row's package does not resolve, when the patch list
 * is not a list or does not apply as written, or when a browser row's `disabled` is a `!!js` expression.
 */
export function bundleRoster(bundles: readonly string[], anchor: string = fileURLToPath(import.meta.url)): ClientRoster {
  const layers = bundles.map(name => readLayer(name, anchor))
  const entries = applyEntryPatches([], layers.flatMap(layer => layer.patches), (message: string, ...args: unknown[]) => {
    throw new Error(`client-test-runtime: bundle patch ${describe(message, args)}`)
  })
  const anchors = layers.map(layer => layer.manifestPath)
  const rows: ClientRosterRow[] = []
  const seen = new Set<string>()
  for (const { entry, disabled } of flattenGroups(entries)) {
    const name = exactPackageSpecifier(entry.name)
    if (name === undefined || disabled === true || seen.has(name)) continue
    seen.add(name)
    const manifestPath = locateManifest(anchors, name)
    if (manifestPath === undefined) {
      throw new Error(`client-test-runtime: cannot resolve plugin package ${name} from ${bundles.join(', ')}`)
    }
    const manifest = readManifest(manifestPath)
    if (manifest.name !== name) {
      throw new Error(`client-test-runtime: ${manifestPath} names ${JSON.stringify(manifest.name)}, expected ${name}`)
    }
    const picked = clientDeclarationOf(manifest)
    const declaration = parseQilinClient(name, picked?.key ?? 'qilin.client', picked?.value)
    if (declaration === undefined || declaration.platform !== 'web') continue
    if (disabled !== undefined && disabled !== null && typeof disabled !== 'boolean') {
      throw new Error(`client-test-runtime: browser row ${name} has a \`disabled\` value this reader cannot evaluate (a !!js expression)`)
    }
    rows.push({ name, inject: declaration.inject?.map(dshCompatModuleId) ?? [], immediately: declaration.immediately === true })
  }
  return ClientRoster.of(rows)
}

function readLayer(bundle: string, anchor: string): BundleLayer {
  const manifestPath = locateManifest([anchor], bundle)
  if (manifestPath === undefined) throw new Error(`client-test-runtime: cannot resolve bundle ${bundle} from ${anchor}`)
  const patch = bundlePatchOf(readManifest(manifestPath))
  if (patch === undefined) throw new Error(`client-test-runtime: bundle ${bundle} declares no qilin.bundle.patch or dsh.bundle.patch in ${manifestPath}`)
  const file = join(dirname(manifestPath), patch)
  const parsed: unknown = yaml.load(readFileSync(file, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new Error(`client-test-runtime: ${file} must be a top-level list of patches`)
  return { manifestPath, patches: parsed as PatchOptions[] }
}

/** One Loader row with the `disabled` value that governs it: its own, or the nearest enclosing group's when that is set. */
interface FlatEntry {
  readonly entry: EntryOptions
  readonly disabled: unknown
}

/**
 * Rows in Loader order with groups descended, as the Loader loads them: a group is never a plugin itself, and a group's
 * `disabled` disables every row beneath it.
 * @param entries - composed entries, possibly nested.
 * @param inherited - the enclosing group's `disabled` when set.
 * @returns the plugin rows.
 */
function flattenGroups(entries: readonly EntryOptions[], inherited?: unknown): FlatEntry[] {
  const rows: FlatEntry[] = []
  for (const entry of entries) {
    const own = (entry as { disabled?: unknown }).disabled
    const disabled = inherited !== undefined && inherited !== null && inherited !== false ? inherited : own
    if (entry.group === true && Array.isArray(entry.config)) {
      rows.push(...flattenGroups(entry.config as EntryOptions[], disabled))
      continue
    }
    rows.push({ entry, disabled })
  }
  return rows
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
}

/** Locate `<name>/package.json` on the resolution paths of any anchor, without requiring a `./package.json` export. */
function locateManifest(anchors: readonly string[], name: string): string | undefined {
  for (const anchor of anchors) {
    for (const searchPath of createRequire(anchor).resolve.paths(name) ?? []) {
      const candidate = join(searchPath, name, 'package.json')
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

/** The include plugin's `%C` placeholders, filled the way the launcher prints them. */
function describe(message: string, args: readonly unknown[]): string {
  let index = 0
  return message.replace(/%C/g, () => JSON.stringify(args[index++]))
}

/** The `web` profile's browser roster, composed from its bundles at import. */
export const webApp: ClientRoster = bundleRoster(WEB_PROFILE_BUNDLES)
