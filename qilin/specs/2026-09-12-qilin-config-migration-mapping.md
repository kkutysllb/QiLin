# QiLin 2.x 配置到 DSH 的迁移映射

状态：调研完成，未据此修改任何默认行为
基线：dsh-v0.1.5-rc.2，QiLin 2.x 参考 main 分支的 config.example.yaml

## 1. 核验方法

在 packages/bundle/base/cordis.patch.yml 与 packages/bundle/web-app/cordis.patch.yml 中按**包名**检索，而不是按包所在的目录名检索。
这一点必须强调：按目录名 guard 检索会得出「循环检测未挂载」的错误结论，而 base 实际以包名 @deepseek-ai/dsh-repeat-tool-reminder 挂载了它。

还必须覆盖三层组合，只看 profile bundle 会误判：

1. profile bundle 层：packages/bundle/base 与 packages/bundle/web-app 的 cordis.patch.yml。
2. 预设层：packages/preset/agent-presets/presets/*/agent.cordis.yml，按会话级组合智能体能力。
   例如 dsh-tool-ask-user 与 dsh-tool-present 都不在 profile bundle 中，而在这三个预设里。
3. 示例 overlay 层：apps/cli/config/examples/*/cordis.yml，属于按需启用的可选组合。

只有三层都不出现，才能判定某项能力默认未启用。本节结论均按此口径核验。

## 2. 已由 dsh 默认承担（无需迁移动作）

| 2.x 配置 | dsh 归属 | 证据 |
|---|---|---|
| models | dsh-llm 系列 | base 挂载 dsh-llm |
| sandbox.use / allow_host_bash | dsh-sandbox-policy 与平台后端 | base 挂载，mode 默认为 workspace-write |
| read_before_write.enabled | dsh-fs-observation-policy | base 挂载；2.x 的 true 即 dsh 默认行为 |
| tool_approval | dsh-user-approval | base 挂载，policy 默认 ask（仅 danger-full-access 时为 never） |
| loop_detection | dsh-repeat-tool-reminder | base 挂载，阈值 3/5/8 |
| tool_output 截断 | dsh-spill 与 dsh-compaction-tool-result-pruner | base 均挂载 |
| summarization | dsh-compaction-basic | base 挂载 |
| uploads | dsh-attachment-local | base 挂载 |
| title | dsh-session-title | base 挂载 |
| skills / skill_scan | dsh-skill 与 dsh-tool-skill | base 均挂载 |
| subagents | dsh-subagent 系列 | base 挂载 |
| todo | dsh-tool-todo | base 挂载 |
| goal | dsh-goal | base 挂载 |
| 工具超时 | dsh-tool-call-timeout-policy | base 挂载 |
| authorization 的权限档位部分 | dsh-permission-presets 与 dsh-credentials | base 均挂载 |

结论：2.x 的多数运行时行为在 dsh 默认组合中已有等价或更强实现，因此本阶段的主体不是搬代码，而是确认归属并补齐缺口。

## 3. 明确缺口（需要产品取舍后才能实现）

| 2.x 配置 | 状况 | 说明 |
|---|---|---|
| scheduler | dsh 有 dsh-schedule，但 base 与 web-app 均未挂载；且其语义是会话内提醒，不是 cron 式计划任务 | 恢复 2.x 语义需要 QiLin 新插件，不能只靠挂载 |
| mcp | dsh 有 packages/mcp，base 未挂载，官方以示例 overlay 提供 | 若 QiLin 需要默认开启，应在 qilin bundle 挂载 |
| memory | dsh 核心无记忆能力，官方以 MCP 配方提供 | 需要选型 |
| input_polish / suggestions | 无对应 | 需要 QiLin 插件，或明确放弃 |
| guardrails / safety_finish_reason / circuit_breaker | 无对应 | 需要 QiLin 插件，或明确放弃 |
| authorization 的 RBAC 部分 | dsh 只有权限档位与凭据，没有角色模型 | 需要 QiLin 插件 |
| channel_connections | 属渠道重写范围 | 见设计规格的 S3 |

## 4. 由架构决策取代，不再迁移

| 2.x 配置 | 取代者 |
|---|---|
| database / checkpointer / run_events / stream_bridge / agent_storage | dsh 的会话事件日志与持久化模型 |
| orchestration | dsh 的 subagent 与 preset 组合模型 |
| token_usage / token_budget | dsh 的上下文窗口与压缩策略；预算语义不同，需要逐项复核 |

## 5. 2.x 中间件栈的归属

2.x 的中间件是 LangChain AgentMiddleware，直接读写 AgentState 与 RunnableConfig；dsh 没有等价的大中间件栈，
对应行为拆分为 Cordis 插件、预设中的工具包与事件监听。逐项归属如下（层按第 1 节口径）：

| 2.x 中间件 | dsh 归属 | 层 |
|---|---|---|
| ClarificationMiddleware | dsh-tool-ask-user 与 dsh-user-questions | 预设（3 个预设均挂载） |
| LoopDetectionMiddleware | dsh-repeat-tool-reminder | bundle（base，阈值 3/5/8） |
| SummarizationMiddleware | dsh-compaction-basic | bundle（base） |
| TitleMiddleware | dsh-session-title | bundle（base） |
| TodoMiddleware | dsh-tool-todo | bundle（base） |
| TokenUsageMiddleware | dsh-token-meter | bundle（base） |
| ViewImageMiddleware | dsh-tool-fs 的 read_image | bundle（base 挂载 dsh-tool-fs） |
| ToolErrorHandlingMiddleware | dsh 的工具注册表与执行管线 | bundle（内置） |
| SubagentLimitMiddleware | dsh-tool-subagent 及其配置 | 预设（3 个预设均挂载） |
| TerminalResponseMiddleware | 未见直接对应 | 需要逐项复核 |
| MemoryMiddleware | 无对应 | 缺口 |
| SafetyFinishReason / ModelLengthFinishReason | dsh-deepseek-llm-api-extensions 与结束原因处理 | bundle（base） |

结论：中间件层没有需要搬运的代码，只有 MemoryMiddleware 与 TerminalResponseMiddleware 两项需要产品取舍。

## 6. 下一步

1. 先由产品侧确认第 3 节每个缺口是「实现」还是「放弃」，避免无依据地新建插件。
2. scheduler 与 mcp 是唯一「dsh 已有能力、只差挂载或语义补齐」的两项，应优先处理。
3. memory、RBAC、guardrails 属于新增能力，工作量按插件计。
