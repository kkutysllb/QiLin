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

### 2.3.1 落地情况（2026-11-14）

| 项 | 状态 |
|---|---|
| `forgeTurnFiles` 投影（call/result 折叠、失败排除、turn 切换清空、cwd 跟随） | 已落地，注册于 forge 面板，9 条测试 |
| 路径提取：写入/编辑/删除/move 双侧/补丁（apply-patch 头 + 统一 diff + 重命名双侧）/shell（重定向、tee、rm/mv/cp/sed -i/touch/truncate/dd of=/git apply·checkout·restore） | 已落地，需展开的 token 丢弃 |
| 相对路径归一、越界丢弃、去重保序 | 已落地 |
| `{ kind: 'last-turn' }` Remote 支持（工作树相对 HEAD 按投影过滤） | 已落地 |
| 菜单项「上一轮」+ 推导说明 | 已落地 |
| 无轮次时隐藏 | 已补齐：面板状态下发 `lastTurn`（构造时读投影，`turn/end` 时发布），菜单据此隐藏该项 |
| 空集合文案 | 已补齐：「上一轮没有写入任何文件」 |

## 2.4 S4 未打开会话的工作树摘要：验收条目（开工前定稿）

**现状**：`client-ui-forge/src/client/session-list.ts` 的 `sessionForgeFacts` 从会话列表状态的 `projectionValues.forgeWorktree` 读工作树事实；未打开（未订阅）的会话没有该值，行内因此什么都不显示——用户无法判断某条会话是否跑在工作树里。

| 项 | 规则 |
|---|---|
| 数据来源 | 会话列表服务为**每条列出的会话**下发 `projectionValues.forgeWorktree`（工作树投影本身就是从日志折叠出的纯函数，未打开会话也能折叠） |
| 未打开会话的显示 | 有值：行内显示分支名与“工作树”提示；无值且会话未打开：显示“打开后可见”，不留空 |
| 缓存 | 服务端按会话缓存折叠结果，键为 `(sessionId, 最后事件 seq)`；该会话有新事件或列表刷新时失效重算 |
| 失效信号 | `worktree` 插件记录、`working-directory/change`、轮次事件到达时失效；不引入定时轮询 |
| 上限 | 单次列表至多折叠 `maxSessions` 条（沿用现有列表上限）；折叠耗时超过阈值时退化为“打开后可见”，不阻塞列表 |
| 不变量 | 打开会话后行内事实与面板一致（同一投影，无第二份状态） |
| 测试 | 未打开会话有工作树时行内显示分支；无缓存值显示“打开后可见”；打开后与面板一致；缓存随新事件失效；超阈值退化 |

**依赖说明（盘点修正）**：`projectionValues` 由**客户端会话管理器**从每会话的 projection store 读（`session-controller/src/client/sessions/manager.ts` 的 `buildListSnapshot` / `projectionValues`），而 store 只在收到该会话的 **control frame**（打开/建立控制连接）时创建。所以未打开会话没有 store，自然没有值。修正后的实现路径二选一：

1. **列表帧携带投影**：Host 在会话列表响应里带上 `forgeWorktree` 投影值（Host 侧投影服务可对未打开会话按日志折叠），客户端管理器只透传；
2. **批量投影读取**：新增一个按 sessionId 批量读投影的 Remote，列表行未打开时触发一次、按 `(sessionId, seq)` 缓存。

两者都改 `session-controller`（Host 与客户端两侧），不是 forge 包内改动；forge 只消费 `projectionValues`。

**已定方案：列表帧携带投影（方案 1）**。改动点（已核对文件存在）：

| 层 | 文件 | 改动 |
|---|---|---|
| Host 列表 | `packages/api/session-controller/src/list.ts` | 构建列表项时为每条会话取 `forgeWorktree` 投影值（经 Host 侧投影缓存，未打开会话按日志折叠） |
| Host 类型 | `packages/api/session-controller/src/types.ts` | 列表项增加 `projectionValues`（`Partial<SessionProjectionMap>`），仅含列表需要的键 |
| 线协议 | `packages/api/session-controller/src/client/contract/sessions.ts` | 透传该字段（Typert 再生） |
| 客户端 | `packages/api/session-controller/src/client/sessions/manager.ts` | `buildListSnapshot` 用列表帧的值填充 `projectionValues`，控制帧到达后以控制 store 为准覆盖 |
| forge | `src/client/session-list.ts` | 不改结构；补「无值且未打开 → 打开后可见」文案 |
| 测试 | `session-controller` 与 forge 各自 | 列表项带工作树投影；控制帧覆盖列表值；无值时行内显示「打开后可见」 |

开工前需先确认两点（下一步第一件事）：Host 侧投影缓存服务的服务名与读取 API；列表项当前是否已有字段可承载逐键投影值（还是要新加）。

### 2.4.1 落地情况（2026-11-14）

