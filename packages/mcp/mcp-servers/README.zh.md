---
description: "MCP 服务器设置服务：通过 mcpServers Remote 列出、新增、编辑、启停与删除用户补丁层中的 mcp-client 条目。"
kind: "package-reference"
---

# @qilin/mcp-servers

[English](README.md) | 中文

## 概述

设置页通过 `mcpServers` 命名空间读取并写入 home 级用户补丁层里的 `mcp-client` 条目。一次快照会列出每个已配置服务器：传输方式、命令行或端点、启用状态、以及它匹配到的推荐服务器；同时列出本部署提供的推荐服务器，以及每一条所需命令能否在 harness 自身的 `PATH` 上解析到。保存、删除、启停与添加推荐服务器都只改写定位到某一个服务器的补丁节点，因此文件中的其余每一个字节——其他补丁条目、注释、引号风格与 `!!js` 表达式——都原样保留。

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

调用 `mcpServers/list` 渲染服务器列表，用四个变更方法——`save`、`delete`、`setEnabled`、`addBuiltin`——改动它。每个变更方法都返回一份新快照，因此客户端无需再读一次就能看到自己写入的结果。

### 快照包含什么

每个已配置条目携带：条目保留的 `serverName`（同时也是该服务器模型可见工具名的中间段）、Loader 条目 id `mcp-<serverName>`、传输方式、展示用详情（stdio 服务器是解析后的命令行，Streamable HTTP 服务器是端点）、条目是否启用、以及它匹配到的推荐服务器 id（用户自行配置的服务器为 null）。`builtins` 行给出每个推荐服务器将要运行的命令，以及该命令能否经 harness 的 subprocess 提供方解析为可执行文件。`patchPath` 给出每次写入所落到的文件。

### 文件无法定位时

补丁层解析失败、或其根节点不是条目列表时，快照的 `error` 字段会给出原因，同时不返回任何服务器、也不提供任何变更操作。每个变更方法都以同一原因拒绝，并保持文件不变——覆盖手写配置比拒绝这次编辑更糟，因此由用户手工修好文件后重新加载。

### 一次保存保留什么

一次保存只替换本服务拥有的 config 键：`transport`、`serverName`、`command`、`args`、`cwd`、`url`、`headers`、`toolCallTimeoutMs`、`failOnStartupError`，并删除属于另一种传输的键。它不拥有的键——`env`、`reconnect`——保留自己的节点（包括 `!!js` 表达式），因此凭据来自环境表达式的服务器不会被一次无关的编辑改写。由于条目 id 就是服务器的身份，保存从不重命名：已存在的 `serverName` 就地更新，新名称则作为新条目追加。

<a id="understand-the-implementation"></a>
## 理解实现

### 条目位于何处

每个受管理的服务器都是某个顶层 `- insert:` 项里的一个条目，这也是补丁层添加下层 bundle 从未声明过的行的方式。`@deepseek-ai/cordis-plugin-include` 会为插入的行建立索引，因此本层能定位自己插入的行，后续层也能定位它们。启用状态就是条目自身的 `disabled` 键，由同一套补丁应用逻辑读取；因此被停用的服务器保留完整定义，下次启用时无需二次编辑即可恢复。

### 为什么是 home 层

本服务写入 `<QILIN_HOME>/cordis.patch.yml`，即位于所有 profile 之上的那一层，因此在 web GUI 中配置的服务器在无头运行中同样存在。启动器本来就监听该文件，所以一次保存会经 Cordis HMR 加入正在运行的插件树，无需重启。

### 写入

变更在服务内部串行：两个设置操作不会交错执行「读—改—写」而丢掉其中一个结果。每次写入都以一步原子替换文件，并打上仅属主可读写的权限位，因为服务器定义可能在 `env` 映射里携带凭据。

### 该服务仅面向 Remote

