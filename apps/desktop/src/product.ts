/** Product identity and resource layout for a white-labelled Desktop build. */
// KStock patch: desktop-product — product.json drives identity, home, profile, and resources.

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Update feed a product release publishes through. */
export interface DesktopProductUpdate {
  readonly provider: 'generic'
  readonly url: string
}

/** How the shell obtains an account session before showing the workspace. */
export interface DesktopProductAuth {
  /**
   * `welcome` keeps the built-in welcome surface; `boot-secret` mints a session
   * from the Host's boot-secret endpoint and never opens the welcome window.
   */
  readonly mode: 'welcome' | 'boot-secret'
  /** Environment variable carrying the one-shot boot secret into the Host. */
  readonly secretEnv: string
  /** Host route that exchanges the boot secret for an account session. */
  readonly endpoint: string
  /** Request header carrying the boot secret. */
  readonly header: string
}

/** Runtime payload the application extracts on first launch. */
export interface DesktopProductRuntime {
  /** Archive name under the packaged resources directory. */
  readonly tar: string
  /** Archive path relative to the product root for an unpackaged launch. */
  readonly devTar: string
}

/** One product installation's identity, profile, and payload. */
export interface DesktopProduct {
  readonly schemaVersion: 1
  /** Application display name; also the Electron application name. */
  readonly name: string
  /** Bundle identifier the packaged application is built with. */
  readonly appId: string
  /** Deep-link scheme this product registers. */
  readonly scheme: string
  /** Data directory relative to the user's home directory (packaged form). */
  readonly homeRelative: string
  /** Harness home relative to the user's home directory (packaged form). */
  readonly harnessHomeRelative: string
  /** Harness home relative to the user's home directory (unpackaged form). */
  readonly devHarnessHomeRelative: string
  /** Profile the Host boots. */
  readonly profile: string
  /** Ordered profile bundle layers; the last one is the product layer. */
  readonly profileBundles: readonly string[]
  /** Plugin packages relative to the product root, or absent when the profile installs its own. */
  readonly pluginRoot?: string
  /** Plugin packages for an unpackaged launch, when they live elsewhere than the packaged copy. */
  readonly devPluginRoot?: string
  /** Agent preset root relative to the product root, or absent for the built-in root. */
  readonly presetsRoot?: string
  /** Agent preset root for an unpackaged launch, when it lives elsewhere than the packaged copy. */
  readonly devPresetsRoot?: string
  /** Runtime archive names, or absent when the Host runs an installed CLI. */
  readonly runtime?: DesktopProductRuntime
  readonly auth: DesktopProductAuth
  /** Whether the bundled Office integration is available. */
  readonly office: boolean
  // KStock patch (K32): backgroundNotice opts the product out of the one-time
  // tray confirmation; `false` hides straight to the tray on close.
  /** Whether the first Windows close confirms the tray behavior. Default true. */
  readonly backgroundNotice?: boolean
  // KStock patch (K39): commandManagement opts the product out of the engine's
  // "manage qilin command" menu entry. That entry installs a `qilin` launcher
  // from `resources/runtime/**`, which a product running its own runtime archive
  // does not ship.
  /** Whether the application menu offers the qilin CLI manager. Default true. */
  readonly commandManagement?: boolean
  readonly update: DesktopProductUpdate | null
  /**
   * Extra environment variables for the Host and every child process. Values
   * expand `$dataDir`, `$harnessHome`, `$pluginDir`, `$presetsDir`, and `$version`.
   */
  readonly env?: Readonly<Record<string, string>>
}

/** Inputs that decide which product file the process reads. */
export interface DesktopProductEnvironment {
  readonly packaged: boolean
  /** `app.getAppPath()`: the application directory or `app.asar`. */
  readonly appPath: string
  /** `process.resourcesPath`: the packaged resources directory. */
  readonly resourcesPath: string
  /** Absolute product-manifest path; overrides the default location. */
  readonly manifestPath?: string | undefined
  /** Product root that relative resource fields resolve against. */
  readonly root?: string | undefined
  /** User home directory; defaults to the current user's home. */
  readonly home?: string | undefined
}

/** A loaded product manifest and the root its relative paths resolve against. */
export interface ResolvedDesktopProduct {
  readonly product: DesktopProduct
  /** Absolute product root. */
  readonly root: string
  /** Manifest path, or undefined when the built-in defaults apply. */
  readonly source: string | undefined
}

