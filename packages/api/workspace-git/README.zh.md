---
description: "workspaceGit Remote 命名空间的 Host 方：仓库探测、porcelain 状态、暂存、提交、分支列举与切换、有界 diff、push 与 pull，每一次都是会话工作区根目录内固定 argv 的 git 进程。"
kind: "package-reference"
---

# @qilin/api-workspace-git

[English](README.md) | 中文

## 概述

用这个包从 Web 客户端驱动会话工作区根目录上的 Git：探测根目录是否为仓库、读取带当前分支与上游位置的 porcelain 状态、读取有界 diff、按路径暂存与取消暂存、丢弃单个路径的工作区改动、用一条消息提交索引、列举与切换分支、push 或 pull。每次调用都在工作区根目录内以固定 argv 拉起配置的 git 可执行文件；任何 caller 字符串都不会经过 shell 解释。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 何时使用本包

把本包与 Typert Gateway、以及提供本服务消费的 `workspaceFileScope` 查找的 `@qilin/api-workspace-files` 一起挂载；bundle 在 `workspace-files` 之后立即加载它。每个方法都在线上携带 Session 身份，因此 Client 调用 `remote.workspaceGit.isRepo(sessionId, signal)`，从不自行指定根目录。本包是 Host 半边；侧栏面板的 Client 半边另行落地。

| 方法 | 返回 | 用途 |
|---|---|---|
| `isRepo()` | `boolean` | 工作区根目录是否位于 Git 工作树内；任何失败都返回 `false` |
| `repoRoot()` | `string` | 工作树的顶层目录；不在工作树内时以 `not-a-repo` 失败 |
| `status()` | `GitStatus { branch?, upstream?, entries }` | 带 staged/unstaged/untracked 分类的 porcelain 条目、缩写的 `HEAD` 引用、以及对上游的 ahead/behind 位置 |
| `diff(path, staged)` | `string` | 一段文本形式的统一 diff——默认工作区对索引，`staged` 时索引对 `HEAD`；`path` 为空时作用于全部——受 `maxDiffBytes` 约束 |
| `stage(path)` | `void` | 限定到单个路径规格的 `git add -A`；`path` 为空时作用于整个工作树 |
| `unstage(path)` | `void` | 限定到单个路径规格的 `git reset -q`；`path` 为空时作用于整个索引 |
| `discard(path)` | `void` | 仅针对单个路径的 `git checkout -- <path>`；这里不存在整仓丢弃 |
| `commit(message)` | `void` | 用一条修剪后 1..2000 字符的消息提交索引 |
| `branches()` | `GitBranches { branches, truncated }` | 带当前标记、上游名称与 ahead/behind 计数的本地分支，来自一次 `for-each-ref` 调用 |
| `checkout(branch)` | `void` | 切换到一个通过名称检查的既有本地分支 |
| `createBranch(name, from)` | `void` | 创建本地分支；`from` 为空时自 `HEAD` 起 |
| `push(setUpstream)` | `void` | 推送当前分支；`setUpstream` 时附加 `--set-upstream origin HEAD` |
| `pull()` | `void` | 从当前分支的上游拉取 |

### 固定 argv，无 shell

`@qilin/shell` seam 通过 shell 执行单条命令行字符串，因此"一次调用等于一次固定 argv 拉起"在那里无法表达；本服务直接使用 `node:child_process` 拉起，每个参数都是独立的 argv 元素。caller 字符串进入 argv 只有三种途径：`--` 之后的路径规格（任何前导 `-` 因此是路径字符而非选项）、唯一一条 `-m` 提交消息、以及匹配 `/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/` 的分支名——其余一律在 git 运行前以 `bad-branch` 失败。首字符类别保证任何被接受的名称都不可能拼出 git 选项。

### 状态分类

`status` 运行 `git status --porcelain=v1 -z --untracked-files=all` 并逐条分类 `XY` 记录：`staged` 是索引列非空白且非 `?`；`unstaged` 对工作区列同样判断，因此未合并冲突两边都为真；`untracked` 是 `??` 对。重命名或复制条目报告其现居路径而非来源路径。`branch` 来自 `git rev-parse --abbrev-ref HEAD`，未出生的 `HEAD` 下缺省；`upstream` 是 `git rev-list --left-right --count HEAD...@{upstream}` 给出的 `{ ahead, behind }`，未配置上游或上游已消失时缺省。被忽略的文件永不出现。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `gitBin` | `git` | 每次调用拉起的 git 可执行文件 |
| `timeoutMs` | `30000` | 单条内容或变更命令（`status`、`diff`、`add`、`reset`、`checkout`、`commit`、`for-each-ref`、`push`、`pull`）的杀死时限 |
| `discoveryTimeoutMs` | `5000` | 单条仓库探测命令（`rev-parse`、上游解析）的杀死时限 |
| `maxDiffBytes` | `1048576`（1 MiB） | 单条 diff 的含端字节上限；超限以 `too-large` 失败，绝不截断 |
| `maxStderrChars` | `2000` | 单条命令失败所携带 stderr 的字符上限 |
| `maxListEntries` | `200` | 返回分支条目的上限；其余丢弃并报告截断 |

