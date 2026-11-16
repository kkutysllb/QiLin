---
description: "上游 rc.2 §3.2-4 的对齐增量：diff 窗口化、窄屏浮层文件树、工具栏/Alt 文件跳转、worktree 创建期限放宽；记录无法逐行比对的口径与 B9 剩余待办。"
kind: "plan"
---

# Forge 审阅体验：rc.2 §3.2-4 的对齐增量

- 日期：2026-11-16
- 上游条目：dsh 0.2.2-rc.2 体验优化第 4 条「代码审阅评论/文件导航/窄屏布局、大改动卡顿、大仓库 worktree 等待」
- 关联记录：[具名多层子代理与 Team](2026-11-16-named-multilevel-team-alignment.md)、[描述优先的 UI 吸收](2026-11-16-subagent-task-description-first.md)

## 1. 吸收前状态

[delta 分析:53](2026-11-12-upstream-0.2.2-rc.2-delta-analysis.md#L53) 把这条记为「未吸收（B9）」，[alignment 计划](2026-11-12-upstream-0.2.2-rc.2-alignment.md) 的 [B9 批次:125-129](2026-11-12-upstream-0.2.2-rc.2-alignment.md#L125-L129) 至今未执行（[状态表:186](2026-11-12-upstream-0.2.2-rc.2-alignment.md#L186) 记 `B4/B7–B13 未开始`）。

本仓有 2026-10-29~31 移植的 forge/worktree 基座（[alpha.3 delta:40](2026-11-03-upstream-0.2.2-alpha.3-delta-analysis.md#L40)）：行内评审、批量 review、可搜索文件树、容器查询布局、`diff-too-large` 兜底、worktree 进度与恢复都在；rc.2 的这批增量不在其中。

## 2. 本次对齐的口径

本 checkout 不含上游源码，无法逐行 diff `client-ui-forge`（上游 churn +15,234/−1,015）。因此按发布说明的三项**承诺**在我们树上实现等价能力，并把 B9 里属于数据契约与归档语义的条目留在待办（§5）。这不是「逐行移植」，记录在案以免后续误判。

## 3. 落地清单

| 承诺 | 实现 | 文件 |
|---|---|---|
| 大改动不卡顿 | 展开后的文件按 600 个绘制行分窗：只对窗口内的行做高亮与 DOM，末尾「再显示 N 行」按同样步长增加。窗口化发生在高亮之前，因此高亮文本也有界。 | [diff-rows.ts](../packages/experimental/client-ui-forge/src/client/diff-rows.ts)（`windowSegments`、`DIFF_WINDOW_ROWS`）、[DiffFile.tsx](../packages/experimental/client-ui-forge/src/client/DiffFile.tsx) |
| 窄屏布局 | 文件树在容器 ≥760px 时是并排的一列；<760px 时改为浮层覆盖 diff（按左右位置贴边、带描边与投影、隐藏拖拽分隔条），diff 不再被压到最小宽度以下；树按钮在所有宽度都留在工具栏；窄屏工具栏允许换行。 | [ChangesTab.module.css](../packages/experimental/client-ui-forge/src/client/ChangesTab.module.css) |
| 文件导航 | 工具栏新增「上一个文件 / 下一个文件」，以及标签页内（文本框之外）的 Alt+↑ / Alt+↓；与既有的 diff 内 ←/→ 使用同一顺序（数据顺序，首尾夹紧）。索引进位抽成纯函数便于测试。 | [ChangesTab.tsx](../packages/experimental/client-ui-forge/src/client/ChangesTab.tsx)、[file-tree.ts](../packages/experimental/client-ui-forge/src/client/file-tree.ts)（`stepFileIndex`） |
| 大仓库 worktree 等待 | 新增 `createTimeoutMs`（默认 300000）：创建与恢复的 Git 命令、目录分配走这一期限；其余查询仍用 `timeoutMs`（默认 60000）。`runCommand` 接受调用方传入的期限。 | [worktree/src/process.ts](../packages/experimental/worktree/src/process.ts)、[worktree/src/index.ts](../packages/experimental/worktree/src/index.ts) |
| worktree 归档清理（delta 第 58 条） | Workspace 在归档落盘后派发 `workspace/session-archived`（parallel，抛错只记日志）；worktree 服务据此移除本进程仍持有的该会话检出，**保留分支与提交**；含未提交/未跟踪文件的检出保留（移除从不加 `--force`），会话不再加载时保留全部；`retainOnArchive`（默认 `false`）保留所有检出。 | [workspace/src/index.ts](../packages/workspace/workspace/src/index.ts)、[worktree/src/index.ts](../packages/experimental/worktree/src/index.ts) |

审阅评论部分：行内评论、批量 review、引用到输入框、已发布/暂存状态都已存在于基座（本批未改），本次只补评审体验的读取性能与导航。

## 4. 验证

| 检查 | 命令 | 结果 |
|---|---|---|
| 两个包的全部测试 | `vitest run packages/experimental/client-ui-forge packages/experimental/worktree` | 33 文件 / 864 用例通过 |
| 归档相关回归 | `vitest run packages/workspace packages/core/agent packages/jobs packages/schedule packages/experimental/worktree` | 74 文件 / 1706 用例通过 |
| 类型与静态检查 | `typecheck:contracts-ready`、`oxlint <两包>` | 通过（0 warning / 0 error） |
| 客户端文案归属 | `verify-client-ui-i18n` | 通过 |
| 双语配对 | `verify-translation-pairing` | 1205 对一致 |
| 覆盖（过滤运行） | `vitest run --coverage <两包>` | `diff-rows.ts`、`DiffFile.tsx`、`file-tree.ts` 100%；`ChangesTab.tsx` 与 `worktree/src/index.ts` 在过滤运行下仍有既有未覆盖行（`ChangesTab` 164/202/214/492/614、`worktree` 221–242 等与本次无关的位置），全量覆盖门需在完整套件里复核 |

新增测试：窗口切割与展示（4 例）、900 行文件分窗与「再显示」（1 例）、`stepFileIndex` 三态（3 例）、工具栏/Alt 跳转与空列表（2 例）、worktree 期限参数（1 例）与 `createTimeoutMs` 校验。

## 5. B9 剩余待办（本批未做）

- **provider 契约三条**：overview、pinned diff、review reads 的取数契约。没有它们，评论/概览/已读进度无法在客户端闭环。这是 B9 剩下的主体，按 Host 契约 → Remote → 客户端消费的顺序分片。
- **bundle 行迁移复核**：已核对，当前 `forge-bundle` 含 `worktree` 与 `tool-worktree` 两条顶层 insert，与 alpha.3 分析的缺口描述不一致；以当前树为准，无需改动。
- **上游细节无法逐行比对**：若后续取得上游 `client-ui-forge` 的 rc.2 快照，应按真实 diff 复核三处的交互细节（评论导航、窄屏阈值、分窗粒度）。

## 6. 已知边界

- 评论锚点落在未绘制的窗口行时，仍按「过期记录」显示在文件末尾——与「文件被折叠/未展开」时的既有行为一致；分窗不会把窗口外的评论变成可点击的行。
- 窄屏文件树是 CSS 浮层，没有焦点陷阱与 Escape 关闭；键盘用户仍可经工具栏按钮切换显隐。若需要，再按弹层语义补。
- `createTimeoutMs` 只覆盖创建与恢复；大仓库**移除** worktree 仍用 60s 命令期限。
- 归档清理只覆盖**本进程**创建或恢复的检出：重启后归档一个旧会话不会删除它的检出（记录只在进程内）。归档不会改动该会话的工作目录字段，也不删除分支或提交。
- 归档清理与用户手动移除并发时按先到者处理；移除失败（脏检出、锁定、会话未加载）只记日志并保留目录。
