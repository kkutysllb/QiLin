export type ToolSource = 'builtin' | 'mcp' | 'skill' | 'subagent' | 'community';

export interface Tool {
  name: string;
  description: string;
  source: ToolSource;
  enabled: boolean;
  /** MCP 来源时填写 */
  mcp_server?: string;
  /** 是否需要沙箱 */
  requires_sandbox?: boolean;
  /** 输入参数 schema(JSON Schema 简化版) */
  parameters?: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  /** 来源分类标签 */
  tags?: string[];
}
