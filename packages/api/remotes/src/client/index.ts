/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@qilin-agent/kylin'
import agentPresetsRemote from '@qilin-agent/agent-presets/remote'
import commandsRemote from '@qilin-agent/commands/remote'
import settingsControllerRemote from '@qilin-agent/api-settings-controller/remote'
import officeToPdfRemote from '@qilin-agent/office-to-pdf/remote'
import userQuestionsRemote from '@qilin-agent/user-questions/remote'
export type {} from '@qilin-agent/user-questions/remote'
import goalsRemote from '@qilin-agent/goal/remote'
import scheduleRemote from '@qilin-agent/schedule/remote'
import llmRemote from '@qilin-agent/llm/remote'
import dynamicRemote from '@qilin-agent/kylin-host-runner/remote'
import pluginInventoryRemote from '@qilin-agent/host-plugin-inventory/remote'
import pluginManagerRemote from '@qilin-agent/plugin-manager/remote'
import pluginRegistryProbeRemote from '@qilin-agent/client-ui-plugin-manager/remote'
import mcpServersRemote from '@qilin-agent/mcp-servers/remote'
import messageFeedbackRemote from '@qilin-agent/message-feedback/remote'
import permissionPresetsRemote from '@qilin-agent/permission-presets/remote'
import sessionFeedbackRemote from '@qilin-agent/command-feedback/remote'
import fileUploadsRemote from '@qilin-agent/client-file-upload/remote'
import sessionReferencesRemote from '@qilin-agent/session-reference/remote'
import subagentsRemote from '@qilin-agent/subagent/remote'
import sessionRemote from '@qilin-agent/api-session-controller/remote'
import workspaceRemote from '@qilin-agent/api-workspace-controller/remote'
import jobRemote from '@qilin-agent/api-job-controller/remote'
import terminalRemote from '@qilin-agent/api-terminal-controller/remote'
import workspaceFilesRemote from '@qilin-agent/api-workspace-files/remote'
import workspaceGitRemote from '@qilin-agent/api-workspace-git/remote'
import sidebarOpensRemote from '@qilin-agent/sidebar-opens/remote'
import type { ClientRemote } from '@qilin-agent/api-gateway/client'

export type { ClientRemote } from '@qilin-agent/api-gateway/client'
export type {
  BundleInfo, BundleRowInfo, ChangeResult, CommunityPluginEntry, CommunityPluginSnapshot, IncompatiblePlugin,
  InstallBundleOptions, InstallSpecKind,
  ManagementError, PackageResult, PluginAudience, PluginChange, PluginEntryId, PluginInfo, PluginInspectProblem,
  PluginInstallCancellation,
  PluginInstallFailureKind, PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId, PluginRegistries, PluginSpecInspection,
  PluginUpdateEntry, PluginUpdateSnapshot, ReadOnlyReason, Registry,
} from '@qilin-agent/plugin-manager/types'
export type {} from '@qilin-agent/plugin-manager/remote'
export type {} from '@qilin-agent/client-ui-plugin-manager/remote'
export type { PluginInventorySnapshot } from '@qilin-agent/host-plugin-inventory/types'
export type {} from '@qilin-agent/agent-presets/remote'
export type {} from '@qilin-agent/commands/remote'
export type {} from '@qilin-agent/api-settings-controller/remote'
export type {} from '@qilin-agent/goal/remote'
export type {} from '@qilin-agent/schedule/remote'
export type {} from '@qilin-agent/office-to-pdf/remote'
export type {} from '@qilin-agent/llm/remote'
export type {} from '@qilin-agent/host-plugin-inventory/remote'
export type {} from '@qilin-agent/mcp-servers/remote'
export type {} from '@qilin-agent/message-feedback/remote'
export type {} from '@qilin-agent/permission-presets/remote'
export type {} from '@qilin-agent/command-feedback/remote'
export type {} from '@qilin-agent/client-file-upload/remote'
export type {} from '@qilin-agent/session-reference/remote'
export type {} from '@qilin-agent/subagent/remote'
export type * from '@qilin-agent/subagent/client'
export type {} from '@qilin-agent/api-session-controller/remote'
export type * from '@qilin-agent/api-session-controller/types'
export type {} from '@qilin-agent/api-workspace-controller/remote'
export type * from '@qilin-agent/api-workspace-controller/types'
export type {} from '@qilin-agent/api-workspace-files/remote'
export type * from '@qilin-agent/api-workspace-files/types'
export type {} from '@qilin-agent/api-workspace-git/remote'
export type {} from '@qilin-agent/api-terminal-controller/remote'
export type {} from '@qilin-agent/sidebar-opens/remote'
export type * from '@qilin-agent/api-terminal-controller/types'
export type {} from '@qilin-agent/api-job-controller/remote'
export type * from '@qilin-agent/api-job-controller/types'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@qilin-agent/commands/types'
export type {} from '@qilin-agent/kylin-host-runner/types'
export type {} from '@qilin-agent/credentials/types'
export type {} from '@qilin-agent/llm/types'
export type {} from '@qilin-agent/agent-presets/types'
export type {} from '@qilin-agent/permission-presets/types'
export type {} from '@qilin-agent/settings/types'
export type {} from '@qilin-agent/user-approval/types'
export type {} from '@qilin-agent/user-questions/types'
export type {} from '@qilin-agent/user-questions/types'
export type {} from '@qilin-agent/api-session-controller/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ConnectionHandle, ConnectionSinks, ContentBlock,
  MessageId,
  RpcId, RpcRequest, RpcResponse, RpcResult, SessionId,
  StreamChunk,
} from '@qilin-agent/client-connection/client'
export type {} from '@qilin-agent/api-gateway/client'
export type {} from '@qilin-agent/kylin-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@qilin-agent/kylin-host-runner/types'
// Credential state vocabulary for the credentials namespace (values never ride it).
export type { CredentialInfo } from '@qilin-agent/credentials/types'
// Redacted namespace vocabulary for the settings namespace (secrets never ride
// it). It travels with its seam, whose `./types` the Client face already reads.
export type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView,
} from '@qilin-agent/settings/types'
// Provider registry and discovery vocabulary for the llm namespace.
export type {
  LlmConfigurableProvider, LlmDiscoveredModel,
  LlmModelDiscoveryRequest, LlmProviderInfo,
} from '@qilin-agent/llm/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@qilin-agent/file-reference/types'
export type { SessionReferenceMentionCandidate } from '@qilin-agent/session-reference/types'

// The Remote failure vocabulary, re-exported so business packages keep naming
// this assembly alone. Types only: a value export would make spec imports load
// this module's owner /remote artifacts; specs take RemoteError from
// qilin-client-test-runtime instead.
export type {
  RemoteErrorCode, RemoteErrorDetailsMap, RemoteFailure, RemoteResult,
} from '@qilin-agent/typert-protocol'
export type { RemoteHostFacts } from '@qilin-agent/api-gateway/client'

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      agentPresetsRemote, commandsRemote, settingsControllerRemote, goalsRemote, llmRemote, dynamicRemote, scheduleRemote,
      pluginInventoryRemote, pluginManagerRemote, pluginRegistryProbeRemote, mcpServersRemote, messageFeedbackRemote, sessionFeedbackRemote,
      fileUploadsRemote, sessionReferencesRemote,
      permissionPresetsRemote, subagentsRemote, sessionRemote, jobRemote, workspaceRemote,
      workspaceFilesRemote, workspaceGitRemote, terminalRemote, officeToPdfRemote, userQuestionsRemote,
      sidebarOpensRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
