---
description: "工作步骤展示（transcript view）四档渲染与上游 DSH 0.2.1-rc.2 对齐：逐档差异表、移植/保留决策、涉及文件与验证矩阵。"
kind: "plan"
---

# 工作步骤展示四档渲染对齐（compact / standard / detailed / verbose）

- 日期：2026-10-20 · 上游取材源：本地 fork 仓库 `/Users/libing/kk_Projects/deepseek-harness` 的 tag `dsh-v0.2.1-rc.2`（只读 `git show`，**不使用**该 checkout 的工作树）。
- QiLin 基线：`main` HEAD `72bf1c773e`（工作树含其他 agent 的未提交改动；本计划只动 `packages/client/ui-chat/**` 与自身的 plan/README）。
- 范围：Settings → 通用设置 → 工作步骤展示（locale key `settings.transcript.title`，Host 设置字段 `ui-chat.transcriptView`）四档模式下 **过程组头 / 组正文 / 推理预览 / 工具调用细节 / 时长状态行 / 整轮折叠 / 折叠动画与滚动锚定** 的可见渲染。
- 不在范围：欢迎页、deepseek-account、品牌运行指示（麒麟印章 `RunningSeal`）、`webserver`/`app-boot`/`apps/web/tests`、`plans/2026-10-19-*`。

## 0. 模式策略事实（先确认基线一致）

`packages/client/ui-chat/src/client/presentation-policy.ts` 与上游 **逐字段相同**（仅 import 前缀差异）：四档策略为

| 模式 | `foldCompletedTurns` | `stepGrouping` | `liveProcessDetail` | `settledReasoningPreview` |
|---|---|---|---|---|
| compact | true | collapsed | false | false |
| standard | true | collapsed | true | true |
| detailed | true | history | true | true |
| verbose | false | none | false | true |

因此本任务的差异不在"模式开关表"，而在**各档共同消费的渲染件把策略落成了什么**。下游消费者：`chat/ChatGroupSeat.tsx`（组头/组正文/限高）、`chat/ReasoningRow.tsx`（推理预览）、`chat/AssistantMarkdown.tsx`（推理行与已停止标记）、`chat/ChatNodeSeat.tsx` + `contract/turn-process.ts`（整轮折叠范围）、`chat/ChatView.module.css`/`ChatGroupSeat.module.css`（行距、折叠动画）。

## 1. 逐档差异表

约定："上游"= rc.2 的 `conversation-nodes/` + `client/chat/` 同名文件；"QiLin"= 当前工作树。**保留**= 记录为有意的 fork 分叉，不在本任务移植。

### compact / standard（组头 + 摘要 + 初始收起）

