---
description: "2026-10-18 两项产品修复：恢复标准预设为普通模式（编码模式保留并含创造能力），以及 agent 任务消息渲染（执行/停止/完成折叠手动展开）与上游对齐。"
kind: "plan"
---

# 预设拆分与任务渲染对齐

- 日期：2026-10-18 · 基线：分支 `upgrade/upstream-0.2.1-rc.1`（rc.2 对齐已收尾，工作树干净）。
- 上游取材源：本地 fork tag `dsh-v0.2.1-rc.2`（渲染对齐的参照实现）。

## 1. 预设恢复（普通模式 / 编码模式）

### 现状
- 出厂预设已收敛为单一 `presets/ptc`（合并提交「出厂预设收敛为单一 ptc，并入运行时创作能力」）：删除 `presets/standard` 与 `presets/cordis`，ptc 的 preset.yml 去掉显示名，部署默认（web-app patch `default: ptc`）与 e2e 脚手架钉到 ptc。
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
上游 rc.1/rc.2 的 resolver 在拒绝之外还有 `MovedDirectories`（旧目录→新目录的 spelling 重定向）与 `ResolutionRouter.linkedTargets`（link 目标 move 采纳），令重链/换目录安装被原地采纳、无需重启。QiLin 的 resolver 无这两块（HMR 文件替换特性移植时缺失），因此 DSH 不重启而 QiLin 要求重启。

### 修复
移植 MovedDirectories + linkedTargets + ESM/CJS 路由重定向（仅迁移采纳相关），保持 QiLin 既有拒绝规则（替换自带包/本地覆盖仍需重启，上游同款）；核实新装 bundle 是否可能命中 `localPackageNames` 覆盖判定（若与上游有偏差则修到上游语义）；补 moved-directory 回归测试并跑 boot/hmr/plugin-manager 相关 spec。

## 4. 追加：会话正文拖宽手柄失效

### 现象与根因
消息面左右两侧的宽度手柄（`ConversationRoot` 的 `.widthHandle[data-side=left|right]`）不可见、不可拖。实测 DOM 中手柄存在但计算宽度为 0，因为 `--qilin-chat-user-width` / `--qilin-chat-content-width` 被写成 `NaNpx`。

根因是设置投影移植（"project composed entries' static Config" 那笔）的回归：宽度偏好改由配置表单投影提供，但 `ui-conversation` 的静态 `Config` 只声明了 `busyEnter`，投影后的 section 不含 `contentWidth` → `ConversationLayoutPolicy` 读到 `undefined` 并写入 store → `resolveContentWidth` 的 clamp 产出 `NaN` → CSS `min(10px, calc((100% - NaNpx)/2 - 48px))` 归零。

### 修复
1. `ui-conversation/src/index.ts`：`contentWidth` 作为 `Volatile<number>` 纳入静态 `Config`（默认 0 = 自适应），投影的后端表单恢复服务该字段。
2. `layout-policy.ts`：adopt 时对非 number 值直接返回，不把 `undefined` 灌进 store。
3. `ConversationWidthControls.tsx`：`resolveContentWidth` 对非有限值回落到自适应；`publishWidths` 对非有限值不写 `--qilin-chat-user-width`。
4. 测试：host 配置表单覆盖 `contentWidth`（默认 0、负值拒绝）、策略层「投影缺字段保持自适应」、组件层「非有限偏好不写 NaNpx」；实测桌面端 DOM 手柄宽 10px、内容轴 798px。

## 5. 追加：插件原子更新（升级免重启）

### 现象与根因
对**已安装**的第三方 bundle 再点安装会被拒（`ManagementFailure('already-installed')`，文案「该插件已安装。如需升级，请卸载后重新安装」）；而升级/覆盖安装若改变了包解析目录，resolver 抛 `ResolutionRestartRequired` → 「请重启 QiLin」toast。实测：全新第三方 bundle 首装（dsh-plugin-whale-pet）与 bundle 启停都实时生效、无需重启；风险路径集中在**升级/覆盖安装**。

### 修复（已完成，`edb41f5f96`）
1. plugin-manager：对已安装同名包不再拒绝，改为一次组合发布的原子更新（pnpm add 升/降版本 → 保持 bundle 选中 → 一次 recompose/publish）；同版本重装返回「已是最新」；失败回滚语义不变。
2. app-boot resolver：profile 作用域映射的目录变化改为 `MovedDirectories` 采纳 + 旧路径重定向，不再一律拒绝；**保留** installation 作用域变化、本地覆盖自带包、profile 范围变化的拒绝。
3. 客户端文案：`installProblemInstalled` / `installUpgradeNotice` / `reasonAlreadyInstalled` 改为「可直接重新安装升级」；`restartReasonPackageMoved` 仅保留真正的覆盖自带包场景。
4. 测试：plugin-manager 真实组合「装 v1 → 装 v2 → 一次 recompose 生效、无 restartReason」；resolver「目录变化采纳 + 重定向」「覆盖自带包仍拒绝」；文案断言。

## 6. 验证

- 2026-10-18：五条流全部完成并入主干——预设（4 笔：standard 恢复/默认切换/e2e/headless 文档）、渲染（1 笔：三态对齐）、移动采纳（1 笔：MovedDirectories/linkedTargets）、拖宽手柄（1 笔：contentWidth 投影 + 三处防御 + 3 份 spec）、**插件原子更新（1 笔：in-place 升级 + resolver 目录采纳 + 文案/测试）**。
- 2026-10-18 原子更新验证：plugin-manager 347 例、app-boot+hmr 942 例（1 skip）、client 273 例全绿；定向覆盖率 100/100/100/100；双 boot 包与 client face tsc 0；catalog/i18n/md-links/pairing 门绿；真实 pnpm 11.7.0 双 tarball 演示确认「链接路径不变、realDir 变 → 采纳并重定向」。保留拒绝：覆盖 QiLin 自带包（pnpm 前拒绝）、本地组合包覆盖、installation 映射变化、profile 范围变化。同版本重装走 `upToDate` 结果（不选入/不重载/不重启）；界面在检查阶段仍显示「已安装/立即启用」面板（既有 UX，非重启提示）。
- 集成：目录全量再生（module-graph 双语 + 2 写）、全量 build exit 0、test:docs 21/21、type-equiv 472、md-links 2285、pairing 1155、repository-references、subsystem-pages 54 组、constraints、families 65 例全绿；工作树干净。
- 实机核验（桌面端）：新会话预设芯片显示「普通模式」（默认生效）；会话正文两侧宽度手柄 10px 可拖（`--qilin-chat-user-width` 不再出现 NaNpx）。
- 已知预存红（流报告，非本批引入）：web-agent-presets e2e 2 例 profile reload、7 条 replay 车道金样漂移、rescope-vendor 4 篇未改动文档、export-jsdoc 13 等，均按既有基线口径留档。
- 预设：agent-presets spec、e2e 脚手架/shipped-composition、目录生成器三绿、`verify-translation-pairing`/md-links。
- 渲染：ui-chat spec、client face tsc、Web e2e（能跑则该三态的断言）、docs 门。
