---
description: "面向模型的 subagent 委派工具，供用户与维护者配置、组合或排查基于 subagent 提供方的委派。"
kind: "package-reference"
---

# @qilin-agent/tool-subagent

[English](README.md) | 中文

## 概述

使用本包可为 agent 提供一个具名工具，把工作委派给已配置的子 agent 后端。每次调用都会启动一个受管的 activation 并返回子会话 id；运行时负责完成通知与清理。本地子会话默认保留常驻以支持消息与恢复，配置为 `one-shot` 时随作答 turn 结束拆除；外部后端执行单个任务并通过完成通知返回最终结果。受支持的后端可公开获准的子级 LLM 路由；每个实例均可设置子 agent 的 persona、工具权限与深度限制。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

可选参数 `cwd` 选择子级的初始工作目录。相对路径以调用者当前目录解析；省略时继承该目录。调用者切换目录时，已有子级保留自己的目录。

每个委派目标挂载一个实例，且每个实例的 `toolName` 必须不同。工具与其提供方同时存在、同时消失，因此同级加载顺序与提供方重新加载都不会让工具悬空。

### 最小配置

先加载 subagent 服务、一个进程内或远程后端与本工具，然后指定提供方名称。此组合暴露一个委派给 `spawn` 后端的 `subagent` 工具：

