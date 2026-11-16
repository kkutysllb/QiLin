---
title: Forge 面板 D/E 阶段（宿主 + 客户端）分波次移植
description: 记录 client-ui-forge 整包移植的依赖缺口实测、分波次顺序与每波验收口径
kind: plan
---

# Forge 面板 D/E 阶段分波次移植

## 结论

C 阶段已把 `experimental/forge`、`experimental/forge-github` 提升到 rc.3 契约，面板宿主以兼容层（当前 `packages/experimental/client-ui-forge/src/index.ts`）消费新契约。D+E 的目标是用上游整包替换面板宿主与客户端。

本仓客户端基础包与上游存在**成体系的代际差**，面板不能单独移植。已做一次整包「干跑」验证（复制上游 `client-ui-forge` 的 31 个 TSX/组件、18,903 行 src 与 17,704 行测试），结果：宿主侧经少量适配可归零，客户端侧停在 36 个类型错误，全部指向下列基础包缺口。干跑结论已达成，改动已整体回退，树保持绿色。

## 实测依赖差（递归 `src` 行数）

| 包 | 上游 | 本仓 | 说明 |
|---|---:|---:|---|
| `client/ui-conversation` | 17,810 | 13,889 | 缺引用插入（Quote 节点、`insertQuote`） |
| `client/ui-chat` | 16,848 | 14,382 | 缺 `insertQuote` 的输入面接线 |
| `client/ui-workspace` | 7,028 | 5,030 | 缺会话行 trailing 座席与归档通知 |
| `client/ui-primitives` | 13,969 | 15,667 | 本仓更大但为混合代：缺 `QuoteSummary`、`omitHtml`、`IconLayersOutlineRegular`；本仓 `MarkdownLabels` 要求 `mermaid`，上游面板不提供 |
| `client/ui-renderer` | 2,993 | 2,463 | 导航参数按 tab 收窄、tab 注册面 |
| `client/ui-layout` | 1,097 | 974 | 与面板会话行相关的布局座席 |
| `client/ui-sidebar-right` | 4,698 | 4,521 | 基本同代，随面板替换小修 |
| `session/session-projection` | 1,031 | 962 | 缺 `ProjectionHandle`（`register` 返回值同时是可等待句柄） |

面板整包：`experimental/client-ui-forge` 上游 src 18,903 行（31 个 TSX）+ 测试 17,704 行；本仓当前 src 约 7.6k。

## 干跑记录（已回退）

按上游整包复制后，依次处理：

1. `session-projection` 缺 `ProjectionHandle`：验证可行方案是让 `register` 返回「disposer ∧ thenable」——同步调用仍是 effect disposer，`await` 得到 `{ stateOf, readerFor, dispose }`；同时把 `ProjectionDefinition` 的 key 约束从 `keyof SessionProjectionStateMap` 放宽为 `string`（上游面板通过 `SessionProjectionMap` 声明 `forgeWorktree`）。
2. `tsconfig` 缺 `@qilin-agent/experimental-worktree/types` 源映射，导致 Typert 分析加载 `lib/` 产物。
3. Typert 需在宿主产物重建后重跑，Remote 客户端类型才更新。
4. 测试 harness 与本仓差异：`Agent` 无 `model` 字段、testkit 无 `unsupportedModel`、`agent/pre-step` 载荷无 `modelSelection`、`Agent.retry` 需补齐；已用「删字段 + 本地 retry 抛错」方式在干跑中通过宿主类型检查。
5. 客户端剩余 36 个错误集中在：`QuoteSummary`/`insertQuote`（conversation+chat）、`IconLayersOutlineRegular`（icons）、`omitHtml`（MarkdownText）、`workspace/archive-notice` 事件、`sidebar.session.row.trailing` 座席与 `SessionRowForge` 注入 props、`ja` 之外的多语言 locale 类型、`ChangesParams` 导航参数收窄。

## 波次顺序与验收

每一波独立提交，验收统一为：两个聚合 `tsc -b` 0 错误、该包全部测试通过、`oxlint` 0 error、受影响文档/配对/目录门通过。

