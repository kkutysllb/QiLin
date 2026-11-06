# Agent Note: 工具调用持有的是活 Agent

Status: implemented

[English](2026-11-06-tool-execution-caller-is-a-live-agent.md) | 中文

## 问题

`ToolExecutionInput.agent` 的类型是活的 `Agent`，而工具实现读它的方式很窄：`exec.agent.session` 用来取目录或追加持久记录，`exec.agent.id` 用来定作业归属，`exec.agent.options` 用来选路由。这些读法让一个结构化子集看起来才是诚实契约。一个 keyless PTC e2e 用例就手工拼出了那个子集 —— `{ id, session, ctx }` —— 再断言成 `Agent`，因为目录解析会对调用方执行 `agent.ctx.fiber.assertActive()`。

同一个字段有两类消费者，只按其中一类派生出的子集必然误述另一类。观察型工具只读调用方的身份、Session 与路由。驱动型工具以调用方的身份行事：用它发消息、在它名下创建子 Agent、读它的生命周期状态。

## 决策

`ToolExecutionInput.agent` 与 `PtcDispatchLog.agent` 持有活的 `Agent`。这个字段陈述的是工具可以驱动的那个调用方，而不是某个工具恰好会读到的若干事实的投影。

字段必须满足什么，由驱动型工具决定。`tool-agent-team` 把调用方传给 `agentTeams.sendMessage`、`agentTeams.interrupt` 与 `agentTeams.createTask`；`tool-ralph` 与 `tool-subagent` 在它名下创建子 Agent；`tool-workflow` 与 `plan-mode` 把它交给各自的服务；`goal/tool-goal` 为判定权限读 `agent.status`。观察型工具（`tool-bash`、`session-checkpoint-policy`、`tool-todo`）只读 `session` 与 `id`，但它们消费的是同一个字段，无法把它降窄。

因此 PTC e2e 测试台改为组装出「调用方」本身：`typedPtcModeHarness` 挂载 `LlmRuntime`、`AgentRegistry` 与 `AgentLoop`，typed 用例经 `ctx.agentLoop.create(...)` 取得调用方 —— 一个走产品自身创建路径的已发布 Agent。

这样 `ToolExecution.agent` 仍如[发起方作用域决策](2026-07-15-agent-initiator-scope.zh.md)所要求的那样保持显式，同时把这个显式字段承载什么写清楚。

## 收窄调用方类型的代价

把字段类型换成 `{ id, session, options, ctx, inject }`，在动任何测试之前就产生 90 个类型错误，分布在 36 个文件。仅 `tool-agent-team` 就有九处以调用方身份驱动的调用点。`ApprovalService` 的审批者主体默认是 `Agent`，于是 shell、filesystem 与 plugin-manager 各行的 `EscalationApprover` 比较全部失配。`goal/tool-goal/src/authority.ts` 读 `agent.status`，仓库内还有若干 spec 读 `exec.agent.inbox`。

消掉这些错误只剩两种形态，都比现行契约更差：把约十五个公开服务签名放宽到比它们实际使用更弱的类型，或者让每个驱动方按 id 从 `ctx.agents` 重新取回活 Agent、取不到就失败。前者削弱这些服务；后者为找回循环本来就持有的调用方，多加一次查表和一个失败态。

## 考虑过的替代方案

**把 `ToolExecutionInput.agent` 收窄成工具调用方视图。** 即上节实测的连锁反应：要么放宽十五个服务契约，要么在每个驱动方里重新查活 Agent。当前没有任何消费者需要这个窄视图，唯一提出需求的是一个场景本身并不依赖它的测试替身。

**同时携带窄调用方视图与活 Agent 两个字段。** 同一份身份落在两个字段上，每个消费者都得声明自己接受哪一个；只拿到前者的工具会在单字段本会失败的同一处失败。

**只在观察型工具的调用点声明窄类型。** 观察型工具收到的是同一个 `Agent`，这份声明只会成为 `Pick<Agent, …>` 一个没人用的别名。

**在测试替身上实现全部 `Agent` 成员。** 这样它能满足接口却什么都没证明：`inbox`、`status`、`cancel`、`whenIdle` 永远不会被执行，而目录解析仍然是在断言一个没有任何 Agent 生命周期创建的 Context。

**保留基线条目。** 那条被记录的断言说明的是「测试组装了一个不完整的调用方」。缺的是组装，不是断言。

## 结果

keyless typed PTC 用例现在跑的是已发布 Agent，走产品自身的创建路径，因此 `fiber.assertActive()` 观察的是真实生命周期，而不是借来的 Context。代价是测试台更重：该文件为每个 typed 用例都挂载 `LlmRuntime`、`AgentRegistry` 与 `AgentLoop`，包括从不传调用方的那些用例。

请求字段保留完整句柄，工具因此无需新类型或查表就能驱动它的调用方。将来若真有消费者需要只读视图，它需要自己证明没有驱动方共用这个字段 —— 共用正是它这次无法被收窄的原因。

## 验证

- `apps/cli/tests/profiles/headless/tests/ptc.e2e.ts` 同时跑 keyless typed 套件与带密钥的真实模型用例：七例覆盖目录解析、PTC 派发与运行时检查，全部经已发布 Agent。
- `pnpm run verify-no-unknown-casts` 报告 1494 条已记录断言，无新增。
