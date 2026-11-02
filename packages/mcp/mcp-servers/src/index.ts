/**
 * MCP server settings service: reads, adds, edits, enables, disables, and
 * removes the mcp-client entries of the home-level user patch layer.
 *
 * Every mutation writes the patch layer the launcher already watches, so a
 * saved server joins the running tree through Cordis HMR without a restart.
 * The service is Remote-only — it declares no same-process Context merge —
 * because its only consumer is the settings section.
 * @module @qilin-agent/mcp-servers
 */

import type { Context } from '@qilin-agent/kylin'
import { Remote, RemoteError, TypertRemoteService } from '@qilin-agent/typert-protocol'
import {
  McpServerNameError,
  UserPatchFile,
  UserPatchFileError,
  configString,
  configStringList,
  describeEntry,
  type UserPatchEntry,
} from './patch-file.ts'
import type { McpServerDraft, McpServersSnapshot, McpServerView } from './types.ts'

export type * from './types.ts'

/** One configured entry as the settings section lists it. */
function serverView(entry: UserPatchEntry): McpServerView {
  const described = describeEntry(entry)
  return {
    serverName: entry.serverName,
    entryId: entry.entryId,
    transport: described.transport,
    detail: described.detail,
    enabled: entry.enabled,
    command: configString(entry.config, 'command', ''),
    args: configStringList(entry.config, 'args'),
    cwd: configString(entry.config, 'cwd', ''),
    url: configString(entry.config, 'url', ''),
    failOnStartupError: entry.config.failOnStartupError === true,
  }
}

/**
 * Refuse a draft the Loader could not activate, before the patch layer is
 * touched: a stdio server with no executable, or a Streamable HTTP server with
 * no usable endpoint URL. The namespace itself is checked by the write that
 * owns the entry id.
 * @param draft - the submitted settings.
 * @throws {RemoteError} naming the field the draft is missing or malformed.
 */
function assertDraft(draft: McpServerDraft): void {
  if (draft.transport === 'stdio') {
    if (draft.command === undefined || draft.command.trim().length === 0) {
      throw new RemoteError('mcp-server/missing-command', 'a stdio server needs the executable to start', {})
    }
    return
  }
  if (draft.url === undefined || draft.url.trim().length === 0) {
    throw new RemoteError('mcp-server/missing-url', 'a Streamable HTTP server needs its endpoint URL', {})
  }
  let protocol: string
  try {
    protocol = new URL(draft.url).protocol
  } catch {
    throw new RemoteError('mcp-server/invalid-url', 'the endpoint URL is not a URL', {})
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new RemoteError('mcp-server/invalid-url', 'the endpoint URL must use http or https', {})
  }
}

/** Remote-only manager of the user patch layer's MCP server entries. */
export class McpServers extends TypertRemoteService {
  private readonly file = new UserPatchFile()

  /**
   * @param ctx - host context that owns this Remote service.
   */
  constructor(ctx: Context) {
    super(ctx, 'mcpServers')
  }

  /**
   * Read every configured server.
   * @param signal - caller cancellation.
   * @returns the snapshot; its error field carries the reason when the patch layer is not addressable.
   */
  @Remote
  async list(signal: AbortSignal): Promise<McpServersSnapshot> {
    signal.throwIfAborted()
    const read = await this.file.read()
    return read.error === undefined
      ? this.snapshot(read.entries)
      : this.snapshot([], read.error)
  }

  /**
   * Write one server's settings, adding its entry when the layer has none.
   * @param draft - the complete settings for one server; serverName identifies an existing entry.
   * @param signal - caller cancellation.
   * @returns the fresh snapshot after the write.
   */
  @Remote
  async save(draft: McpServerDraft, signal: AbortSignal): Promise<McpServersSnapshot> {
    signal.throwIfAborted()
    assertDraft(draft)
    await this.mutate(() => this.file.upsert(draft))
    return await this.list(signal)
  }

  /**
   * Remove one server's entry from the layer. The wire verb is `delete`
   * because every Remote namespace service answers `remove` itself, and an
   * installed method may not shadow the namespace service's own member.
   * @param serverName - the namespace to remove; an unknown name is not an error.
   * @param signal - caller cancellation.
   * @returns the fresh snapshot after the write.
   */
  @Remote
  async delete(serverName: string, signal: AbortSignal): Promise<McpServersSnapshot> {
    signal.throwIfAborted()
    await this.mutate(() => this.file.remove(serverName))
    return await this.list(signal)
  }

  /**
   * Enable or disable one configured server.
   * @param serverName - the namespace to change.
   * @param enabled - the next enablement.
   * @param signal - caller cancellation.
   * @returns the fresh snapshot after the write.
   */
  @Remote
  async setEnabled(serverName: string, enabled: boolean, signal: AbortSignal): Promise<McpServersSnapshot> {
    signal.throwIfAborted()
    await this.mutate(() => this.file.setEnabled(serverName, enabled))
    return await this.list(signal)
  }

  /** Run one patch-layer mutation, reporting a refused file or name as a wire refusal. */
  private async mutate(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation()
    } catch (error) {
      if (error instanceof McpServerNameError) {
        throw new RemoteError('mcp-server/invalid-name', error.message, {})
      }
      if (error instanceof UserPatchFileError) {
        throw new RemoteError('mcp-server/patch-file', error.message, {})
      }
      /* v8 ignore next -- any other failure is a defect the caller must see */
      throw error
    }
  }

  /** Assemble one snapshot, omitting the error field when the layer parsed. */
  private snapshot(entries: readonly UserPatchEntry[], error?: string): McpServersSnapshot {
    return {
      patchPath: this.file.path,
      servers: entries.map(serverView),
      ...error === undefined ? {} : { error },
    }
  }
}

export default McpServers
