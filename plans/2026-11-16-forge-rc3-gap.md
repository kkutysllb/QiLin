---
description: "以本地 dsh 0.2.2-rc.3 fork 为权威，逐项核对 Forge/Worktree 的 B9 实现：哪些是等价实现、哪些口径不同、剩余移植范围与顺序。"
kind: "plan"
---

# Forge/Worktree 与上游 rc.3 的差距（B9 复核）

- 日期：2026-11-16
- 上游：`~/kk_Projects/deepseek-harness`，`0.2.2-rc.3`，commit `39163dd30f`
- 权威文本：`docs/upgrade-guide/v0.2.2-rc.1/{forge-change-request-overview,forge-pinned-diff,forge-review-reads,archive-worktrees}/guide.md`
- 关联：[B9 对齐记录](2026-11-16-forge-review-batch-b9.md)

上一轮在没有上游源码时按发布说明做了**等价实现**。拿到 rc.3 源码后逐项核对，结论：**契约形状与上游不同，需要按上游重做**；只有 worktree 期限、bundle 行、归档清理的默认开关在方向上一致。

## 1. pinned diff

| | 上游 | 本仓（上一轮） |
|---|---|---|
| 契约 | `ForgeProvider.diff(ref, headSha, signal, base?)`（[types.ts:535-541](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge/src/types.ts:535)） | 新增 `diffAt(ref, { headSha, baseBranch }, signal)` |
| 失败码 | `ForgeFailure` 新增 `stale`；头不是 `headSha` 时返回 `stale` | 无 `stale`；失败包装成 `unavailable` |
| GitHub | 先一次 GraphQL 读 head 与 base 提交，`stale` 或 compare **commit...commit**（[provider.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge-github/src/provider.ts)、[compare.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge-github/src/compare.ts)）；`base...head` 的全量 diff 解决了 300 文件上限 | `compare/<base 分支>...<head>`，base 是分支名，不是提交 |
| 客户端 | `forgePanel/changeRequestDiff` 在 head 移动后拒绝 `stale-head`（[index.ts:436](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/client-ui-forge/src/index.ts:436)），视图等更晚的状态再读 | 客户端自行钉住旧 head 并显示自定义提示，不产生 `stale-head` |
| 快照 | 新增 `baseSha?` 与 `threadsTruncated` | 无 |

## 2. review reads

| | 上游 | 本仓 |
|---|---|---|
| 契约 | `readReview(ref, headSha)` → `ForgeReviewData { headSha, viewer, threads, truncated, pendingReview, viewerCanReview }`；`writeReview` 负责待提交评审；`ForgeFailure` 新增 `unsupported` | `reviewThreads(ref, signal)` → `ForgeReviewThread[]` |
| 失败码 | 不支持的读取返回 `unsupported` | 不支持的读取返回 `unavailable` |
| GitHub | [threads.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge-github/src/threads.ts)（262 行）读取线程、viewer、pending review | 自写 GraphQL 读线程数组 |
| 客户端 | `ReviewThreads`/`ThreadList`/`thread-state` 展示已发布线程、待提交评审与可写权限 | 只读线程卡片 |

## 3. overview

| | 上游 | 本仓 |
|---|---|---|
| 快照字段 | `reviewers`、`reviewersTruncated`、`closingIssues`、`closingIssuesTruncated`、`branchUpdates`、`canRequestReviews`、`canRerunChecks`（[types.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge/src/types.ts)） | 自造 `body`、`commitCount` |
| 检查项 | `ChangeRequestCheck.rerun: ForgeCheckId \| null` | 无 |
| 动作失败码 | `ForgeActionFailure['code']` 新增 `unknown` | 无 |
| provider | `viewedFiles`/`setViewed`、`rerunChecks`、`requestReviews`/`reviewerCandidates`、`updateBranch` | 无 |
| 客户端 | `ChangeRequestOverview` 列出审阅者、关联 issue、分支更新，并提供重跑检查/请求评审/更新分支 | 卡片显示描述与提交数（自造） |

## 4. 大改动卡顿

