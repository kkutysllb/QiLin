/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `qilin.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `qilin.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@qilin-agent/api-session-controller',
  '@qilin-agent/api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@qilin-agent/llm',
  '@qilin-agent/session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@qilin-agent/client-locale': ['@qilin-agent/api-remotes'],
  '@qilin-agent/client-ui-conversation': [
    '@qilin-agent/api-remotes',
    '@qilin-agent/client-ui-workspace',
  ],
  '@qilin-agent/client-ui-model-selection': ['@qilin-agent/client-ui-input-trigger'],
  '@qilin-agent/client-ui-sidebar': ['@qilin-agent/client-ui-workspace'],
  '@qilin-agent/client-ui-subagent': ['@qilin-agent/client-ui-input-trigger'],
  '@qilin-agent/client-ui-theme': ['@qilin-agent/api-remotes'],
  '@qilin-agent/client-ui-tool': ['@qilin-agent/api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@qilin-agent/brand',
  '@qilin-agent/lazy-require',
  '@qilin-agent/typert-protocol',
  '@qilin-agent/util-crypto',
  '@qilin-agent/util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  // The five exports below entered with the coding-workbench port (dual-workbench
  // S3) and were human-reviewed 2026-10-06: each is a pure factory or data
  // projection with no module-level mutable state, so two installed copies
  // produce interchangeable values.
  // Installs waterfall listeners on the caller-provided Context and selection ref;
  // all state is caller-owned, so any copy of the function behaves identically.
  '@qilin-agent/agent': ['installModelSelection'],
  '@qilin-agent/credentials': ['credentialKey'],
  // A pure type-assertion brand (`FsVersion(v) { return v as FsVersion }`) with no
  // runtime identity, so two installed copies produce interchangeable values. It is
  // added here because packages/api/workspace-files re-brands the opaque wire token
  // on its way back to the provider, and reviewed as an exception to the default.
  '@qilin-agent/fs': ['FsVersion'],
  '@qilin-agent/dsh-compat': ['clientDeclarationOf', 'dshCompatModuleId'],
  '@qilin-agent/deque': ['Deque'],
  '@qilin-agent/llm': ['callConfigEquals', 'createUserMessage'],
  '@qilin-agent/session-format': ['sessionFormatLogFilename'],
  // A validating brand over a number (`SessionLogOffset(v)`), no runtime identity —
  // the FsVersion precedent.
  '@qilin-agent/session': ['SessionLogOffset'],
  // Pure input → detached versioned payload projection.
  '@qilin-agent/subagent': ['snapshotSubagentDescriptor'],
  '@qilin-agent/timeout': ['MAX_TIMER_DELAY_MS'],
  // Pure ToolDefinition factory: shapes the caller's options into one plain object.
  '@qilin-agent/tools': ['defineTool'],
  '@qilin-agent/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  '@qilin-agent/client-connection': ['OperatorPeer'],
  '@qilin-agent/subprocess': ['SubprocessExecutableNotFoundError'],
  '@qilin-agent/scope': ['carrierKeyOf', 'createScope', 'scopeOf', 'scopeTarget'],
  '@qilin-agent/session': ['SESSION_FORMAT_VERSION'],
  '@qilin-agent/session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(qilinField: unknown): boolean {
  return isRecord(qilinField) && Object.hasOwn(qilinField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  qilinField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(qilinField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}
