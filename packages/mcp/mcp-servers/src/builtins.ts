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
 * @module @qilin-agent/mcp-servers/builtins
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

/**
 * Recommended MCP servers, in display order.
 *
 * KStock patch: 产品只保留客户自定义 MCP 配置入口，不提供推荐服务器。
 * 上游清单（fetch / context7 / sequential-thinking / playwright）在设置页
 * 表现为「推荐服务器」卡片，产品不需要。数据模型保持不变：`builtinByName`
 * 与快照的 `builtins` 字段仍在，客户自装服务器照常按 serverName 匹配。
 */
export const MCP_BUILTINS: readonly McpBuiltinDefinition[] = []

/**
 * The recommended server whose `serverName` is `name`.
 * @param name - a configured entry's `serverName`.
 * @returns the matching definition, or undefined for a server the user configured.
 */
export function builtinByName(name: string): McpBuiltinDefinition | undefined {
  return MCP_BUILTINS.find(candidate => candidate.name === name)
}
