/**
 * Shared declarations for the package.json fields used by QiLin plugin authors.
 * Each reader owns JSON validation and resolved defaults.
 * @module @qilin/package-manifest/types
 */

/** Package identity and metadata; local profile readers may accept a partial declaration. */
export interface QilinPackageManifest {
  /** Published npm package name. */
  name: string
  /** Published npm package version. */
  version: string
  /** Package summary for discovery and display. */
  description?: string
  /** Prevent npm publication, for example for local profile projects. */
  private?: boolean
  /** Packages installed alongside this package. */
  dependencies?: Record<string, string>
  /** Compatible versions of packages supplied by the consuming project. */
  peerDependencies?: Record<string, string>
  /** Runtime requirements; declared compatibility is advisory until a reader enforces it. */
  engines?: QilinEnginesManifest
  /** QiLin-specific author declarations. */
  qilin?: QilinManifest
}

/** Public author fields under `package.json.qilin`; a package may declare several roles. */
export interface QilinManifest {
  /** Manifest format version, independent of the npm package and Session format versions. */
  manifestVersion?: 1
  /** Bundle metadata consumed by the profile launcher. */
  bundle?: QilinBundleManifest
  /** Profile metadata consumed by the profile launcher. */
  profile?: QilinProfileManifest
  /** Client module loading and build metadata. */
  client?: QilinClientManifest
}

/** Runtime version requirements under `package.json.engines`. */
export interface QilinEnginesManifest {
  /** Compatible QiLin versions as a SemVer range, including an exact version. */
  qilin?: string
  /** Compatible Node.js versions. */
  node?: string
  /** Compatible npm versions. */
  npm?: string
  /** Requirements for additional runtimes or package managers. */
  [engine: string]: string | undefined
}

/** The configuration layer exported by a bundle package. */
export interface QilinBundleManifest {
  /** Patch file path relative to the declaring package root. */
  patch: string
}

/** The bundle composition declared by a profile directory. */
export interface QilinProfileManifest {
  /** Ordered bundle layer list, using installed package names. */
  bundles?: string[]
}

/** Literal text or translations indexed by lowercase language id, with a required English fallback. */
export type LocalizedText = string | { readonly en: string; readonly [locale: string]: string }

/** Validated plugin display fields and diagnostics from exported locales, manifests, or icon files. */
export interface PluginLocalizedMeta {
  /** Display title; omission preserves the consumer's technical-name fallback. */
  readonly title?: LocalizedText
  /** Display introduction after locale and package-field fallback. */
  readonly description?: LocalizedText
  /** Base64 image data URL read from the manifest's icon file; render as an image, not inline markup. */
  readonly icon?: string
  /** Unmodified local metadata diagnostic; the plugin remains manageable. */
  readonly error?: string
}

/** Client module declaration read by client-modules and the client build. */
export interface QilinClientManifest {
  /** Client platform identifier; the Web consumer selects `web`. */
  platform: string
  /** Informational package-name dependencies, not Cordis service injection. */
  inject?: string[]
  /** Boot phase-one registration barrier; absent means the shared application batch. */
  immediately?: boolean
  /**
   * Exact module-table requests beyond the implicit client baseline, including
   * subpaths such as `<pkg>/client`; absent means baseline externals only.
   * Type-only imports are erased and create no module request.
   */
  external?: string[]
}