const DEFAULT_PRODUCT: DesktopProduct = {
  schemaVersion: 1,
  name: 'QiLin Desktop',
  appId: 'com.qilin.desktop',
  scheme: 'qilin',
  homeRelative: '.qilin-desktop',
  harnessHomeRelative: '.qilin-desktop',
  devHarnessHomeRelative: '.qilin-desktop',
  profile: 'desktop',
  profileBundles: ['@qilin-agent/base', '@qilin-agent/web-app', '@qilin-agent/web-brand'],
  auth: {
    mode: 'welcome',
    secretEnv: 'QILIN_DESKTOP_BOOT_SECRET',
    endpoint: '/api/auth/desktop-session',
    header: 'x-qilin-boot-secret',
  },
  office: true,
  update: null,
}

/** Built-in product used when the application ships no manifest. */
export function desktopProductDefaults(): DesktopProduct {
  return DEFAULT_PRODUCT
}

function fail(message: string): never {
  throw new Error(`desktop product: ${message}`)
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string`)
  return value
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return text(value, field)
}

function textList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${field} must be a non-empty string array`)
  return value.map((entry, index) => text(entry, `${field}[${String(index)}]`))
}

/**
 * Validate one parsed manifest.
 * @param value - Parsed JSON.
 * @returns The validated product.
 */
export function parseDesktopProduct(value: unknown): DesktopProduct {
  if (typeof value !== 'object' || value === null) fail('manifest must be a JSON object')
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1) fail('schemaVersion must be 1')
  const auth = record.auth
  if (typeof auth !== 'object' || auth === null) fail('auth must be an object')
  const authRecord = auth as Record<string, unknown>
  const mode = authRecord.mode
  if (mode !== 'welcome' && mode !== 'boot-secret') fail('auth.mode must be "welcome" or "boot-secret"')
  const runtime = record.runtime
  let parsedRuntime: DesktopProductRuntime | undefined
  if (runtime !== undefined) {
    if (typeof runtime !== 'object' || runtime === null) fail('runtime must be an object')
    const runtimeRecord = runtime as Record<string, unknown>
    parsedRuntime = {
      tar: text(runtimeRecord.tar, 'runtime.tar'),
      devTar: text(runtimeRecord.devTar, 'runtime.devTar'),
    }
  }
  const update = record.update
  let parsedUpdate: DesktopProductUpdate | null = null
  if (update !== undefined && update !== null) {
    if (typeof update !== 'object') fail('update must be an object or null')
    const updateRecord = update as Record<string, unknown>
    if (updateRecord.provider !== 'generic') fail('update.provider must be "generic"')
    parsedUpdate = { provider: 'generic', url: text(updateRecord.url, 'update.url') }
  }
  if (typeof record.office !== 'boolean') fail('office must be a boolean')
  let parsedBackgroundNotice: boolean | undefined
  if (record.backgroundNotice !== undefined) {
    if (typeof record.backgroundNotice !== 'boolean') fail('backgroundNotice must be a boolean')
    parsedBackgroundNotice = record.backgroundNotice
  }
  let parsedCommandManagement: boolean | undefined
  if (record.commandManagement !== undefined) {
    if (typeof record.commandManagement !== 'boolean') fail('commandManagement must be a boolean')
    parsedCommandManagement = record.commandManagement
  }
  const env = record.env
  let parsedEnv: Readonly<Record<string, string>> | undefined
  if (env !== undefined) {
    if (typeof env !== 'object' || env === null || Array.isArray(env)) fail('env must be an object')
    parsedEnv = Object.fromEntries(Object.entries(env as Record<string, unknown>).map(([name, value]) => {
      if (!/^[A-Z_][A-Z0-9_]*$/iu.test(name)) fail(`env key ${name} is not an environment variable name`)
      return [name, text(value, `env.${name}`)]
    }))
  }
  const pluginRoot = optionalText(record.pluginRoot, 'pluginRoot')
  const devPluginRoot = optionalText(record.devPluginRoot, 'devPluginRoot')
  const presetsRoot = optionalText(record.presetsRoot, 'presetsRoot')
  const devPresetsRoot = optionalText(record.devPresetsRoot, 'devPresetsRoot')
  return {
    schemaVersion: 1,
    name: text(record.name, 'name'),
    appId: text(record.appId, 'appId'),
    scheme: text(record.scheme, 'scheme'),
    homeRelative: text(record.homeRelative, 'homeRelative'),
    harnessHomeRelative: text(record.harnessHomeRelative, 'harnessHomeRelative'),
    devHarnessHomeRelative: text(record.devHarnessHomeRelative, 'devHarnessHomeRelative'),
    profile: text(record.profile, 'profile'),
    profileBundles: textList(record.profileBundles, 'profileBundles'),
    ...(pluginRoot === undefined ? {} : { pluginRoot }),
    ...(devPluginRoot === undefined ? {} : { devPluginRoot }),
    ...(presetsRoot === undefined ? {} : { presetsRoot }),
    ...(devPresetsRoot === undefined ? {} : { devPresetsRoot }),
    ...(parsedRuntime === undefined ? {} : { runtime: parsedRuntime }),
    auth: {
      mode,
      secretEnv: text(authRecord.secretEnv, 'auth.secretEnv'),
      endpoint: text(authRecord.endpoint, 'auth.endpoint'),
      header: text(authRecord.header, 'auth.header'),
    },
    office: record.office,
    ...(parsedBackgroundNotice === undefined ? {} : { backgroundNotice: parsedBackgroundNotice }),
    ...(parsedCommandManagement === undefined ? {} : { commandManagement: parsedCommandManagement }),
    update: parsedUpdate,
    ...(parsedEnv === undefined ? {} : { env: parsedEnv }),
  }
}