1. **primitives 增量**：`IconLayersOutlineRegular`、`QuoteSummary`（引用节点摘要）、`MarkdownText.omitHtml`；`MarkdownLabels.mermaid` 收敛为可选或由面板补标签（选其一，保持现有调用方不变）。验收：`ui-primitives` 测试全绿，新增导出有测试。
2. **conversation + chat 引用插入**：移植上游 quote 节点、`insertQuote`、`QuotePreview` 接线、标签与输入区渲染；`SessionInput` 暴露 `insertQuote`。验收：两包测试 + 面板 `ReviewComposer` 相关用例（先以独立小测试验证）。
3. **ui-workspace 会话行与归档通知**：`sidebar.session.row.trailing` 座席（配合 `ui-slots`）、`workspace/archive-notice` waterfall 与 `ArchiveNotice`、会话行注入 props（`sessionId` 等）。验收：`ui-workspace`/`ui-slots` 测试；面板 `SessionRowForge` 可编译。
4. **session-projection `ProjectionHandle`**：按干跑方案落地「disposer ∧ thenable」，放宽 `ProjectionDefinition` 约束；补测试覆盖同步 disposer、`await` 句柄、释放后读取语义。验收：`session-projection` 测试 + 所有既有消费者不变。
5. **client-ui-forge 整包替换**：宿主 + 客户端 + 测试整体换上游版本，删除兼容层；按本仓 `agent-loop-testkit` 能力适配 harness；locale 先收敛到本仓支持的语言集。验收：面板全部测试、两个聚合、`verify-client-ui-i18n`。
6. **收口**：`docs/subsystems/forge.md` 正文按上游重写（当前仍描述 C 之前契约）、面板 README 双语、Kylin 目录、覆盖率补齐（`turn-files.ts`/`ForgeTab` 等缺口随替换消失或补测）。

波次 1–4 是纯增量，可随时停在绿树；波次 5 是唯一的大爆炸提交，只有在 1–4 完成后才开始。

## 进度

### 波次 1：primitives 增量（完成）

- `QuotePreview` 扩展：新增 `QuoteSummary`、`QuotePreviewRemoval`；摘要模式把正文换成 label + 可读 title/detail + 内联 body，浮层显示 title/detail/body；移除模式把引号标记换成可聚焦的移除控件；旧调用（labels + onJump）保持不变，摘要模式不渲染复制/跳转。
- `MarkdownText` 新增 `omitHtml`：原始 HTML 节点渲染为空，settled 与 streaming 两条路径一致，缓存失效条件包含该开关。
- 新增产品图标 `IconLayersOutlineRegular`/`Medium`（layers-outline 100→101 个字形）。
- 测试：新增摘要/移除/omitHtml 用例；`ui-primitives` 1,530 用例通过；两个聚合 typecheck、`oxlint`、`verify-client-ui-i18n`、`verify-export-jsdoc`、`test:docs` 21 项、双语配对全绿。

### 波次 2 试跑记录（已回退，结论：改为整包）

按「只摘引用插入」的方式试跑，移植上游 conversation 的 12 个文件（`QuoteNode.tsx`、editor runtime、
projection、draft、contracts、facade、hub）加 3 个输入模块（`machine`、`prompt`、`file-intake`）：

1. 包内类型检查可归零，仅需 3 处增量：primitives 补 `formatQuoteText`、`ModelSelectionProjection`
   改从 `api-session-controller` 取、conversation locale 补 `quote.remove`。
2. 客户端聚合随 `InputActions.insertQuote` 扩散到 11 个测试 mock，机械补齐后聚合归零。
3. **但包内测试 37 个失败**：`machine`/`hub`/`facade` 与上游是同一代，`submit` 事件（`send-committed`）、
   `SubmitAttempt` 新字段（`occurrences`/`quotes`/`attachmentIds`）、草稿清空时机、提交调用形状都变了；
   把上游对应测试整份拷入会再引入 71 个错误（它们依赖新 testkit、文件粘贴路由与 `ComposerFileIntake` 座席）。

结论：引用插入不是可外科摘除的特性，它与 submit 机器、hub、facade、document paste route 同代。
波次 2 的正式口径应为 **ui-conversation 整包移植（src + tests）**，随后再做 ui-chat 的增量；干跑改动已整体回退，树保持绿色。