| | 上游 | 本仓 |
|---|---|---|
| 机制 | 无逐文件窗口；`LARGE_FILE_LINES = 1000` + `OPEN_LINES = 5000`（与移植基座相同），`memo(DiffFile)`、`SectionReach` 跳转、工具栏折叠观察、viewed 标记参与预算（[ChangesTab.tsx:807](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/client-ui-forge/src/client/ChangesTab.tsx:807)） | 自造 600 行窗口 + 「再显示 N 行」；无 memo/SectionReach/viewed |
| 结论 | 窗口化不是上游行为，应回退并移植 memo + SectionReach | |

## 5. 窄屏与文件导航

| | 上游 | 本仓 |
|---|---|---|
| 窄屏 | 容器查询 760/520/380（[ChangesTab.module.css:80,86,144](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/client-ui-forge/src/client/ChangesTab.module.css:144)），未发现浮层文件树 | 树按钮常显 + <760px 浮层 |
| 导航 | diff 内 `ArrowLeft`/`ArrowRight`，快捷键还含 `V`（[ChangesTab.tsx:1063,1211](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/client-ui-forge/src/client/ChangesTab.tsx:1063)） | 工具栏上一个/下一个 + `Alt+↑/↓`（自造） |

## 6. worktree 归档清理

| | 上游 | 本仓 |
|---|---|---|
| 记录 | 创建时写 `plugin:worktree/created` Session 记录 + `worktreeProjection`（[projection.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/worktree/src/projection.ts)），重启后仍可清理 | 进程内 Map，重启后丢失 |
| 清理 | `WorktreeReclamation`（253 行，[archive.ts](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/worktree/src/archive.ts)）：无人引用、创建者策略非只读、无 tracked/untracked/submodule/lock/detached HEAD 才移除；忽略文件与 skip-worktree 编辑会被丢弃；失败上报 `worktree/cleanup` 事件 | 简化为「本进程记录 + 非强制移除」 |
| 开关 | `retainOnArchive` 为 `Volatile<boolean>`，默认 false，插件页可实时切换 | 本轮已改为 volatile，默认 false |
| 期限 | 单一 `timeoutMs` 默认 300000 | 本轮已对齐（删除自造 `createTimeoutMs`） |

## 7. bundle 行

上游为顶层 `forge-panel`，没有 `forge-worktree` 行与 `optional-forge-panel` 组（[cordis.patch.yml](/Users/libing/kk_Projects/deepseek-harness/packages/experimental/forge-bundle/cordis.patch.yml)）。本仓本轮已改为同一行集；README 同步更正。

## 8. 移植顺序

| 阶段 | 内容 | 规模 |
|---|---|---|
| A（本轮已完成） | bundle 行、worktree 期限与 `retainOnArchive` 可热改、文档 | 小 |
| B | worktree 全量对齐：`projection.ts`、`archive.ts` 的回收器与资格判定、`worktree/cleanup` 事件、`sessionProjections` 注入 | ~1.2k 行 |
| C | forge 数据面：`types.ts`（`stale`/`unsupported`、快照七字段、`rerun`、`unknown`）、`forge/index.ts`（`latest`/`diff(headSha)`/`readReview`/`writeReview`/检视与动作）、`forge-github`（`pull-request-node`/`commits`/`compare`/`threads`/`overview`/`viewed`） | ~2.5k 行 |
| D | host 侧 `client-ui-forge/src/index.ts` 重写：全部 Remote 方法、`stale-head`、viewed/lens/commits、overview 动作 | ~3–4k 行 |
| E | 客户端 UI：`ChangesTab`/`DiffFile`/`ChangeRequestOverview`/`ReviewThreads`/`ThreadList`/`CommitMenu`/`LensFilter`/`WorktreeSettings` 等 | ~8k 行 |

C/D/E 必须成组推进：契约一改，host 与客户端同时不编译。E 还依赖上游 `client-ui-primitives`（+4,358）与 `ui-sidebar-files`（+3,883）的新增能力，需要先核对这两个包的差异。

## 9. 当前结论

- B9 的**能力方向**已具备，但**契约与交互不是上游口径**；上一轮记录中「B9 四项落地」应理解为「等价实现完成」，不能当作逐行对齐。
- 下一步建议先做 B（worktree 自包含、风险低），再做 C+D 的 forge 契约与 host，最后 E；每阶段独立提交并保留本仓既有测试。