/**
 * Resolve the manifest path and product root for this process.
 * @param environment - Process facts.
 * @returns Absolute manifest path (or undefined for defaults) and product root.
 */
export function resolveDesktopProductLocation(environment: DesktopProductEnvironment): {
  readonly manifestPath: string | undefined
  readonly root: string
} {
  const root = resolve(environment.root
    ?? (environment.packaged ? environment.resourcesPath : join(environment.appPath, '..', '..')))
  const manifestPath = environment.manifestPath ?? (environment.packaged
    ? join(environment.appPath, 'product.json')
    : undefined)
  return { manifestPath, root }
}

/**
 * Load the product manifest, or the built-in defaults when none is configured.
 * @param environment - Process facts.
 * @returns The product and the root its relative paths resolve against.
 */
export function loadDesktopProduct(environment: DesktopProductEnvironment): ResolvedDesktopProduct {
  const { manifestPath, root } = resolveDesktopProductLocation(environment)
  const explicit = environment.manifestPath !== undefined
  if (manifestPath === undefined) {
    return { product: DEFAULT_PRODUCT, root, source: undefined }
  }
  if (!existsSync(manifestPath)) {
    // A shipped application without a manifest keeps the engine's own product identity;
    // only an explicitly selected manifest must exist.
    if (!explicit) return { product: DEFAULT_PRODUCT, root, source: undefined }
    fail(`manifest not found: ${manifestPath}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`manifest is not readable JSON (${manifestPath}): ${error instanceof Error ? error.message : String(error)}`)
  }
  return { product: parseDesktopProduct(parsed), root, source: manifestPath }
}

/** Absolute data directory for this product. */
export function productDataDirectory(product: DesktopProduct, packaged: boolean, home = homedir()): string {
  const relative = packaged
    ? product.homeRelative
    : (product.homeRelative.endsWith('-dev') ? product.homeRelative : `${product.homeRelative}-dev`)
  return isAbsolute(relative) ? relative : resolve(home, relative)
}

/** Absolute harness home (QILIN_HOME) for this product. */
export function productHarnessHome(product: DesktopProduct, packaged: boolean, home = homedir()): string {
  const relative = packaged ? product.harnessHomeRelative : product.devHarnessHomeRelative
  return isAbsolute(relative) ? relative : resolve(home, relative)
}

/** Absolute plugin root, or undefined when the profile owns its packages. */
export function productPluginDirectory(product: DesktopProduct, root: string, packaged = true): string | undefined {
  const relative = packaged ? product.pluginRoot : product.devPluginRoot ?? product.pluginRoot
  return relative === undefined ? undefined : resolve(root, relative)
}

/** Absolute preset root, or undefined for the built-in root. */
export function productPresetsDirectory(product: DesktopProduct, root: string, packaged = true): string | undefined {
  const relative = packaged ? product.presetsRoot : product.devPresetsRoot ?? product.presetsRoot
  return relative === undefined ? undefined : resolve(root, relative)
}

/** Absolute runtime archive for this launch, or undefined when there is no bundled runtime. */
export function productRuntimeTar(product: DesktopProduct, root: string, packaged: boolean, resourcesPath: string): string | undefined {
  if (product.runtime === undefined) return undefined
  return packaged ? resolve(resourcesPath, product.runtime.tar) : resolve(root, product.runtime.devTar)
}
