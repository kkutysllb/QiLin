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
- B 阶段已完成（见 §10），C+D 的 forge 契约与 host 是下一步，最后 E；每阶段独立提交并保留本仓既有测试。

## 10. B 阶段实施记录（2026-11-16）

上游 `experimental/worktree` 的 9 个源文件与 8 个测试文件（含 harness、locale、package/tsconfig）已移植，并按本仓 API 适配：

| 上游依赖 | 本仓适配 |
|---|---|
| `ProjectionHandle`（`register()` 返回句柄，`handle.stateOf(session)`） | 本仓注册表返回 disposer；改为 `ctx.sessionProjections.stateOf(session, 'worktree')`，回收器接收读取函数 |
| `workspace/session-unarchiving` | 已补：归档集合写入前派发，拒绝时保持归档 |
| `working-directory/access`（waterfall） | 已补：`ensure`/`set` 在验证与提交外包裹 waterfall |
| `sessionQuery.inspectSession` | 已补：`SessionObservationReader` 增加 `acquire`/`inspect`，冷会话按需准备后同步读取 |
| `unsupportedModel` 等新 testkit 导出 | 测试用本仓既有 Agent 替身，不依赖新导出 |
| 上游已删除的公开 `remove` | 本仓面板仍在使用，保留兼容实现（非强制移除 + 可删已合并分支），E 阶段随面板移植再决定去留 |
| 分支前缀 `dsh-` | 改为 `qilin-`（本仓品牌），文档、测试与配置目录同步 |
| 中文 README 引用的 Agent Note | 移植上游 35 行的创建决策（双语 + 配对记录） |

验证：worktree 106 用例、受影响六包 1199 用例通过；两个聚合 `tsc -b`、`oxlint`、`verify-cordis-config`、`verify-package-dependencies`、`verify-export-jsdoc`、`test:docs` 21 项、双语配对 1206 对全绿；过滤覆盖下 worktree `src/` 全部 100%。

## 11. C 阶段实施记录（2026-11-16）

上游 `experimental/forge`（1,394 行）与 `experimental/forge-github`（2,573 行）连同上游测试（4,221 行）已整体移植：

- 契约：`ChangeRequestSnapshot` 增加 reviewers/closingIssues/branchUpdates/canRequestReviews/canRerunChecks/threadsTruncated 等概览字段；`Check.rerun`；`ForgeFailure` 增加 `stale`/`unsupported`；`diff(ref, headSha, signal, base?)`、`readReview`/`writeReview`、commits/compare/mergeBase/viewed/rerunChecks/requestReviews/updateBranch 全部就位；事件 `forge/providers-changed`、`forge/review-changed`。
- GitHub provider：threads/viewed/review-writes/overview/commits/compare/mutation 等 14 个源文件与 11 个测试文件；locale 8 语言。
- 面板宿主做最小迁移以保持现有 UI 可用：`changeRequestDiff` 传当前快照 head（不再钉住旧 head），`reviewThreads` 改读 `readReview(最新 head)` 并返回 `ForgeReviewData`；客户端移除 head 钉住与提示，`stale-head` 读取保持 in-flight 等下一次状态；卡片移除作者描述与提交数，只读 thread 改为渲染上游 thread（comments/anchor/subject）。
- `forge-session` 保持本仓实现：上游版本依赖本仓没有的 ptc-runtime / tool-executor / 新版 Shell API；只调整其测试 fixture 以符合新快照与 check 字段。

验证：forge/forge-github/forge-session/client-ui-forge/tool-worktree 共 1,449 用例通过；两个聚合 `tsc -b`、`oxlint`、`test:docs` 21 项、`verify-client-ui-i18n`、双语配对全绿；forge 与 forge-github 过滤覆盖 100%。

遗留：`client-ui-forge` 覆盖率仍有缺口（`turn-files.ts`、`ForgeTab` 等既有 + 本轮适配），留待 D/E 重写收口；`docs/subsystems/forge.md` 正文仍描述旧契约，需随 D/E 按上游重写。