```yaml
- name: '@qilin-agent/subagent'
- name: '@qilin-agent/subagent-spawn-in-process'
- name: '@qilin-agent/tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | 必填 | `ctx.subagents` 上的提供方名称（如 `spawn`、`fork`、`acp`） |
| `toolName` | `subagent` | 面向模型的工具名称；每个已加载实例必须不同 |
| `backgroundMode` | `continuable` | 本地子代理的生命周期：`continuable` 保留常驻，供后续 turn 与消息使用；`one-shot` 在其作答 turn 结算时拆除。外部后端按契约即一次性。 |
| `modelSelectionSettings` | `false` | 为每个顶层 Session 读取宿主的精确路由授权偏好；常驻 preset 观察匹配 Session，直接 Agent setup 则显式传入其 Session；要求提供方支持 `agentOptions` |
| `agentOptions` | — | 配置的子级 `provider`、`model`、适配器所有的 `reasoningEffort` 与正整数 `maxTokens` 默认值；要求提供方支持 `agentOptions`，并会覆盖提供方持有的路由默认值 |
| `persona` | — | 每个子 agent 独立的 persona；要求提供方具备 `persona` 能力 |
| `toolFilter` | — | 每个子 agent 独立的全局工具限制；要求提供方具备 `toolFilter` 能力 |
| `maxDepth` | Host 设置（`1`） | 绝对委派深度上限（`0` 禁止委派）；`'provider-managed'` 不向进程外提供方发送上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#qilin-agenttool-subagent)是每个受支持字段及其 JSDoc 的穷尽式真源。

### 受管委派

运行时接受子会话后，每次调用都会返回 `started subagent <childId>`，不等待子会话结果。activation 独立于已完成的工具调用持有工作；运行时发送完成通知并释放执行资源。

`maxDepth` 限制递归深度（`0` 禁止委派）；省略时，每次委派读取 Host 当前的 `subagent.maxDepth` 设置，初始值为 `1`。数值深度要求提供方具备 `depthLimit` 能力；`'provider-managed'` 把预算留给进程外提供方。当提供方支持时，`persona` 与 `toolFilter` 会配置每个子 agent；工具在达到上限时仍然可见——每次尝试启动都会检查调用 agent 的当前深度，被拒绝时返回出错的工具结果。

### 选择子级 LLM

设置 `modelSelectionSettings: true`，即可在组合每个全新顶层 Session 时读取宿主的 `subagent-model-selection` 偏好。没有已记录策略的恢复 Session 会保持禁用，包括显式为空的恢复。启用后，非空的精确 provider/model 路由列表会记录进 Session、由子 Session 继承，后续设置编辑不会改变它。工具随后公开可选的 `provider`、`model` 与 `reasoning_effort` 字段，并注册共享的 `list_subagent_models` 工具。此模式要求后端声明 `agentOptions`；两个进程内后端和 QILIN SDK 支持该能力，而 ACP、Codex 与 Claude Code 会拒绝它，而不是忽略它。

一次调用需同时提供 `provider` 与 `model`；当配置值、父 agent 值或提供方持有的默认值能提供路由时，也可只提供推理等级。静态的 `provider.agentRouteDefaults` 在存在时构成提供方／模型基线；工具配置与模型字段会在路由相关强度合并和确切路由预检前覆盖它。没有这些默认值的提供方会使用父 agent 最新已记录请求中的兼容值，再使用父级首次请求前的创建选项，并保留配置的 `maxTokens`。更改路由但未显式提供推理等级时，会清除继承的路由自有等级，使所选模型解析自己的默认值。实时 LLM 适配器在创建子 agent 前校验有效路由。目录成员资格只提供建议，因此适配器接受时，模型可以使用未列出的 id。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释工具如何镜像提供方生命周期并结算运行；可观察行为已在[使用本包](#use-this-package)中说明。

### 设计理念

一个实例就是一个提供方加一个工具名称。插件镜像提供方生命周期：具名提供方出现时注册工具，提供方离开时释放工具，因此同级加载顺序与 HMR 替换不会让工具悬空。直接 Agent setup 显式传入尚未发布的 Session，并在发布前等待安装完成。由设置控制的常驻 preset 通过 `agent/created` 接收每个匹配 Agent，从其 Session 选择策略，并等待通过其 Context 发起的安装；安装失败会拒绝创建。提供方无法执行的数值型 `maxDepth` 或已配置 LLM 选择会在挂载时失败，而不是在首次委派时失败。每个工具作用域内最多一个实例可以拥有模型选择，因为 `list_subagent_models` 使用全局名称。

### Activation 归属

工具以 parent 投递模式调用 `ctx.subagents.startActivation()`。运行时负责启动取消、执行、结果上报与清理。启动失败是错误工具结果；发布后的失败通过完成通知到达，诊断与部分输出由运行时保留。

### 结果确认

规范工具结果为 `{ kind: 'activation', subagentId }`，不包含执行 Promise 或最终输出；需要等待结果的程序化调用方直接使用 subagent 服务。

### 随上下文变化的措辞

工具描述源自 `provider.inheritsParentContext`：全新子 agent 得到「it does not see this conversation」措辞，fork 子 agent 得到「it does not see the current in-flight turn」措辞，因此模型既不会复述、也不会省略并不存在的上下文。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具注册、生命周期镜像、模式解析、结果结算 |
| [`src/model-selection.ts`](src/model-selection.ts) | 请求／配置合并与实时 LLM 路由预检 |
| [`src/model-selection-settings.ts`](src/model-selection-settings.ts) | 为新 Session 读取的宿主所有 opt-in 设置 |
| [`src/model-selection-state.ts`](src/model-selection-state.ts) | 记录并继承已读取决定的 Session 事件 |
| [`src/list-models.ts`](src/list-models.ts) | `list_subagent_models` 运行时发现工具 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面；它们从工具运行时行为进入它所委派其上的 seam，以及相邻的子 agent 工具。

- [Subagent 子系统](../../../docs/subsystems/subagent.zh.md)——提供方、一次性启动请求、可继续子 agent 与 Activation。
- [qilin-tool-subagent-control](../tool-subagent-control/README.zh.md)——可继续子 agent 的消息、中断与列表工具。
- [生成工具目录](../../../docs/tool-catalog.zh.md#qilin-agenttool-subagent)——默认 schema 与各模式的措辞。
- [生成配置目录](../../../docs/config-catalog.zh.md#qilin-agenttool-subagent)——每个受支持配置字段。
- [后台优先的可继续委派](../../../.agents/notes/archived/feature/2026-08-11-background-first-continuable-delegation.md)——可继续工作为何默认在后台运行。
- [模型选择 subagent 路由](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.zh.md)——选择策略、继承、发现与 fork 限制。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到什么

当提供方存在时，以当前实例配置的名称公开已生成的默认 [`subagent` schema](../../../docs/tool-catalog.zh.md#qilin-agenttool-subagent)。启用的 Session 策略会添加 `provider`、`model` 与 `reasoning_effort`，以及继承和选择指引；提供方必须支持 `agentOptions`。提供方是否继承上下文会改变工具描述和提示词描述。当工具在本次组装的作用域中可见时，一个 `tool:<toolName>` 系统提示词 section 会指示模型同时启动相互独立的可继续委派、在它们运行时继续工作；工具限制会同时移除其 schema 和这段指引。

#### Token 影响

每个父级请求支付固定的 schema 成本；模型选择会增加三个参数。每个提供方实例增加一个 schema，每个可继续实例还增加一个简短的系统提示词 section。

#### KV Cache 影响

只要提供方实例及其配置不变，前缀就保持稳定。适配器目录变化不会改变定义；子级路由覆盖可能使 fork 子 agent 无法复用继承的父级前缀。

### 模型选择与发现

#### 模型看到什么

Session 携带策略的 settings 控制实例会公开子级 LLM 选择字段与 `list_subagent_models`。可选 `ctx.llm` 服务不可用时，调用会失败。发现只返回精确路由策略中的已注册提供方与已公布模型；未授权提供方会在调用其适配器目录前被拒绝，精确查询也必须先获准，才会解析模型的推理强度与默认值。执行阶段会独立强制同一策略。

#### Token 影响

启用的组合中存在一个固定发现 schema。只有模型调用工具时，目录内容才进入 transcript。

#### KV Cache 影响

适配器注册与目录变化不会改变 schema 前缀。每个发现结果都追加在可复用前缀之后。

### 系统提示词

#### 模型看到什么

当工具在本次组装的作用域中可见时，一个 `tool:<toolName>` 系统提示词 section 会列出可见的委派工具名，并指示模型同时启动相互独立的委派、在它们运行时继续工作，并且仅在等待结果时结束 turn，而不是睡眠或轮询。使用默认工具名 `subagent` 时，section 文本为：

##### 工具指导 section

```markdown
Start independent delegations with `subagent` together in one assistant message and continue useful work while they run. When only waiting for their results remains, end your turn instead of sleeping or polling; the next result starts a new turn.
```

#### Token 影响

每个委派工具一个简短固定 section，只要工具在作用域内，就由每个父级请求支付。

#### KV Cache 影响

只要 section 文本与工具存在性不变，前缀就保持稳定；移除工具或更改 section 会建立不同的父级前缀。

### 启动结果

#### 模型看到什么

调用保留任务描述与提示词。成功返回 `started subagent <childId>`；启动被拒绝则返回错误。子会话执行细节与该确认分开投递。

#### Token 影响

提示词与结果保留在父级历史中，直到上下文压缩（context compaction）；子 agent 工作上下文留在子 agent 中。

#### KV Cache 影响

仅追加；新增可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

### 完成投递

#### 模型看到什么

答案投递遵循上面的受管委派规则。返回的子会话 id 用于后续控制与目录操作；只有支持继续的后端接受后续消息。

#### Token 影响

消息与完成通知独立于启动确认追加到父级历史；工具结果本身不含最终输出。

#### KV Cache 影响

仅追加；新增可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明本工具不返回或不强制执行什么；它们是当前包约束。

- **启动结果不通过本工具公开子会话输出**——可继续子 agent 的输出留在其自身会话中，按其 subagent id 读取。结算通知会说明该子 agent 如何结束，并携带其最终 assistant 输出中的非空文本，但它不是本次调用的返回值，也无法在此等待。
- **等待中的一次性实例较晚才发现重复名称**（`TODO(subagent-dup-toolname)`）——可继续实例会在插件应用期间预留提示词 section 名称，但若要阻止等待中的一次性实例回滚提供方注册，仍需要一份预期名称注册表。
- **随附 fork 工具不能选择子级 LLM 路由**——它们继承父级提供方与模型，使复制的对话前缀仍有资格复用 KV Cache。仅当路由变更能保留复用或公开有界重算成本时，才重新启用选择。
- **非路由子 agent 策略按实例固定**——另一个 persona、工具过滤器或深度上限需要另一个名称不同的工具。LLM 选择要求启用逐 Session 偏好，且提供方必须声明 `agentOptions`；两个进程内提供方和 QILIN SDK 会声明该能力，而 ACP、Codex 与 Claude Code 会拒绝它，而不是忽略它。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
