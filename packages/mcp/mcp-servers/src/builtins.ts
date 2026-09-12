/**
 * Recommended MCP servers the settings section offers.
 *
 * The definitions mirror the set KCoder ships. QiLin installs none of them on
 * its own: the settings section adds one only when the user asks, so a machine
 * without `uvx` or `npx` never carries a server that cannot start, and no
 * deployment pays for servers its user did not choose.
 *
 * Ids are stable because the settings section keys localized names and
 * descriptions by them.
 * @module @qilin/mcp-servers/builtins
 */

/** One recommended MCP server definition, expressed as an `mcp-client` stdio config. */
export interface McpBuiltinDefinition {
  /** Stable catalog id. */
  readonly id: string
  /** `serverName` the entry reserves. */
  readonly name: string
  /** Executable the entry runs. */
  readonly command: string
  /** Arguments passed to {@link McpBuiltinDefinition.command}. */
  readonly args: readonly string[]
}

/** Recommended MCP servers, in display order. */
export const MCP_BUILTINS: readonly McpBuiltinDefinition[] = [
  {
    id: 'fetch',
    name: 'fetch',
    command: 'uvx',
    args: ['mcp-server-fetch'],
  },
  {
    id: 'context7',
    name: 'context7',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
  },
  {
    id: 'sequential-thinking',
    name: 'sequential-thinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
  {
    id: 'playwright',
    name: 'playwright',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
  },
]

/**
 * The recommended server whose `serverName` is `name`.
 * @param name - a configured entry's `serverName`.
 * @returns the matching definition, or undefined for a server the user configured.
 */
export function builtinByName(name: string): McpBuiltinDefinition | undefined {
  return MCP_BUILTINS.find(candidate => candidate.name === name)
}
