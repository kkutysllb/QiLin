---
description: "Web 设置中的 MCP 服务器页面：经 mcpServers Remote 列出、新增、编辑、启停与删除用户补丁层声明的服务器。"
kind: "package-reference"
---

# @qilin/client-ui-settings-mcp

[English](README.md) | 中文

## 概述

MCP 服务器页面是设置中的一个分区。它渲染 home 级用户补丁层声明的服务器——每个都带传输方式、命令行或端点、以及启用状态——并列出本部署提供的推荐服务器，以及每一条所需命令能否在 harness 的 PATH 上解析到。新增、编辑、启停与删除全部经 \`mcpServers\` Remote 写入，它只改写定位到某一个服务器的补丁节点；本页面从不自己拼装补丁文件，也从不重新推导 Host 已经给出的答案。

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

打开设置并选择 MCP 服务器。页面在挂载时加载一份快照，并渲染三块内容：已配置服务器、推荐服务器，以及正在新增或修改的服务器所用的编辑器。

### 已配置服务器

每一行给出服务器名称、传输方式、该条目运行的命令行或端点，标出匹配某个推荐定义的服务器，并带一个开关、编辑与删除。开关立即写入启用状态；删除会先要求确认，因为移除条目是编辑器无法撤销的唯一个动作。编辑打开与新增相同的表单，但名称字段被锁定：已保存条目以名称为身份，改名会静默丢掉该条目的设置。

### 推荐服务器

每个推荐服务器显示它将运行的命令；当 harness 无法解析该命令时，页面会说明这一点，而不是提供一个无法使用的条目。添加会把服务器写入补丁层；启用该条目并重载补丁层后它的工具才出现，而重载由启动器完成，无需重启。

### 拒绝

两类失败有各自的呈现方式。补丁层无法读取时，页面给出该文件路径，并禁用所有变更操作，直到用户手工修好。写入被拒绝时——名称不符合可接受模式、stdio 服务器没有命令、端点不是 HTTP URL——编辑器保持打开并显示 Host 的消息，因此草稿不会因一次校验错误而丢失。

<a id="understand-the-implementation"></a>
## 理解实现

在 \`apply\` 中创建一个 store 实例，经注入面交给分区；每次挂载共享它，页面通过 UI 渲染器从 store 的裸 observable 绑定的 \`useSnapshot\` 钩子读取它。每次变更都用 Host 的答复整体替换快照，因此任何本地状态都不会成为某一行的来源。

被取代的读取会被取消并丢弃其答复：store 每次调用保留一个世代计数与一个 \`AbortController\`，因此一次缓慢的首次加载绝不会晚于更新的加载落地。

表单字段都是普通字符串。提交的草稿在边界处组装：参数按非空行拆成多个条目，属于另一种传输的字段会被丢弃，而不是以空字符串发送。

<a id="further-exploration"></a>
## 进一步探索

- [\`@qilin/mcp-servers\`](../../mcp/mcp-servers/README.zh.md)——本页面读写的 Host 服务，以及一次写入遵循的补丁层保真规则。
- [\`@qilin/mcp-client\`](../../mcp/mcp-client/README.zh.md)——每个被写入的条目实际挂载了什么，以及它的服务器产生的工具名。
- [\`@qilin/client-ui-settings\`](../ui-settings/README.zh.md)——声明本页面注册所用分区槽位的设置外壳。

<a id="model-experience"></a>
## 模型体验

None, as this page writes the user patch layer through the mcpServers Remote and contributes no prompt text, tool, or session event of its own.

#### KV Cache effect

本身没有。启用、停用、新增或删除服务器会改变挂载该补丁层的会话的工具定义，并可能使从第一个变化的定义起的复用失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本页面不能做什么、以及何时需要关注。它们是当前约束，不是与其他 MCP 服务器管理器的对比，也不是任务积压。

- **环境与请求头映射无法在此编辑**——已保存的服务器保留补丁文件里已有的 \`env\`、\`headers\`、\`reconnect\` 节点，但表单无法新建它们；需要凭据的服务器要在文件中编辑。
- **已配置的服务器无法就地重命名**——名称就是条目的身份；新增一个不同名的服务器才是刻意的替换方式，因为改名会静默丢掉旧条目的设置。
- **只列出 home 级补丁层**——profile 自己的 \`cordis.patch.yml\` 或 \`--patch\` 覆盖层插入的服务器不会出现，因为页面读取的是本部署分区写入的那个文件，而不是组合后的 Loader 树。
- **不按服务器显示工具可用性**——能启动但没有声明任何工具的服务器，与任何已启用行渲染一致；诊断它属于插件清单与会话日志。
- **写入路径没有浏览器级端到端断言**——随附规格以桩 props 驱动 store 与分区，组装面的检查目前为手工执行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：开放设计问题与尚未决定的探索方向。它明确不具权威性——已交付行为、限制与既定理由以上文、包代码与所链接的 Agent Note 为准。

- 推荐集合是否应在首次启动时物化（KCoder 采用的形态）在 Host 侧仍未决定；本页面只负责提供它们。
- 编辑 \`env\` 与 \`headers\` 需要先定下键值编辑器的形态（重复行、JSON 区块，或转交文件编辑）。
- 页面本可订阅补丁层变更事件，而不是仅在自己写入后重载；今天没有这样的事件，因此在终端里做的修改要等下一次加载才出现。

</details>

**运行时不变式：** 不发布伴生入口。Host 服务是补丁层的唯一权威，本页面只渲染每次答复所报告的内容。
