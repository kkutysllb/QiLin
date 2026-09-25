---
description: "通过 Web 侧边栏或 agent 启停 profile 插件，并安装、删除或选择组合包。"
kind: "package-reference"
---

# @qilin/plugin-manager

[English](README.md) | 中文

应用拥有的 profile 通过启动器信息提供内置包管理器调用方式。它在包操作和 registry 检查中优先于 `pnpmCommand`；其环境仅应用于这些子进程。

## 概述

管理当前 profile 的插件，无需手动编辑配置。启停单个插件条目、选择已安装的组合包，以及安装或删除外部组合包。在 YAML 中启用 HMR 时，配置变化立即生效；未启用 HMR 时，运行中的组合保留到重启。改动影响使用该 profile 的全部会话。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [失败行为](#failure-behavior)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

基于 base 的 profile 提供管理服务。在 Web 中，侧边栏的**插件**页（[ui-plugin-manager](../../client/ui-plugin-manager/README.zh.md)）管理 profile 的组合包及其能唯一定位的行；设置页的插件列表保持只读。Agent 预设条目保持只读。`plugin_manager` 工具提供相同操作，在 Creator 模式中启用。其他预设仍默认禁用。 每个工具操作都要求 `danger-full-access` 或本次调用的批准。在较低沙箱模式下，`ask` 会请求审批；`never`、拒绝、取消或审批渠道不可用时均不执行。批准不改变会话的权限模式。profile 变更跨会话持久化，已安装的 Host 代码在宿主进程内运行，不受工作区沙箱限制。依赖构建脚本仍需单独批准。

未使用 Agent 预设的部署在 profile patch 中启用工具；使用预设的会话由其预设中的 `tool-plugin-manager` 条目控制。

```yaml
- id: tool-plugin-manager
  disabled: false
```

插件开关只更新 profile 的 `cordis.patch.yml` 中最后一条匹配覆盖项的 `disabled`；没有匹配项时追加。匹配依据是条目 id，以及覆盖项声明的模块名称。组合包开关修改 `package.json` 的有序 `qilin.profile.bundles` 列表。关闭保留依赖；开启追加到列表末尾，可能改变配置优先级。安装新组合包默认启用。home 和单次启动 patch 保留更高优先级。

`inspect(spec)` 在任何东西安装之前读出 spec 指向什么：注册表包名通过 `pnpm view` 询问注册表，在 profile 目录中运行，因而与安装使用同样的注册表与代理设置；绝对路径读取其 `package.json`；git 地址或 tarball 只答复自己的形式。答复携带名称、版本、描述以及该包是否声明组合包，否则给出 `problem`：`invalid-spec`、`already-installed`、`not-found`、`not-a-package`、`not-a-bundle`、`network` 或 `unknown`。调用方的 `signal` 或 `inspectTimeoutMs` 会结束查询。

`installBundle` 在启动 pnpm 前用 `git ls-remote` 检查 GitHub 仓库，在 profile 目录中运行，并沿用安装器自己的 Git 与代理配置。`githubConnectionTimeoutMs` 默认 5000 毫秒，只限制这次检查，不限制包下载或构建。检查会禁用凭据助手与交互提示；只有网络故障和超时会阻止安装，此时报告 `failedAt: 'spec-host'`，并附本次运行的失败类别与诊断日志。认证、仓库查找与其他失败都留给 pnpm，包括它的 HTTPS 回退到 SSH。取消与管理器销毁会终止该检查及其子进程。注册表包、路径、tarball 与其他 Git 主机跳过该检查；可达的仓库仍可能在下载或组合包校验时失败。

`installBundle` 接受调用方生成的 `requestId`，`plugin-manager/install-log` 在其下流式转发每次 pnpm 运行的输出，`plugin-manager/install-state` 通告 `installing`、`cancelling` 与 `applying`。`cancelInstall(requestId)` 停止运行，只在 pnpm 退出且文件恢复后答复 `cancelled`，组合包已在应用时答复 `too-late`，其他 id 答复 `not-running`；安装调用随后报告 `application: 'cancelled'`。失败、被取消或装入了没有组合包 patch 的包的运行，会把 `package.json` 与 `pnpm-lock.yaml` 恢复原样；`packageResult.kind` 按退出方式与输出对失败运行分类，`bundle` 给出完成的运行新增的包。`listBundles` 携带每个组合包的一句话简介（包的 `description`）、其 patch 声明的行及其存活条目，以及它覆盖的内置行；它列出 profile 自己的组合包、安装提供的组合包，以及被选中却没有组合包 patch 的名字（作为 `not-bundle` 问题），未选中的普通依赖不列出。启动器的 `OPTIONAL_BUNDLES` 点名的组合包是 `optional`：随安装提供、默认关闭、由用户开启，永不可卸载，也不被任何随附模板选中（[理由](../../../.agents/notes/implemented/process/2026-09-15-shipped-optional-bundles.zh.md)）。每个完成的操作都会发出 `plugin-manager/changed`；在管理器之外应用的一代 patch（HMR 监视到 CLI 或手工编辑后）不发通知，页面要到下一次读取才知道。

`checkUpdates()` 把 `listBundles` 列出且能读作组合包的每一层与该包注册表的 `latest` dist-tag 比较，每个包一次有超时的查询；被选中却没有组合包 patch 的依赖不在其中，因为任何更新都动不了它。查询失败或没有该标签时报告 `latestVersion: null`，而不是让整次列举失败，调用方因此读到的是未知版本。`catalog(query, page)` 搜索 GitHub 上打了 `dsh-plugin` 主题标签的仓库，按 star 从多到少排列，返回该页仓库以及是否还有下一页；不是正整数的页码按第一页处理，2xx 之外的状态码抛出。两次查询都以十秒为上限。

pnpm 11 拦下依赖脚本时，失败的安装在 `pendingBuilds` 里报告 profile 中所有待决定的包名，包括先前尝试留下的；失败的运行会恢复 `package.json` 与 `pnpm-lock.yaml`，但有意不恢复 pnpm 记录这些名字的 `pnpm-workspace.yaml`。Web 插件页提供**允许这些脚本并重试**；工具可以在用户于对话中批准这些脚本后，通过 `install_bundle` 的 `approvedBuilds` 代为授权。服务只校验待决定的名字，不核实对话中的批准。授权按包名保存在当前 profile，允许以宿主用户的权限执行命令，并在再次安装失败后保留。只能批准当前未决定的名字；已有的拒绝与通配规则不能通过此操作覆盖。`allowBuilds` 里出现 YAML 锚点或别名时拒绝授权。重试保留原来的启用选择。

<a id="version-compatibility-and-exemptions"></a>
### 版本兼容性与豁免

点名包的安装命令（`add`，或带规格的 `install`）会在 pnpm 运行前被检查：本地路径从它自己的 `package.json` 读取，注册表规格则通过 pnpm 的注册表查询解析出该范围选中的版本及其声明的 peer。不兼容的 qilin peer 会在 pnpm 运行前拒绝这次操作，因此不会下载任何内容，也不会执行构建脚本；调用方随请求给出的构建授权在该检查之前就已记录，会继续保留。git 或 tarball 规格需要先真正抓取，因此在安装之后才判定：操作随后恢复 profile 清单与 lockfile，按恢复后的 lockfile 重新安装（profile 原本没有 lockfile 时，按恢复后的清单重新安装且不新建 lockfile），并报告该恢复是否成功；已被允许的构建脚本副作用可能保留。本次运行没有改动的依赖永远不会阻塞无关操作：它保持安装，运行输出一条点名它的警告，profile 启动时拒绝它。`enabled: false` 的安装请求同样被检查。启动期检查独立运行；范围语义见 [App boot](../app-boot/README.zh.md#profiles)。版本豁免不授权依赖脚本。

一条豁免是 profile 自己 `compatibility.json` 中精确的 `package-name@version` 到精确 QiLin 运行时版本列表的映射，位于 `package.json` 与 `cordis.patch.yml` 之旁。写入它不会改动任何依赖、组合包选择或 patch 层。授权只覆盖那一对确切组合：插件升级和 QiLin 升级都不会继承许可，撤销某对组合中的某个运行时版本也会保留它的其它授权。用 `plugin_manager` 的 `list_version_exemptions` 取得运行时版本与已保存的授权，再用 `set_version_exemption` 传入 `target`、`runtimeVersion` 与 `enabled`。授权还要求 `acceptRisk: true`，且只能在警告用户不兼容插件可能导致崩溃或数据丢失、并取得用户对这一对组合的明确许可之后。服务校验的是确认与版本，而不是对话历史。撤销可以移除历史版本的授权。

授权在下一次组态时生效。支持热更新的 profile 会重组，被授权的插件因此在正在运行的会话中挂载，结果报告 `applied`；仅启动时加载的 profile 保留当前条目直到重启，并报告 `restart-required`。

CLI 提供 `qilin plugin --profile <profile> version-exemptions`、`allow-version <package@version> --qilin-version <runtime> --accept-risk` 与 `revoke-version <package@version> --qilin-version <runtime>`。授权会在保存前打印风险警告。兼容性拒绝会带上 `incompatible-version` 代码以及每个被拒绝包的 `name`、`version`、`runtimeVersion` 与未满足的 `peers`；各界面自行渲染该记录。Web 页面通过自己的本地化字典表述，CLI 拒绝则打印确切的 `allow-version` 命令。用工具或 CLI 授予豁免后，重试原来的操作。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `pnpmCommand` | `pnpm` | pnpm 可执行文件名或路径，与 `qilin plugin` 命令一样通过 `PATH` 解析。 |
| `inspectTimeoutMs` | `20000` | 单次检查所做注册表查询的上限，单位毫秒。 |
| `githubConnectionTimeoutMs` | `5000` | 安装前 GitHub 仓库检查的时限，单位毫秒。 |
| `outputBytes` | `16384` | 每次操作返回的 pnpm 诊断字节上限；完整输出保留在返回的日志路径中。 |
| `lockWaitMs` | `120000` | 获取 profile 写锁的最长等待毫秒数。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

服务与 `qilin plugin` 共用 [operations.ts](src/operations.ts) 中的包管理操作。启动器提供当前 profile；[QILIN HMR](../hmr/README.zh.md) 串行执行模块重载、文件监听和管理写入。每次刷新重新读取组合包选择与 patch 层，更新原有根 Include，并等待已移除插件释放资源及剩余 Loader 树稳定。CLI 与 service 操作共用 profile manifest 写锁，防止并发包操作和 manifest 写入。HMR 不获取该锁。pnpm 在 HMR 队列之外执行；安装在 pnpm 成功后选入组合包，删除则在执行 pnpm 前取消选入并完成卸载。每个操作把它启动的 pnpm 运行记录在 `.plugin-manager/run.json` 中，并在运行结束时删除该记录。持有者进程已退出的锁会被下一个写入方接管，但该进程的 pnpm 进程树可能仍在运行，因此发现记录的操作最多等待五秒让记录中的运行停止，否则不运行 pnpm，并以指明该进程与记录文件的诊断失败。仅依赖字段变化不会触发配置重载。

结果包含最后尝试的阶段、目标、磁盘变化、应用状态和错误码。Web 词典呈现管理文案；pnpm 与 Loader 的诊断保持原样。无关的已有故障作为警告返回；新出现、配置变化后的故障，以及显式启用目标未激活，都会使操作失败。失败或被取消的安装会恢复 pnpm 运行前快照的 manifest 与 lockfile（[理由](../../../.agents/notes/implemented/architecture/2026-09-15-guided-plugin-installation.zh.md)）；失败的删除保留部分改动和诊断。安装按 request id 跟踪到调用结束，因此取消只针对一次运行，并且不取 profile 锁就能等待它结束。CLI 继承认证环境和终端描述符；service 使用清理后的环境并捕获输出。管理器直接读取文件和 Loader 状态，不维护第二份目标状态注册表，因此不发布单独的运行时不变式伴生入口。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [App boot](../app-boot/README.zh.md)——profile 配置层与启动策略。
- [Plugin inventory](../../host/plugin-inventory/README.zh.md)——当前 Loader 和预设状态。
- [插件管理页](../../client/ui-plugin-manager/README.zh.md)——基于本服务的 Web 侧边栏页面。
- [Plugin settings](../../client/ui-settings-plugin-inventory/README.zh.md)——只读的 Web 清单。

<a id="model-experience"></a>
## 模型体验

### 管理工具

#### 模型看到什么

[`plugin_manager` 工具](../../../docs/tool-catalog.zh.md#qilinplugin-manager) 列出插件条目和组合包，并执行影响整个 profile 的改动。结果包含保存状态变化、应用状态和包管理诊断。管理操作不会向 Agent 注入消息。

#### Token 影响

装配工具消费者时提供工具声明；每次调用追加返回的清单或改动结果。

#### KV Cache 影响

工具结果追加到对话中。启停其他工具可能改变后续工具声明及其缓存复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- Web 一次批准显示出来的整组待决定包，没有逐包选择。
- 替换已有包后需要重启进程，以加载新的 JavaScript 模块版本。
- 仅启动时加载的 profile 不能删除当前进程启动时使用的包；停止进程后使用 `qilin plugin`。
- 管理器不能关闭自身所需的管理组件、修改其他 profile 或编辑 agent 预设组合。
- 失败的删除可能留下部分依赖改动，失败或被取消的安装可能在 `node_modules` 或 pnpm 缓存中留下已下载文件。文件缺失的未启用依赖仍可删除。诊断日志保留在 profile 的 `.plugin-manager/logs` 目录中。
- 管理结果描述 Host 激活状态。浏览器同步失败会在设置的插件列表中单独显示。
- Desktop 包管理操作仍由 Desktop shell 负责。

<a id="failure-behavior"></a>
### 失败行为

失败保留已完成步骤，并报告实际残留状态。没有有效组合包声明的 profile 依赖仍可见、可删除，但不能启用。

| 失败操作 | 处理方式 |
|---|---|
| 安装：pnpm 执行或组合包校验失败 | 恢复 pnpm 运行前快照的 `package.json` 与 `pnpm-lock.yaml`；pnpm 已下载的文件可能保留。报告安装失败。 |
| 启用：保存选择项或加载失败 | 保留已安装的依赖和已保存的选择项。报告启用失败，允许修正、停用或卸载。 |
| 卸载：任一步失败 | 停在失败步骤，保留已完成的改动和待重试删除的依赖，报告卸载失败。不重新启用组合包。 |

pnpm 执行和组合包校验成功即完成安装，后续启用失败不撤销安装。卸载依次执行：从 `qilin.profile.bundles` 移除组合包、卸载运行时贡献、执行 `pnpm remove`。任一步失败都不继续执行后续步骤。

恢复只重写这两份快照文件；用户编写的 patch 配置、应用数据、诊断日志以及 pnpm 已下载的文件保持原样，没有 manifest 引用的包由下一次包操作清理。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