| 项 | QiLin 现状 | 上游 rc.2 | 文件/符号 | 决策 |
|---|---|---|---|---|
| 组头存在性 | 有组头（`stepGrouping:'collapsed'` 恒 `grouped`） | 同 | `ChatGroupSeat.tsx` `grouped` | 一致，无需改 |
| 组头文案 | 运行中=实时类别（+标准 ` · detail`），已结束=前 3 类别摘要；150ms 最短保留 | 同 | `step-process.ts` `processTitle`（两树相同）、`ChatGroupSeat.tsx` `useStableLiveProcessTitle` | 一致 |
| 运行中组头文字动效 | 纯文本（`<span data-process-label>`） | `TextShimmer active={!closed}` 包裹标题 | `ChatGroupSeat.tsx` `ProcessGroupHeader` | **移植**（可见"运行中"提示） |
| 组正文 | 初始收起；限高 `min(400px,50vh)`；行距 6px | 同 | `ChatGroupSeat.module.css` `.body` | 一致 |
| 手动展开后的行距 | `.expandedBody` 覆盖 `--dsh-chat-flow-gap:16px`（组内行距 16px） | 展开正文仍 6px（rc.2 删除了 16px 覆盖） | `ChatGroupSeat.module.css` `.expandedBody` | **移植**（改回 6px） |
| 已结算推理预览 | 隐藏（策略 `settledReasoningPreview:false`） | 同 | `ReasoningRow.tsx` | 一致 |
| 流式推理预览 | 取 **最新一行**（`latestLine`，右对齐 `data-follow-end` + 行内扫光） | 取 **最近一个首行以换行结束的段落的行首**（`latestCompletedParagraphFirstLine`，未完成单行无预览） | `ReasoningRow.tsx` | **移植**（README 已按上游措辞，代码未跟上） |
| 空白推理块 | `text.trim()===''` 仍渲染 Think 行 | 不产生行（`break`） | `AssistantMarkdown.tsx` reasoning 分支 | **移植**（README 已声明） |
| 工具调用细节 | 实时类别+标准模式追加 detail；准备态追加准备文案；分类表/160 字符截断与上游相同 | 同（`process-activity.ts` 两树仅 import 差异） | `process-activity.ts` | 一致 |
| 时长/状态行 | 麒麟印章 `RunningSeal` + 「QiLin 正在深度思考」 | 鲸尾动画（`RunningWhaleTail`）+ 会话级指示 | `RunningStatus.tsx` | **保留**（品牌红线） |
| 整轮折叠资格 | 未结束/停止/失败/插入输入 → 不折叠；已结束 → 折叠 | 同（`ChatGroupSeat` `alwaysOpen`/`outerHidden`、`stores.ts` `turnProcessOpen` 相同） | `ChatGroupSeat.tsx`、`stores.ts`、`contract/turn-process.ts` | 一致 |
| 内部开合在整轮收起时重置 | 组头用 `useDisclosure()` 绑定 `disclosureReset`；**推理行用本地 `useState`，不重置** | 推理行取注入的 `useDisclosure`（随整轮隐藏 +1 版本重置） | `ReasoningRow.tsx`+`AssistantNodeView.tsx`+`AssistantMarkdown.tsx`（注入 `disclosure` 钩子在 QiLin 已接线但无人消费） | **移植**（README「收起整轮会重置……推理、工具的开合」） |
| 已停止标记次数 | 每个 seat 都输出「已停止」 | 仅整节点/response seat，或该 step 无其他可见块时输出 | `AssistantMarkdown.tsx` `interrupted` 判定 | **移植**（历史组内重复「已停止」） |
| 消息触发折叠的动画 | 设了 `data-input-fold` 属性，但 CSS 里缺少对应"关闭 margin 过渡"规则 | `.column[data-input-fold] > … {transition:none}` | `ChatView.module.css` | **移植**（折叠应一次到位、无二次滚动） |
| 滚动/锚定 | fork 自研：`consumeResize`/`consumeReaderIntent`/`restoreReaderRow`、`use-chat-scroll` 同上游 | 上游无这三个方法，另有会话级鲸尾 | `use-chat-viewport.ts`、`use-chat-scroll.ts` | **保留**（QiLin 的滚动修复；本任务不动） |

### detailed（运行中平铺、历史才出组头）

| 项 | QiLin 现状 | 上游 rc.2 | 文件/符号 | 决策 |
|---|---|---|---|---|
| 运行中组头 | 隐藏（`grouped=false`，Turn 未 closed） | 同 | `ChatGroupSeat.tsx` | 一致 |
| 运行中组正文 | 平铺、无限高、行距 16px（`.expandedBody`） | 平铺、无限高、**行距 6px** | `ChatGroupSeat.module.css` | **移植**（同上） |
| 历史轮次 | 出组头 + 手动开合、限高 | 同 | `ChatGroupSeat.tsx` `grouped` | 一致 |
| 推理预览/停止标记/折叠动画 | 同 compact 行 | 同上 | 同上 | **移植** |
| 运行中平铺行的成员缩进 | fork：`data-chat-depth` 1/2 级 + 24px 缩进（Turn→Step→调用） | 无缩进 | `ChatGroupSeat.module.css`+`ChatNodeSeat.tsx` | **保留**（fork 的 Turn→Step 嵌套设计，见 `plans/2026-10-15-chat-process-single-group-nesting.md`） |

### verbose（全平铺、不折叠）

| 项 | QiLin 现状 | 上游 rc.2 | 文件/符号 | 决策 |
|---|---|---|---|---|
| 组头 | 始终隐藏 | 同 | `ChatGroupSeat.tsx` | 一致 |
| 组正文 | 平铺、无限高、行距 16px | 平铺、无限高、行距 6px | `ChatGroupSeat.module.css` | **移植** |
| 整轮折叠 | 不折叠（`foldCompletedTurns:false`），时长/状态头无收起动作 | 同 | `ChatGroupSeat.tsx` `outerHidden`、`TurnProcessNodeView.tsx` | 一致 |
| 内部推理/工具开合 | 初始收起（verbose 不自动展开） | 同 | `ReasoningRow.tsx`、`tool.ts` | 一致 |
| 推理预览/停止标记 | 首行预览（策略 true）；停止标记重复 | 同 | 同上 | **移植** |

