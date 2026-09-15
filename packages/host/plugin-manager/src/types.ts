/** Public Remote payloads for profile-scoped plugin management. */

/** One installed bundle layer that a user can manage from Settings. */
export interface UserPluginEntry {
  /** Installed package name. */
  readonly name: string
  /** Installed package version, or null when package metadata is unavailable. */
  readonly version: string | null
  /** Bundle layer position in profile order. */
  readonly layer: number
  /** Whether this layer comes from the shipped profile template or profile dependencies. */
  readonly source: 'builtin' | 'user'
  /**
   * Whether the current row can be upgraded through the manager. A shipped layer
   * carries this only when the profile owns its resolution (an in-place upgrade
   * channel); layers that move with the installation do not.
   */
  readonly updatable: boolean
  /** Whether the current row can be removed through the manager. Shipped layers never can. */
  readonly removable: boolean
}

/** Point-in-time installed plugin projection. */
export interface PluginManagerSnapshot {
  /** Profile being managed. */
  readonly profile: string
  /** Installed bundle layers in activation order. */
  readonly entries: readonly UserPluginEntry[]
}

/** Result of one profile package mutation. */
export interface PluginMutationReceipt {
  /** Whether pnpm changed the profile project. */
  readonly changed: boolean
  /** New bundle composition is applied after the QiLin process restarts. */
  readonly restartRequired: boolean
  /** Last retained lines from pnpm and reconciliation diagnostics. */
  readonly outputTail: readonly string[]
}

/** One available npm update. */
export interface PluginUpdateEntry {
  /** Installed package name. */
  readonly name: string
  /** Installed version. */
  readonly currentVersion: string | null
  /** Registry latest version, or null when it could not be read. */
  readonly latestVersion: string | null
}

/** Update-check response. */
export interface PluginUpdateSnapshot { readonly entries: readonly PluginUpdateEntry[] }

/** One GitHub repository returned by the DSH plugin community search. */
export interface CommunityPluginEntry {
  readonly fullName: string
  readonly description: string | null
  readonly stars: number
  readonly updatedAt: string
  readonly url: string
}

/** GitHub community search response. */
export interface CommunityPluginSnapshot {
  readonly entries: readonly CommunityPluginEntry[]
  readonly page: number
  readonly hasMore: boolean
}