生成的[配置目录](../../../docs/config-catalog.zh.md#qilinapi-workspace-git)是每个受支持字段及其 JSDoc 的穷尽来源。

### 失败

每种失败都是带类型化 details 的一个 `RemoteError` code，声明于 [`src/types.ts`](src/types.ts)：`workspace-git/not-a-repo`、`workspace-git/bad-branch`（`branch`）、`workspace-git/bad-message`（`length`）、`workspace-git/bad-path`（`path`）、`workspace-git/too-large`（`bytes` 是杀死前观察到的下界，另附 `maxBytes`）、以及 `workspace-git/command-failed`（`command` 指名调用、有退出码时附 `code`、`stderr` 修剪到 `maxStderrChars`；超时在 `stderr` 中自述且不携带 `code`）。调用方按 code 分支，绝不按消息文本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

### 设计概念

工作区根目录经 `@qilin/api-workspace-files` 注册的 `workspaceFileScope` Typert 查找到达；本包不声明自己的查找，只以 type-only 方式导入 scope 类型，因为 Typert 按 Host 类型符号而非结构形状绑定查找参数。一个私有的 `run` 以固定 argv 拉起 git，套用该调用的超时，尊重 caller 取消（以中止原因拒绝），并在 stdout 越过 `maxDiffBytes` 时杀死子进程，使超限的 diff 绝不整体缓冲。每个方法在一处映射失败：探测拒绝到 `not-a-repo`、任何拉起前的校验拒绝、其余全部到 `command-failed` 并附调用与修剪后的 stderr。各解析器是对录制输出字符串的纯函数，导出以供 fixture 规格。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceGit`：`workspaceGit` 服务与 Remote 命名空间、`Config`、固定 argv 拉起器、全部 Remote 方法 |
| [`src/parse.ts`](src/parse.ts) | 纯解析器：porcelain `-z` 状态、固定 `for-each-ref` 格式、`rev-list --left-right --count` |
| [`src/types.ts`](src/types.ts) | 线上类型与 `RemoteErrorDetailsMap` code，以 `./types` 发布给 Client 包 |
| — | 不发布运行时不变量伴件；每个答案都来自调用时一次全新的 git 进程。 |

Typert 生成由 `./typert` 与 `./remote` 暴露的 Host 与 Client Remote 工件。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [工作区文件服务](../../api/workspace-files/README.zh.md) —— 本服务消费的 `workspaceFileScope` 查找的拥有者，以及本面板旁的文件面板。
- [Remote 组装](../../api/remotes/README.zh.md) —— Client 包如何抵达 `workspaceGit` 命名空间。
- [Typert 协议](../../typert/protocol/README.zh.md) —— 本服务所依赖的查找与 Remote 方法机制。

-----

<a id="model-experience"></a>
## 模型体验

无。本包不注册工具、不贡献提示词段落、不追加会话事件。

#### KV 缓存影响

无。本包既不组装也不发送任何 provider 请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **仅核心 git** —— 没有 GitHub/`gh` 面：没有 pull request、issue 或远端仓库管理。
- **`push --set-upstream` 固定名为 `origin`** —— 上游推送以固定名称指向 `origin` 远端；名称不同的远端以 `command-failed` 及其 stderr 失败。
- **无合并方式参数** —— `pull` 使用仓库自身的合并配置；argv 规则允许的 merge/squash/rebase 枚举暂无消费方法。
- **路径按 UTF-8 解码** —— porcelain 路径按 UTF-8 从 diff/状态字节解码；含不可解码字节的路径会有损往返。
- **`diff` 拒绝时 bytes 是下界** —— 子进程在达到上限时被杀死，`too-large` 报告的是杀死前观察到的字节数，不是完整 diff 的大小。
- **超时只杀一次，用 SIGTERM** —— 忽略 SIGTERM 的 git 会占用调用直到进程退出；没有 SIGKILL 升级。
- **测试未覆盖超时臂** —— 超时分支只由生产触发；仓库内没有找到能可靠超过所配时限的确定性 git 命令。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
