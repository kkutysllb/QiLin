# V5 编码主线拆解（Forge / Worktree / Terminal）

日期：2026-11-14
状态：盘点完成，待逐片实现

## 0. 为什么先写拆解

V5 是产品功能批次而不是纯样式批次：它要动 worktree 服务、forge Remote 契约、面板 UI 与文档，任一处语义错都会直接破坏用户仓库。先盘点现有能力与缺口，按“用户可感知 + 风险可控”排序，再逐片实现。

## 1. 现状盘点（有证据）

### 1.1 Forge

| 包 | 角色 | 证据 |
|---|---|---|
| `experimental/forge` | change request 数据面与 URL 解析 | `changeRequestFromUrl`、README |
| `experimental/forge-github` | GitHub 提供方（checks / diff / text） | `changeRequestChecks`、`changeRequestDiff`、`changeRequestText` Remote |
| `experimental/client-ui-forge` | 面板 UI + 宿主 Remote | 12 个 `@Remote`（含 `restoreWorktree`、`continueInProject`、`retryWorktree`）、`src/client/` 组件 |
| `experimental/forge-session` | 会话侧装配 | package README |

已有读面：变更文件树、逐文件 diff、ChangeRequest 卡片、本地改动卡片、工作树状态卡（创建 / 恢复 / 继续在项目 / 重试）、ActionToast。

### 1.2 Worktree

`experimental/worktree` 只有 **`create`** 与 **`restore`**（`src/index.ts`）。README 明确写着：

> **Retained artifacts** — leaving a worktree keeps its branch and files. Setup failures can also retain partial artifacts; checkout removal and branch deletion belong to the user or another consumer.

即：**没有移除入口**，失败或离开后分支与目录永久留存。

### 1.3 Terminal

`client/ui-sidebar-terminal` 提供右栏终端面板（字体、失败报告、OSC 颜色保留）。缺口：不恢复进程、不把输出发给 Agent、无分屏。tool-terminal 是模型侧工具。

### 1.4 Forge 面板已记录的缺口（README Known Limitations）

过滤文件与 LFS、仅在订阅时轮询、未打开会话的工作树缺失、检查触发时机、保留的工作树不清理、轮次中消息无 hold、仅本地 revision、变更范围只有工作区（deferred：单提交 / 上一轮）。

## 2. 切片（按优先级）

### S1 Worktree 归档清理（P0，本批首个）

**问题**：工作树目录与分支只能手工删，失败残留无人清理。

**范围**：
1. `worktrees.remove(agent, record, request)`：校验记录（仓库根、完整 commit、分支名、目标在 pool 内）；目标存在则 `git worktree remove`（仅未锁定的注册）；目标目录不存在时只清理注册；`deleteBranch` 为真时删除分支；任何一步失败都保留现场并报错。
2. forge Remote `removeWorktree(session, signal)`：与 `restoreWorktree` 同构（`maintain` + 面板状态 + `forgePanel/*` 错误码）。
3. 面板：工作树卡片新增「移除工作树」二次确认（提示未提交改动会丢失、分支是否一并删除），处理中与失败态可见。
4. 文档：worktree 与 forge README 中英补移除语义；typert 目录再生。

**验收**：服务测试（成功移除 / 有未提交改动仍可移除但提示 / 锁定注册拒绝 / 目录已缺失只清注册 / 分支删除）；Remote 测试（无工作树、会话忙、Git 失败码）；面板交互测试（确认、取消、失败提示）。

**风险**：破坏性操作。二次确认必须写明「未提交改动不可恢复」，默认不删分支。

### S2 变更范围：单提交与上一轮

在面板的 scope 选择器里补 `commit`（当前 ChangeRequest 的某个提交）与 `last-turn`（本会话最后一步的改动），复用现有 diff 管线；无对应事实时显示原因而不是空面板。

### S3 过滤文件的只读说明

对 LFS 指针与 filter 覆盖导致的“看似改动”文件，在文件行标注原因（不可下载/不可解码），避免用户误判为脏改动。

### S4 未打开会话的工作树摘要

会话列表行对未加载会话显示缓存的工作树与绑定，没有缓存时显示「打开后可见」，而不是空白。

### S5 终端面板窄屏适配

390/768 下终端面板以全幅覆盖打开（与文件面板一致），字号与行高沿用主题终端角色；失败拉起重试入口，而不是要求整页刷新（当前 lazy chunk 失败需刷新）。

### S6 轮次中消息 hold 的可解释 UI

工作树维护期间消息被 hold 时，composer 显示「等待工作树就绪」与可用的停止入口，而不是静默等待。

## 2.1 S1 进展（2026-11-14，已完成）

| 层 | 落地内容 | 测试 |
|---|---|---|
| worktree 服务 | `worktrees.remove(agent, { …, deleteBranch })`：与 restore 同套校验、不加 force 移除（脏检出保留并报错）、缺失目录清登记、锁定拒绝、未合并分支保留并报错 | +5（移除/删分支/脏检出保留/锁定/池外零命令） |
| 投影与记录 | 新 plugin record `removed`：`forgeWorktree` 投影清空 `created`，旧日志回放不变 | 投影/回放规格随之通过 |
| forge Remote | `forgePanel.removeWorktree(session, deleteBranch, signal)`：维护中先把工作目录移回源仓库，再移除；失败映射 `forgePanel/remove-failed` | +3（移除/删分支拒绝/无工作树） |
| 面板 UI | 检出行「移除工作树」按钮 + 二次确认（未提交改动会丢失、可选删分支、失败原因留对话框） | +2（确认后调用、勾选分支、拒绝保留对话框） |