`McpServers` 不声明同进程 Cordis `Context` merge；`mcpServers` 命名空间是给设置页使用的 Remote 客户端的。它注入 subprocess 提供方，是因为可用性探测必须按 `@qilin/mcp-client` 将要采用的方式解析命令。

<a id="further-exploration"></a>
## 进一步探索

- [`@qilin/mcp-client`](../mcp-client/README.zh.md)——本服务写入的每个条目实际挂载了什么，以及它的服务器产生的工具名。
- [`@qilin/app-boot`](../../boot/app-boot/README.zh.md)——profile 组合、各补丁层，以及启动器安装的用户层重载。
- [`@qilin/host-plugin-inventory`](../../host/plugin-inventory/README.zh.md)——Loader 从该文件挂载了什么内容的只读投影。

<a id="model-experience"></a>
## 模型体验

### 受管服务器注册的 MCP 工具

#### 模型看到什么

本服务不贡献任何内容：它只写一个补丁文件，不注册自己的提示词文本、工具或结果。它写入的条目由 `@qilin/mcp-client` 挂载，其服务器把各自声明的工具注册为 `mcp__<serverName>__<rawName>`，因此新增、启用或删除服务器会在下一次重载后改变该工具列表。

#### Token 影响

本服务自身无影响。每个已启用服务器在其挂载期间，其工具描述与输入 schema 都会进入每一次请求；因此设置页新增或启用的每个服务器，在它被停用或删除之前都会在所有请求上消耗 token。

#### KV Cache 影响

本服务自身无影响。启用、停用、新增或删除服务器会改变工具定义前缀，并可能使从第一个变化的定义起的复用失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本服务不能做什么、以及何时需要关注。它们是当前包约束，不是与其他 MCP 服务器管理器的对比，也不是任务积压。

- **推荐服务器只被提供，绝不自动安装**——设置页只在用户要求时才添加。首次启动不写入任何内容，因此没有 `uvx` 或 `npx` 的机器不会携带无法启动的服务器，也没有部署会为用户未选择的服务器付费。
- **环境与请求头映射无法在设置页编辑**——保存会保留已有的 `env`、`headers`、`reconnect` 节点，但无法新建它们；添加需要凭据的服务器意味着编辑补丁文件，而本服务此后不再改它。
- **已配置的服务器无法就地重命名**——`serverName` 就是条目的身份；改名意味着新增一个不同名的服务器。这是刻意的，因为重命名会静默丢弃旧条目的凭据。
- **只管理 home 层**——profile 自己的 `cordis.patch.yml` 以及任何 `--patch` 覆盖层中的条目对本服务只读；它们声明的条目仍会出现在列表里，因为读取只遍历本服务写入的那个文件，从不遍历组合后的插件树。
- **可用性探测依赖 subprocess 能力**——本服务注入它，缺少时保持等待；因此没有挂载 subprocess 提供方的部署根本不会暴露 MCP 设置分区。
- **写入受管条目的凭据以明文保存在补丁文件中**——该文件仅属主可读写，且不查询任何密钥存储。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：开放设计问题与尚未决定的探索方向。它明确不具权威性——已交付行为、限制与既定理由以上文、包代码与所链接的 Agent Note 为准。

- 条目 id 约定 `mcp-<serverName>` 由本服务与设置页共享；出现第三个消费方时它就应当成为公开契约。
- `SERVER_NAME_PATTERN` 在此处从 `@qilin/mcp-client` 重述，因为该包没有导出它；把它导出即可消除这份重复。
- 推荐集合是否应在首次启动时物化——即 KCoder 采用的形态——仍未决定。改为「提供」使可选能力不进入出厂默认，代价是每个服务器一次点击。
- 若要只读地展示其他层插入的服务器，需要组合后的 Loader 树而非该文件，那是另一个服务边界。

</details>

**运行时不变式：** 不发布伴生入口。本服务写入的补丁文件就是唯一权威状态，每次调用都重新读取它，快照才不会过期。
