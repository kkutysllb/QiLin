/**
 * Wire model of the MCP server settings service. Every field is plain JSON and
 * crosses the Typert Remote boundary in both directions.
 * @module @qilin/mcp-servers/types
 */

declare module '@qilin/typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The submitted serverName is outside the pattern the Loader accepts. */
    'mcp-server/invalid-name': {}
    /** A stdio server draft names no executable. */
    'mcp-server/missing-command': {}
    /** A Streamable HTTP server draft names no endpoint. */
    'mcp-server/missing-url': {}
    /** The submitted endpoint is not an http or https URL. */
    'mcp-server/invalid-url': {}
    /** No recommended server carries the requested id. */
    'mcp-server/unknown-builtin': { readonly id: string }
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
  /** Recommended-server id this entry matches; null for a server the user configured. */
  readonly builtin: string | null
}

/** One recommended MCP server the settings section can add. */
export interface McpBuiltinView {
  /** Stable catalog id. The settings section localizes the name and description from it. */
  readonly id: string
  /** `serverName` the added entry reserves. */
  readonly name: string
  /** Executable the entry runs. */
  readonly command: string
  /** Arguments passed to {@link McpBuiltinView.command}. */
  readonly args: readonly string[]
  /** Whether `command` resolves to an executable on the harness's own resolved `PATH`. */
  readonly available: boolean
}

/** One complete read of the user patch layer. */
export interface McpServersSnapshot {
  /** Absolute path of the patch layer this service reads and writes. */
  readonly patchPath: string
  /** Configured servers in patch-file order. */
  readonly servers: readonly McpServerView[]
  /** Recommended servers, each carrying its current availability. */
  readonly builtins: readonly McpBuiltinView[]
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
