---
description: "load_workspace_dependencies 工具：返回随包 Python、Node.js 与 pnpm payload 的绝对路径，可原位使用或安装到 QiLin home 下。"
kind: "package-reference"
---

# @qilin/tool-workspace-dependencies

[English](README.md) | 中文

## 概述

自带脚本运行时的部署——容器镜像层或部署方提供的 primary runtime——挂载本工具后，agent 可以直接询问随包 Python、Node.js 与 pnpm 的位置，而无需探测系统解释器。工具返回绝对路径与记录的发行版版本，既不修改 `PATH`，也不修改包管理器设置。payload 可以首次使用时复制到 QiLin home 下，也可以在原地使用（只读载体）。

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

将本插件与 payload 目录一同挂载到工具注册表旁。配置校验要求 `source` 非空，并在激活前拒绝空的 `root`；两个路径都必须为绝对路径。随包的 Office skills（`@qilin/skill-office`）按名称调用本工具以取得默认解释器。

### 最小配置

```yaml
- name: '@qilin/tool-workspace-dependencies'
  config:
    source: /path/to/primary-runtime
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `source` | 必填 | 携带 `runtime.json` 与 `dependencies/` 的绝对 payload 目录。 |
| `root` | 未设置 | QiLin home 下的绝对安装目录。设置后：首次调用时把 payload 复制到该处，并在 `runtime.json` 未变化时复用。未设置：校验并按原位使用 payload，不复制任何内容。 |

### payload 布局

`runtime.json` 记录 `desktopVersion`、`platform`（`win32`、`darwin` 或 `linux`）、`arch`、可选的 `payloadDigest`、顶层 `python`、可选的 `node`/`pnpm` 版本，以及完整的 `pythonPackages` 发行版版本映射。声明 pnpm 就必须声明 Node.js。Python 库（包括 numpy 与 pandas）只出现在 `pythonPackages` 中。具体条目位于 `dependencies/`：`python/bin/python3`（Windows 为 `python/python.exe`）及其下的 `site-packages`；声明时还有 `node/bin/node` 及 `node/node_modules` 和 `pnpm/bin/pnpm.mjs`。平台或架构与当前进程不一致的清单会被拒绝。

### 载体启用

`sdk` profile 仅在存在载体路径时挂载本工具与 `@qilin/skill-office`。部署方声明下面两个环境变量之一；两者都未设置时，两行保持禁用，也不会读取任何 payload。

| 环境变量 | 含义 |
|---|---|
| `QILIN_PRIMARY_RUNTIME` | `primary-runtime/` payload 目录的绝对路径。即使存在随包载体默认路径，空字符串也表示禁用。 |
| `QILIN_BUNDLED_PRIMARY_RUNTIME` | 由打包载体提供的默认路径。其 `skill-office` 的 `assetRoot` 解析为同级的 `office-skills/` 目录，其 Node 可执行文件解析为 `<payload>/dependencies/node/bin/node`。 |

载体目录把两棵资源树并排放置：

```text
<carrier>/
  primary-runtime/
    runtime.json
    dependencies/python/…
    dependencies/node/…
    dependencies/pnpm/…
  office-skills/
    office-docx/SKILL.md
    office-pptx/SKILL.md
    office-xlsx/SKILL.md
    scripts/check_office.py
```

三套 Office 工作流及其共享检查器随本仓提供，位于 [`packages/skill/skill-office/assets/`](../skill-office/assets)；把该目录树复制到 `<carrier>/office-skills/` 即可。容器可以把两个目录一起复制进不可变镜像层，并把 `QILIN_PRIMARY_RUNTIME` 设为 `primary-runtime/` 的绝对路径；此时工具原位查询该 payload。profile patch 可以独立于本工具禁用 `skill-office` 或替换其 `assetRoot`；自定义的纯 Python payload 必须把 `skill-office.config.cli` patch 为 `false`，或提供 `skill-office.config.node`。缺少 skill 资源会产生启动警告；无效或不完整的 payload 会在首次工具调用时失败。配置变更需要重启 SDK 进程。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

`readPrimaryRuntime` 与构建期冒烟检查共用 `parsePrimaryRuntime`。该校验函数校验扁平清单，并拒绝归一化后重名的发行版。旧式 `components` 元数据在内存中归一化，保留其一致性检查；缺失的旧式发行版映射变为空映射。同时出现扁平与旧式版本字段会被拒绝。读取不重写元数据，归一化后等价的清单可以复用已安装的 payload。`workspaceDependencyPaths` 推导各平台的条目。`installPrimaryRuntime` 先复制到暂存目录，要求声明的解释器与脚本是文件、包根是目录，然后换入到位，并在失败时保留原有目录树；`resolvePrimaryRuntime` 校验同样的条目但不复制。工具在插件生命周期内记忆首次成功的准备结果。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 清单校验、路径推导、原位与安装式准备、工具注册。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Office skills](../skill-office/README.zh.md)——调用本工具取得解释器的工作流。
- [工具注册表](../../core/tools/README.zh.md)——注册与 schema。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到什么

模型看到生成的 [`load_workspace_dependencies` schema](../../../docs/tool-catalog.zh.md#qilintool-workspace-dependencies)。

#### Token 影响

在工具可见处每次请求的固定 schema 成本；描述中列出了随包的 Office 库，因此模型无需先加载 skill 即可选择解释器。

#### KV Cache 影响

只要工具定义与可见性不变，前缀保持稳定。

### 工具结果

#### 模型看到什么

一个 JSON 对象，包含绝对的 `python` 与 `pythonPackages` 路径、来自 `runtime.json` 的 `pythonDistributions`，以及 payload 声明时的 `node`、`nodePackages` 和 `pnpm`。重复调用返回同一个对象。

#### Token 影响

每次调用几百个字符，以路径为主。

#### KV Cache 影响

工具结果只追加到本轮历史；不新增提示词区段。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 本仓不提供 primary-runtime 构建器：payload 始终由部署方提供，随附 profile 只通过 `QILIN_PRIMARY_RUNTIME` 读取它。
- Linux 目标要求 glibc；musl payload 未纳入锁定。
- 原位使用的 Windows payload 必须已在载体中可执行；原位模式不修复权限。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

载体边界记录在[桌面与账号对齐边界](../../../.agents/notes/implemented/architecture/2026-09-25-desktop-and-account-alignment-boundaries.zh.md)中：本仓既不构建也不发布桌面载体，因此 payload 目录由部署方提供。

</details>