盘点修正（开工时核实）：方案 1 的数据面**已由既有通用机制交付**，不需要再加第二份字段。

| 方案 1 改动点 | 实际状态 | 证据 |
|---|---|---|
| Host 列表项带逐键投影 | 已有：`SessionSummary.projections`（`{ kind, asOfSeq, values }`，`values: SessionProjectionValues`，即 `Partial<SessionProjectionMap>` 加本编译面对未知的 JSON 键）由 `ApiSessionList.projectionsFor` 填充；Host 已附加的会话取 live 注册表（`sequenced`，空闲与运行同一条路径），未打开会话用 `sessionProjectionCache.cachedSnapshot` 零 I/O 读持久检查点（`cached`） | `src/list.ts`、`src/types.ts` 的 `SessionProjectionHints` |
| 线协议透传 | 已有，随 `SessionSummary` 走；客户端行类型在 `SessionListEntry.projectionValues` | `src/types.ts`、`client/sessions/service.ts`、`client/sessions/lineage.ts` |
| 客户端填充 `projectionValues` | 已有：`SessionManager.applyListBlock` 按 kind 落进 `ProjectionValueStore`（`sequenced` 高 seq 胜出，`cached` 只填没有 sequenced 行的键），`buildListSnapshot` 读出到 `SessionListEntry.projectionValues` | `client/sessions/manager.ts`、`projection-store.ts` |
| 控制帧覆盖列表值 | 已有：控制基线 `seed` 先丢弃全部 cached 行，再按 seq 落值 | `projection-store.ts` 的 `seed` |
| forge 补「打开后可见」 | 本次落地：列表值没有 `forgeWorktree` 键时事实标为未知，行内显示「带问号的分支」图标（v2 图标 `IconBranchQuestion`，可访问名与 tooltip 即「工作树：打开后可见」），悬浮卡片再写一行同文案；有值时是行内分支图标 + 悬浮卡分支名。行内两个标记都改用 24 格 v2 图标（`IconBranch` / `IconBranchQuestion`） | `src/client/session-list.ts`、`SessionRowForge.tsx`、`SessionHoverForge.tsx`、`locales.ts`；`ui-primitives/src/icons/v2/index.tsx` |

验收条目对应：

| 条目 | 结果 |
|---|---|
| 数据来源 | 已交付（同上），并有测试固定：冷行逐次读取缓存（`session-cold.host.spec.ts`），摘要键含 `forgeWorktree` 且值等于面板事实（`controller.host.spec.ts`） |
| 未打开会话的显示 | 有值 → 行内分支图标 + 悬浮卡分支名；无值 → 行内带问号的分支图标（标注「工作树：打开后可见」）+ 悬浮卡同文案，行内不留空。**「行内显示分支名」仍未按字面实现**：行内只有一格图标位（与状态圆点共用，见 `ui-workspace` 行的 leading 座位），分支名留在悬浮卡；行内文案以图标的可访问名与 tooltip 出现，而不是行内文字；行本身显示状态（运行、未查看、待处理）时这一格让给状态，说明只留在悬浮卡 |
| 缓存 | 服务端不折叠：列表读的是持久检查点视图，键由检查点自身的 `seq` 表达；写入点是创建、`turn/end`、计数阈值与 detach（缓存包测试已覆盖） |
| 失效信号 | 已附加会话走 live 注册表（事件即时生效）；未打开会话以 detach/轮次检查点为准，每次列表请求重读（测试固定；客户端只在连接建立与启动重试时发起列表请求） |
| 上限 / 退化 | 不适用：列表路径零 I/O、不折叠日志，没有可超的折叠预算；无检查点记录（缺失、被淘汰、版本不符）即「无值」，由文案覆盖 |
| 不变量 | 行内事实与面板读同一投影：`summaryKeys()` 含 `forgeWorktree`，其值与面板 `created` 相同、离开 worktree 后为 `null`（测试固定） |
| 测试 | 行渲染只读列出的值（`session-list.client.spec.tsx`）；「列出的块 → `projectionValues`」由 `session-controller` 规格固定（冷行请求摘要键、逐次读缓存、控制基线丢弃 cached 行）；「缓存块 → 行」这一跨包接缝没有单一集成测试，两段分别固定。无缓存值 → 行内标记 + 悬浮卡文案（新增 3 条）；打开后与面板一致（新增 1 条）；超阈值退化 —— 不适用 |

## 3. 依赖与顺序

S1 → S2（都要动 forge Remote 与面板状态，先做破坏性操作把错误码与确认模式定下来）→ S3/S4（读面增强）→ S5（终端独立）→ S6（生命周期语义）。

## 4. 本批不做

- 远端分支推送、PR 创建（forge-github 已有读面，写面需要账号与仓库权限决策）；
- 终端分屏与进程恢复（需要 Host 侧会话恢复模型）；
- 工作树自动 GC（语义上应由用户在 S1 里显式触发）。