> 行距证据：rc.2 的 `ChatGroupSeat.module.css` 中 `.expandedBody` 只覆盖 `max-height/overflow/scrollbar-gutter`，不含 `--dsh-chat-flow-gap`；其 README 亦写明"Process rows retain 6px spacing in both modes; Assistant responses have 12px clearance ... Turn process controls retain 16px clearance"。QiLin 的 `097f6694b3`「restore the upstream transcript rhythm」把"expanded 16px"记为上游值，与 rc.2 tag 不符（很可能取自 `deepseek-harness` checkout 的工作树，该树带品牌叠加提交）。本任务以 tag 为准改回 6px，并同步 CSS 断言 spec。

### 与四档相关的设置语义（不在渲染表内，记录以免误读）

| 项 | QiLin 现状 | 上游 rc.2 | 决策 |
|---|---|---|---|
| 默认模式 | Host schema `.default('detailed')` + 客户端 `DEFAULT_TRANSCRIPT_VIEW_MODE='detailed'`；README 却写 `standard`（文档过时） | 无 schema 默认；Desktop=`standard`，非 Desktop Web=`detailed` | **保留 QiLin 单一 detailed 默认**（属设置域而非四档渲染；改默认会改全部用户的初始档位与 Host 表单写入语义），**修正 README/注释** |
| 旧值 `normal`/`expanded` | 都读作 `detailed`（`transcript-view.ts`；spec 已断言） | 同 | 代码一致；**修正 README/JSDoc 里"normal→standard"的过时措辞** |
| 收起时机（`collapseTiming`）的 exchange 语义 | 以"最新已加载 Turn"界定"最新轮次"保留运行态 | 以 exchange（首个由人类 Step 1 开启的 Turn 到下一个此类 Turn）界定 | **保留**：属独立的"收起时机"设置，仅在 `next-input` 档生效；移植需引入上游 `contract/group-tree.ts` 与 `group-tree-segments.ts` 整套位置模型，超出四档渲染范围（详见 §3） |

## 2. 已知行数差的归类（确认哪些与展示模式无关）

| 文件 | QiLin/上游行数 | 差异性质 | 是否本任务 |
|---|---|---|---|
| `process-groups.ts` | 413/303 | QiLin 重写为"每 Turn 一组 + `ProcessRange` 范围裁剪 + question-reply 去重"，替代上游的 group-tree 位置判定；同档可见分组结果一致（分隔点集合相同） | **否**（fork 有意重写；保留） |
| `common.ts` | 69/83 | 上游 `chatNode` 增 `groupTree` 入参、`locationCoordinates` 移到 `common` | **否**（group-tree 模型缺失的连带差异；QiLin 在 snapshot-builder 内自带同名函数） |
| `message.ts` | 143/154 | 上游给人类输入打 `groupTree:'exchange'/'input'`；QiLin 无该模型 | **否**（同属 exchange 语义，见上表） |
| `assistant.ts` | 378/373 | QiLin 增 `hidden` 状态（清空流式内容后保留隐藏节点） | **否** |
| `turn-process.ts` | 332/324 | QiLin 有意两处分叉：不合成无过程证据的控件（上游 `?? turn.start?.seq`）、`processStartSeq` 取 Turn start（停止/失败轮次的注入随过程折叠） | **否**（代码注释已记录；移植需 group-tree 模型） |
| `chat-snapshot-builder.ts` | 1188/1244 | 上游 `TurnKindNodes` 增量子系统 + `GroupTreeSegments('exchange')` 的底部判定；QiLin 用委托快照 + `setBottomTurn`（带 `TODO(B5-part-2)`） | **否**（性能子系统 + exchange；与四档可见渲染无关） |
| `group-tree-segments.ts` | 缺失/新文件 | 上游 exchange 分段工具 | **否**（仅被上面两处消费） |
| `turn-tail.ts` | 222/164 | QiLin 自研 `closingAnchor`（按 step 证据定最终答案锚点，处理中断/重试） | **否**（fork 修复） |

## 3. 实施批次