证据：`pnpm run test:gui` 10858 通过；`tsc -b` 两套 face 干净；`test:docs` 21/21；`build` 通过。

## 2.2 S2 进展（2026-11-14）

| 项 | 状态 | 说明 |
|---|---|---|
| 单提交范围 | 已落地 | `ForgeLocalScope` 新增 `{ kind: 'commit', commit }`；比较提交与其父提交、新侧取自该提交；变更视图菜单「本次提交」用当前检出 commit，检出未就绪时不显示 |
| 上一轮范围 | 已裁决：Host 推导 | 见 §2.3 验收条目 |

## 2.3 S2「上一轮」范围：Host 推导的验收条目（已裁决）

**架构约束**：`Session.snapshotEvents` 已弃用且禁止新调用，因此推导必须走**投影**：新增 `forgeTurnFiles` 投影，按 `tool/call` / `tool/result` 折叠出「最后一个已结束轮次」触及的路径集合；面板与 `localDiff` 从投影读取，不直接扫日志。

**计入规则**：

| 项 | 规则 |
|---|---|
| 轮次 | 最后一条 `turn/end` 对应的轮次；没有已结束轮次时不提供该范围 |
| 调用来源 | 该轮次的 `tool/call`，结果以同 `callId` 的 `tool/result` 判定 |
| 成功判定 | `tool/result.message.isError` 为真或带 `error` 的调用**不计入** |
| 写入类工具 | 参数中可读出路径者：`write` / `edit`（`path`、`file_path`、`filePath`） |
| 补丁类 | `apply_patch` 及统一 diff：解析 `*** Update File:` / `*** Add File:` / `*** Delete File:` 与 `diff --git a/x b/y`、`+++ b/x`、`--- a/x`；同一补丁里的多个文件全部计入 |
| 删除类 | `delete` / `remove` 的路径计入（呈现为删除） |
| 重命名类 | `move` / `rename`：源与目标都计入，呈现为「旧路径删除 + 新路径新增」 |
| shell 类 | 计入但**标注为推导**：读取 `bash`/`terminal` 命令里的重定向目标（`>`、`>>`、`tee`）与固定写命令集合（`rm`、`mv`、`cp`、`sed -i`、`touch`、`truncate`、`dd of=`、`git apply`、`git checkout --`、`git restore`）的路径参数；含 `$VAR`、未展开通配符或管道内联子命令的 token 丢弃，不推断其副作用 |
| 相对路径 | 相对会话工作目录解析为绝对路径后去重；越出检出的路径丢弃 |
| 范围语义 | 对计入路径集合，读取**工作树相对 HEAD** 的差异（等价于“未提交”范围限定到这些文件）；不做轮次结束时的快照，轮次之后的改动同样反映——文档写明 |
| 未跟踪文件 | 计入（相对 HEAD 的新增） |
| 空集合 | 面板显示「上一轮没有写入任何文件」，而不是空列表或报错 |

**测试清单**：成功写入计入；失败/取消调用排除；重命名双侧；补丁多文件计入（update/add/delete 三种头 + 统一 diff）；shell 重定向与 `tee` 计入；shell 写命令（rm/mv/cp/sed -i）计入且参数顺序正确；带 `$VAR`/通配符的 token 丢弃；相对路径归一到根；越界路径丢弃；空集合文案；没有已结束轮次的隐藏。

**UI 标注**：范围菜单与说明行写明「含 shell 命令推导，可能遗漏未识别程序的写入」。

### 2.3.1 落地情况（2026-11-14，`3491c0d671`）

| 项 | 状态 |
|---|---|
| `forgeTurnFiles` 投影（call/result 折叠、失败排除、turn 切换清空、cwd 跟随） | 已落地，注册于 forge 面板，9 条测试 |
| 路径提取：写入/编辑/删除/move 双侧/补丁（apply-patch 头 + 统一 diff + 重命名双侧）/shell（重定向、tee、rm/mv/cp/sed -i/touch/truncate/dd of=/git apply·checkout·restore） | 已落地，需展开的 token 丢弃 |
| 相对路径归一、越界丢弃、去重保序 | 已落地 |
| `{ kind: 'last-turn' }` Remote 支持（工作树相对 HEAD 按投影过滤） | 已落地 |
| 菜单项「上一轮」+ 推导说明 | 已落地 |
| **偏差**：无已结束轮次时仍显示该项，返回空集合并显示空状态；原验收要求「不提供该范围」，因视图侧没有轮次信息，改为由 Host 返回空集合 | 待补：空集合专属文案「上一轮没有写入任何文件」与「无轮次时不显示」的判定（可把轮次号随面板状态下发） |

## 3. 依赖与顺序

S1 → S2（都要动 forge Remote 与面板状态，先做破坏性操作把错误码与确认模式定下来）→ S3/S4（读面增强）→ S5（终端独立）→ S6（生命周期语义）。

## 4. 本批不做

- 远端分支推送、PR 创建（forge-github 已有读面，写面需要账号与仓库权限决策）；
- 终端分屏与进程恢复（需要 Host 侧会话恢复模型）；
- 工作树自动 GC（语义上应由用户在 S1 里显式触发）。
