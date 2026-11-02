/**
 * Wire model of the MCP server settings service. Every field is plain JSON and
 * crosses the Typert Remote boundary in both directions.
 * @module @qilin-agent/mcp-servers/types
 */

declare module '@qilin-agent/typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The submitted serverName is outside the pattern the Loader accepts. */
    'mcp-server/invalid-name': {}
    /** A stdio server draft names no executable. */
    'mcp-server/missing-command': {}
    /** A Streamable HTTP server draft names no endpoint. */
    'mcp-server/missing-url': {}
    /** The submitted endpoint is not an http or https URL. */
    'mcp-server/invalid-url': {}
    /** The patch layer cannot be read or addressed, so no write was attempted. */
    'mcp-server/patch-file': {}
  }
}

/** Transport kinds an `mcp-client` entry can declare. */
export type McpTransport = 'stdio' | 'streamable-http'

/** One configured MCP server, as the settings section lists it. */
export interface McpServerView {
  /**
   * The namespace the entry reserves. It is also the suffix of the Loader
   * entry id and the middle segment of the server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`).
   */
  readonly serverName: string
  /** Loader entry id this settings section addresses the server by: `mcp-<serverName>`. */
  readonly entryId: string
  readonly transport: McpTransport
  /** Executable and arguments of a stdio server; the endpoint URL of a Streamable HTTP one. */
  readonly detail: string
  /** Whether the entry is enabled in the patch layer. */
  readonly enabled: boolean
  /** stdio: executable the entry runs; empty for a Streamable HTTP entry. */
  readonly command: string
  /** stdio: arguments in order; empty for a Streamable HTTP entry. */
  readonly args: readonly string[]
  /** stdio: child working directory the entry sets; empty when it sets none. */
  readonly cwd: string
  /** Streamable HTTP: endpoint URL; empty for a stdio entry. */
  readonly url: string
  /** Whether a failed initial connection fails entry activation. */
  readonly failOnStartupError: boolean
}

/** One complete read of the user patch layer. */
export interface McpServersSnapshot {
  /** Absolute path of the patch layer this service reads and writes. */
  readonly patchPath: string
  /** Configured servers in patch-file order. */
  readonly servers: readonly McpServerView[]
  /**
   * Why the patch layer cannot be read or addressed. Present means the file did
   * not parse or is not an entry list: no mutation is offered until the user
   * repairs the file by hand, and every mutation rejects with the same reason.
   */
  readonly error?: string
}

/** One server's settings, as the settings section submits them. */
export interface McpServerDraft {
  /**
   * Namespace the entry reserves, and the identity of an existing entry this
   * drafts replaces. It must match `[A-Za-z0-9_-]{1,32}`.
   */
  readonly serverName: string
  readonly transport: McpTransport
  /** stdio: executable resolved on the harness's `PATH`. */
  readonly command?: string
  /** stdio: arguments passed directly, without shell interpolation. */
  readonly args?: readonly string[]
  /** stdio: child working directory; omission uses the harness directory. */
  readonly cwd?: string
  /** Streamable HTTP: MCP endpoint URL. */
  readonly url?: string
  /** Per-tool-call timeout in milliseconds; omission uses the `mcp-client` default. */
  readonly toolCallTimeoutMs?: number
  /** Whether a failed initial connection fails entry activation. */
  readonly failOnStartupError?: boolean
}
