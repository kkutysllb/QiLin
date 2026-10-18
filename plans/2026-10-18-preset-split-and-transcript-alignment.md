---
description: "2026-10-18 两项产品修复：恢复标准预设为普通模式（编码模式保留并含创造能力），以及 agent 任务消息渲染（执行/停止/完成折叠手动展开）与上游对齐。"
kind: "plan"
---

# 预设拆分与任务渲染对齐

- 日期：2026-10-18 · 基线：分支 `upgrade/upstream-0.2.1-rc.1`（rc.2 对齐已收尾，工作树干净）。
- 上游取材源：本地 fork tag `dsh-v0.2.1-rc.2`（渲染对齐的参照实现）。

## 1. 预设恢复（普通模式 / 编码模式）

### 现状
- 出厂预设已收敛为单一 `presets/ptc`（合并提交：`ddabbd99a4`「出厂预设收敛为单一 ptc，并入运行时创作能力」）：删除 `presets/standard` 与 `presets/cordis`，ptc 的 preset.yml 去掉显示名，部署默认（web-app patch `default: ptc`）与 e2e 脚手架钉到 ptc。
- 合并前的 standard：`name: 标准模式`、`order: 1`，agent.cordis.yml 为「功能完整的编码 Agent」（标准工具面，非 PTC 呈现）。

### 目标
1. 恢复 `presets/standard`（内容以合并前 standard 为基，适配当前树——已删除的包/行必须剔除），显示名改为 **普通模式**。
2. `presets/ptc` 显示名改为 **编码模式**；创造能力继续留在 ptc（不单独恢复创造预设）。
3. 新会话默认预设改为 **普通模式**（web-app patch 与 e2e 脚手架同步；已退役 id 的 localStorage 重水化边界保持 cordis 仍归位到当前默认）。
4. 文档/目录/生成物同步（presets 引用、插件包清单、kylin 目录、e2e 期望）。

### 决策
- 默认 = 普通模式（恢复标准即恢复默认；编码模式作为可选）。如产品侧要保留编码为默认，改动点仅在 web-app patch 的 `default` 与对应期望。
- 创造模式不单列（按用户要求与 ptc 合并）。

## 2. Agent 任务消息渲染对齐（ui-chat）

### 现状差异（与上游 rc.2 对照，已抽查）
- `TurnProcessNodeView.tsx`：QiLin 只把 `aborted` 视为停止；上游把 `aborted || interrupted` 都视为停止（标签「已停止」、去掉 duration、announcement 同步）。
- `turn-process-presentation.ts`：QiLin 用显式 kind 判断（user/steering/turn-trigger），上游用 `isAtOrOutside(node,'input'/'turn')` 结构判定。
- CSS：悬停色/间距等有分叉；`TurnTailNodeView.module.css` 无差异。
- 品牌保留项：QiLin 的运行指示 `RunningSeal`（麒麟印章）与「QiLin…」运行文案，**不作为对齐项**（品牌红线）；如需照搬上游鲸尾另议。

### 范围
执行中（running）、停止（aborted/interrupted）、完成折叠后的手动展开三态，覆盖：TurnProcessNodeView、TurnTailNodeView、TurnTriggerNodeView、turn-process.ts/turn-process-presentation.ts、process-activity/process-groups、MessageItem 相关状态、locale 文案与 CSS 模块。
### 边界
- 保留：QiLin 品牌资产（RunningSeal、运行文案）、locale 字典机制、已确立的 fork 适配（如 controlAnchorSeq 修复，需先核上游是否同款）。
- 要求：逐文件 diff 清单 + 每处对齐附原因；新增/改写 spec 覆盖三态；报告保留差异。

## 3. 追加：插件移动采纳（no-restart relink/换目录安装）

### 问题
插件页安装后提示「请重启 QiLin 使更改生效」（`package-moved`）。链路：`installBundle` → HMR `reconcileProfile` → app-boot `publish(packages)` → `ResolutionRouter.replace()` 对保留映射「目录变了就拒绝」→ `ResolutionRestartRequired`。

### 与上游差异（已核实）
上游 rc.1/rc.2 的 resolver 在拒绝之外还有 `MovedDirectories`（旧目录→新目录的 spelling 重定向）与 `ResolutionRouter.linkedTargets`（link 目标 move 采纳），令重链/换目录安装被原地采纳、无需重启。QiLin 的 resolver 无这两块（`fb17313f68` 移植时缺失），因此 DSH 不重启而 QiLin 要求重启。

### 修复
移植 MovedDirectories + linkedTargets + ESM/CJS 路由重定向（仅迁移采纳相关），保持 QiLin 既有拒绝规则（替换自带包/本地覆盖仍需重启，上游同款）；核实新装 bundle 是否可能命中 `localPackageNames` 覆盖判定（若与上游有偏差则修到上游语义）；补 moved-directory 回归测试并跑 boot/hmr/plugin-manager 相关 spec。

## 4. 追加：会话正文拖宽手柄失效

### 现象与根因
消息面左右两侧的宽度手柄（`ConversationRoot` 的 `.widthHandle[data-side=left|right]`）不可见、不可拖。实测 DOM 中手柄存在但计算宽度为 0，因为 `--qilin-chat-user-width` / `--qilin-chat-content-width` 被写成 `NaNpx`。

根因是设置投影移植（`4fe2c84942`）的回归：宽度偏好改由配置表单投影提供，但 `ui-conversation` 的静态 `Config` 只声明了 `busyEnter`，投影后的 section 不含 `contentWidth` → `ConversationLayoutPolicy` 读到 `undefined` 并写入 store → `resolveContentWidth` 的 clamp 产出 `NaN` → CSS `min(10px, calc((100% - NaNpx)/2 - 48px))` 归零。

### 修复
1. `ui-conversation/src/index.ts`：`contentWidth` 作为 `Volatile<number>` 纳入静态 `Config`（默认 0 = 自适应），投影的后端表单恢复服务该字段。
2. `layout-policy.ts`：adopt 时对非 number 值直接返回，不把 `undefined` 灌进 store。
3. `ConversationWidthControls.tsx`：`resolveContentWidth` 对非有限值回落到自适应；`publishWidths` 对非有限值不写 `--qilin-chat-user-width`。
4. 测试：host 配置表单覆盖 `contentWidth`（默认 0、负值拒绝）、策略层「投影缺字段保持自适应」、组件层「非有限偏好不写 NaNpx」；实测桌面端 DOM 手柄宽 10px、内容轴 798px。

## 5. 验证
- 预设：agent-presets spec、e2e 脚手架/shipped-composition、目录生成器三绿、`verify-translation-pairing`/md-links。
- 渲染：ui-chat spec、client face tsc、Web e2e（能跑则该三态的断言）、docs 门。
