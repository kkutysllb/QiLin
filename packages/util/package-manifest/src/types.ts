/**
 * Shared declarations for `package.json.qilin`.
 * Each reader owns JSON validation and resolved defaults.
 * @module @qilin/package-manifest/types
 */

/** The `qilin` property of an npm manifest; a package may declare several roles. */
export interface QilinManifest {
  /** Bundle metadata consumed by the profile launcher. */
  bundle?: QilinBundleManifest
  /** Profile metadata consumed by the profile launcher. */
  profile?: QilinProfileManifest
  /** Client module loading and build metadata. */
  client?: QilinClientManifest
  /** Config directories consumed by the experimental deployment-image packer. */
  configTrees?: QilinConfigTreeDeclaration[]
  /** Adjacent Session migration metadata consumed by the workspace catalog generator. */
  sessionFormatMigration?: QilinSessionFormatMigrationManifest
  /**
   * Launcher-generated module proxy metadata, not an author configuration entry.
   * @internal
   */
  moduleFallback?: QilinModuleFallbackManifest
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
  /** User patch lifecycle; omitted means `live` for custom profiles. */
  patchReload?: ProfilePatchReload
}

/** Whether user patch files reload while a profile remains active or apply only at startup. */
export type ProfilePatchReload = 'live' | 'startup'

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

/** One config directory read from the CLI package by the experimental image packer. */
export interface QilinConfigTreeDeclaration {
  /** Non-empty destination path in the image; mount values must be unique. */
  mount: string
  /** Non-empty source directory path relative to the declaring package root. */
  path: string
  /** Include the directory's YAML plugin rows in the package roster; absent means false. */
  scanRoster?: boolean
}

/**
 * Adjacent Session migration metadata declared on disk. The catalog generator
 * discovers only packages/session/session-format-vN-to-vN+1, not external plugins.
 */
export interface QilinSessionFormatMigrationManifest {
  /** Non-negative safe integer source version; negative zero is rejected. */
  from: number
  /** Non-negative safe integer target version, exactly from + 1. */
  to: number
  /** Non-empty package export path, such as `.` or `./migration`. */
  export: string
  /** Non-empty named export of the migration implementation. */
  migration: string
  /** Non-empty named export of the source version codec. */
  sourceCodec: string
  /** Non-empty named export of the target version codec. */
  targetCodec: string
  /** Non-empty named export of the target header validator. */
  targetHeaderValidator: string
  /** Non-empty named export of the target version restorer. */
  targetRestorer: string
}

/**
 * Metadata generated and read by the launcher's module fallback proxies.
 * @internal
 */
export interface QilinModuleFallbackManifest {
  /** Package export subpaths mapped to resolved target file URLs. */
  targets: Record<string, string>
}