### B1 推理预览与行（ReasoningRow / AssistantMarkdown）
- `chat/ReasoningRow.tsx`：恢复上游算法与结构 —— `latestCompletedParagraphFirstLine`（流式）/ `firstLine`（结算）、`memo`、注入 `useDisclosure`（随整轮隐藏重置）、`DisclosureRow running` 与 `TextShimmer` 摘要、`data-streaming` 右缘渐隐；删除 fork 的 `latestLine`/`data-follow-end`/行内扫光。
- `chat/AssistantMarkdown.tsx`：跳过 `text.trim()===''` 的推理块；`interrupted` 标记改上游条件；`useDisclosure` 透传。
- `chat/AssistantNodeView.tsx`：把节点注入的 `useDisclosure` 传给 `AssistantMarkdown`。
- `chat/ReasoningRow.module.css`：按上游样式（`data-streaming` 渐隐），保留 QiLin token 前缀与 sticky 规则（QiLin `DisclosureRow` 用 `data-disclosure-row`）。

### B2 组渲染（ChatGroupSeat）
- `chat/ChatGroupSeat.tsx`：运行中组头用 `TextShimmer`（`active={!closed}`）。
- `chat/ChatGroupSeat.module.css`：删除 `.expandedBody` 的 16px 行距覆盖。

### B3 折叠动画
- `chat/ChatView.module.css`：补齐 `.column[data-input-fold]` 的 `transition:none` 规则（`use-chat-viewport.ts` 已在写该属性）。

### B4 文档与门
- `conversation-nodes/README.md` + `README.zh.md`：修正"默认 standard / normal→standard"为实际契约（默认 detailed、旧值均读 detailed）；行距 8px→6px、删除详细/完全展开的 16px 行距；补"只有非空白推理块产生行"。
- 重跑 `pnpm run verify-translation-pairing --write <README 两侧文件>` 刷新配对哈希。

## 4. 验证矩阵

1. `pnpm exec vitest run packages/client/ui-chat`（新/改 spec：流式预览算法、空白推理块、停止标记 seat、整轮重置推理开合、组头 shimmer、展开组行距、input-fold 规则）。
2. `pnpm exec tsc -p packages/client/ui-chat/tsconfig.json --noEmit`。
3. `pnpm run test:gui`。
4. `QILIN_SNAPSHOT=replay` 跑基线绿的 chat 相关 Web 场景；`apps/web/tests/{client-plugin-live,voice-download,sidebar-right,plugin-manager,settings-chrome,seeded-history,rail-search-expand,workflow-run,queue-actions}.e2e.ts` 为 HEAD 已知红，不作为绿色门、也不修。
5. `snapshots/web/**` 只有在 diff 恰为本次展示模式变化时才刷新，并在报告里逐条说明。

## 5. 实施结果（2026-10-20）

| 门 | 结果 |
|---|---|
| `pnpm exec vitest run packages/client/ui-chat` | **绿**：57 文件 / 774 测试（基线 763，+11 新增/更新）。 |
| `pnpm exec tsc -p packages/client/ui-chat/tsconfig.json --noEmit` | **绿**（exit 0）。 |
| `pnpm run verify-translation-pairing` | **绿**：README EN/zh 配对哈希已用 `--write` 重录。 |
| `pnpm run test:gui` | **红**：649 文件中 28 个失败、64 个测试失败，**全部不在 `ui-chat`**；主因是并发负载下的 5s/60s 超时（其他 agent 同时在跑构建与门禁），以及 `ui-settings-general` 分节台账多出 `agent-presets`（其他 agent 在改 `ui-agent-preset`）。本任务不改这些包。 |
| `QILIN_SNAPSHOT=replay` `tool-details` | **绿**。 |
| `QILIN_SNAPSHOT=replay` `collapse-timing` | 红，唯一 diff 是缺少 `button "System prompt"` 行；用 `git stash`(仅 ui-chat) + 重打包 bundle 在 HEAD 基线复跑得到**同一 diff**，故与本次展示模式改动无关（其他 agent 正在重写 `apps/web/tests/scaffold.ts` 的组合层）。 |
| `QILIN_SNAPSHOT=replay` `changed-files-turn` / `present-svg` | 红，diff 同样是缺少 `系统提示词`/`上下文注入` 行与代码文件链接按钮，另 present-svg 的会话日志比对有组合层漂移；无任何组头/推理/折叠/行距差异。 |
| `QILIN_SNAPSHOT=replay` `steering` | 红，失败在 `llm-replay: fixture not fully consumed`（驱动到的模型调用次数少于录制）——展示模式改动不改变模型调用，属同一组合层漂移。 |

未刷新任何 `snapshots/web/**` / `apps/web/tests/expected/**`。
