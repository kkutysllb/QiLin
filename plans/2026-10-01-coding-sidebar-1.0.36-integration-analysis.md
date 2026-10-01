---
description: "dsh-coding-sidebar 1.0.36 回归 QiLin 内置的分析报告：历史决策、功能增量、通道选择、兼容性风险矩阵与工作分解。只分析，未动代码。"
kind: "plan"
---

# coding-sidebar 1.0.36 回归内置 — 分析报告

- 日期：2026-10-01
- 插件仓：`/Users/libing/kk_Projects/dsh-coding-sidebar`（`dsh-coding-sidebar@1.0.36`，npm 已发布该名；`@qilin/coding-sidebar` npm 404）
- QiLin 现状：3.0.7（上游 0.2.0-rc.2 对齐完成），原生右侧栏体系在位

## 1. 历史与决策脉络

| 时点 | 事件 |
|---|---|
| 09-15 上游决策 | 以 vendor 通道内置 `@qilin/coding-sidebar@1.0.14`，禁用五行原生右侧栏（ui-sidebar-right/-documentpreview/-files/-tasks/-plans） |
| 09-15 上游决策 | 同日退役：上游 0.1.6-alpha.1 原生侧栏补齐（文件树/预览/终端），替换通道不再必要；「功能缺口留给插件通道升级」 |
| 09-27  | 动效插件走新「内置随附层通道」（npm 依赖 + PROFILE_TEMPLATES 行 + profileLayerUpdatable + 收敛迁移），旧 vendor 通道 note 归档 |
| 09-24→10-01 | 插件独立演进 1.0.15→1.0.36（91 提交），持续适配 DSH 0.1.6/0.1.7 契约 |
| 10-01 | 用户指令：按 1.0.36 功能实现完善右侧栏，发 3.0.8 |

## 2. 1.0.14 → 1.0.36 功能增量（用户价值面）

- **Office/视频预览**（1.0.15/1.0.17）：docx·xlsx·pptx + 16 种视频格式 Range 流式；6 个 Office/视频依赖钉精确版本自持
- **智能体团队 tab**（1.0.25）：名册 + 任务看板做进侧栏
- **浏览器 tab 对齐原生**（1.0.23/1.0.27）：多 Tab、沙箱 iframe、完整导航历史随 Tab 持久化、dev server 同权
- **轨迹图四段强化**（1.0.27）：附件统一展示、检查器细化（Markdown/灯箱/参数结果结构化）、搜索定位+边类高亮、最慢工具与 token 分桶统计
- **任务管理图**（1.0.35-1.0.36）：树形/紧凑/网格三种排布、节点级拖动手动摆放、图例窄栏修复、节点配色修复
- **sidechat 自适应轮询**（1.0.27）、懒 chunk 加载重试（1.0.27）
- **契约适配链**（1.0.16-1.0.30）：0.1.6 图标删除自持化、turnTail chain→list、file-review 让位规则、0.1.7 settings 命名空间迁移/图标批/V4 source kind/jobs caller
- **样式门禁**（1.0.31+）：1.0.14 起丢失的闭合括号修复、选择条重做、样式静默失效门禁

## 3. 集成通道选择

| 通道 | 评估 |
|---|---|
| **A. vendor 复活（推荐）** | `scripts/sync-to-qilin.mjs` 纯机械同步（说明符/身份重写+manifest+patch 生成）仍在维护；09-15 集成有完整验证先例；无需 npm 发布 `@qilin/*`；升级纪律=上游改→跑同步→QiLin 提交 |
| B. npm 发布 @qilin 通道 | 依赖 npm 发布能力（历史约束：QiLin 从未发布 @qilin/*）；qilin 味道与 DSH 味道分叉需双发布管 |
| C. animations 随附层模式 | 该模式适合**无 qilin 味道分叉**的插件（dsh-animations 原名原味直接 npm 依赖）；coding-sidebar 有说明符/身份重写分叉，需先产 qilin 味道——仍要 vendor 变换，通道增益为零 |

**推荐 A，并借用随附层已建好的两件基础设施**：PROFILE_TEMPLATES 行 + 收敛迁移（存量 profile 自动补层）、plugin-manager 的 updatable 随附层卡片。即 vendor 供包、随附层机制供挂载与升级 UI。

## 4. 兼容性风险矩阵

### 已核实 ✓（对当前 QiLin @ rc.2）

| 项 | 结论 |
|---|---|
| `conversation.chat.turnTail` 槽 | kind:'list'/session ✓（插件 1.0.18 已按 list 适配） |
| `settings.section` 槽 + 胜出投影 | list/root ✓；ui-settings-general shell-contract 的 winner 投影机制**存活**（集成期产物已被上游对齐吸收为通用机制） |
| `uiWorkspace` 服务 | ✓ 存在 |
| `remote.session.openWorkspacePath` | ✓ 存在（api/session-controller） |
| DOM 锚点 `[data-slot="conversation"]` | ✓ ui-renderer 通用产出（scoped-slots 每槽 `<div data-slot=key>`） |
| 被禁用五行原生包 | ✓ 全部在位（即本次 rc.2 对齐移植的 sidebar-right/files/plans/tasks/documentpreview——插件挂载后成为备用面，包与测试保留） |
| node-pty | 同步脚本自动追加 QiLin 补丁版 1.2.0-beta.15 兼容范围；profile 模板需 allowBuilds |
| ws | 1.0.26 起转 peer ✓ |

### 风险（按序）

**R1 模块加载契约（最高，需 Spike）**：qilin 通道 tsdown 的 `window.__ModuleLoader__.load({id,factory})` banner 是 1.0.14 时代旧加载器契约；当前 QiLin 已对齐到 boot-manifest + EntryTree.import（kylin-plugin-loader）体系，全局 `__ModuleLoader__` 在树中已不存在。**但**插件 DSH 味道 1.0.36 一直在 0.1.6/0.1.7 profile 上安装运行（README 安装章），其 DSH 通道构建产物即是 manifest 体系兼容形态——对齐后 QiLin 加载器与上游同源，**两味道实际收敛**。Spike：用 DSH 通道构建形态 + 仅说明符重写，在 QiLin web 里验证插件客户端能否经 boot manifest 挂载。qilin 通道 tsdown 大概率要简化（去 banner，回归标准 entry 形态）。

**R2 图标面**：插件客户端引用 11 个上游 Regular 名图标（IconRightUpOutlineRegular/IconRefreshOutlineRegular/ListPenOutlineRegular/FolderOpenRegular 等），QiLin primitives 保留编号命名集、无这些 Regular 名。三策：① 把上游对应 SVG **补进 QiLin ui-primitives**（增量、零风险、利好后续移植——推荐）；② 同步脚本加图标符号级重写表（Regular→QiLin 编号名等价物）；③ 插件 qilin 通道自持。Office/PDF/视频等 19+ 个已在插件 `icons.tsx`/`file-icons.tsx` 自持 ✓。

**R3 契约漂移（插件止步 0.1.7-alpha.1 vs QiLin @ rc.2）**：1.0.30 后上游又出了 0.2.0-rc.1/rc.2 两版。插件消费面（槽位/服务/remote）经本轮核实均存活，但运行时细节漂移（如 ChatView 结构、locale 键名、jobs caller 形状）需在冒烟与浏览器验证中暴露修补。预计小修 0-3 处。

**R4 依赖与合规面**：Office/视频 6 依赖钉版本入 vendor manifest + THIRD_PARTY_NOTICES 增量（旧集成 +13 行先例）；react-icons ESM 别名钉扎；`dsh-compat` 别名表仍在（退役提交保留），DSH 通道用户插件路径不受影响。

**R5 profile 接线**：app-boot profile.ts 已演进（`qilin.profile.bundles` + PROFILE_TEMPLATES + 收敛迁移 + profileLayerUpdatable）。接入方式：web/qilin 两级模板 `bundles` 数组加 `@qilin/coding-sidebar` 行；收敛迁移自动为存量 profile 补层；allowBuilds: node-pty。plugin-manager 已通用化，随附层卡片大概率直接可用（验证 updatable 判定对 workspace 依赖的适用性）。

## 5. 工作分解（建议批次）

### C1 插件仓改造（dsh-coding-sidebar）
- qilin 通道 tsdown 现代化：去旧 banner、对齐 DSH 构建形态（仅保留说明符/身份重写差异）——依 Spike 结论
- `cordis.qilin.patch.yml` 复核：禁用五行 + 自挂行（行 id 均未变 ✓）
- sync 脚本跑通 1.0.36 → QiLin vendor

### C2 QiLin 接线
- `vendor/coding-sidebar` + vendor/README manifest 行 + 本地修改清单条目
- tsconfig.base/host 路径 + 构建接线；web-app 依赖（安装闭包解析）
- ui-primitives 补 11 个 Regular 图标（R2 策①）
- app-boot PROFILE_TEMPLATES 两级加行 + allowBuilds + profile.spec 用例
- THIRD_PARTY_NOTICES 重生成；apps/cli 安装闭包
- docs：architecture 双语、web-app README 双语；Agent Note（通道决策修订）

### C3 验证
- 插件仓 smoke-plugin.mjs + 契约门禁
- QiLin：build/typecheck/相关套件（app-boot/plugin-manager/ui-primitives）
- 浏览器手验：五行原生侧栏被遮蔽、工作台各 tab（文件/编辑器/预览/终端/Git/浏览器/轨迹/任务/团队/sidechat）、设置页接管、存量 profile 收敛补层
- `pnpm run gen-client-catalog` 等生成物重跑（插件贡献槽位入目录）

### C4 发布 3.0.8
- version:set 3.0.8 → clean rebuild → 快照对照 → build:official 品牌自查 → tag/release/push（3.0.7 同链）

## 6. 工作量评估

- 同步与接线：机械、有先例，半天量级
- Spike（R1）+ 图标补齐（R2）：各 1-2 小时
- 契约小修（R3）：视冒烟结果 0-3 处
- 验证与发布：半天
- **合计约 1-1.5 个工作日**；最大不确定度在 R1 Spike 与 R3 冒烟

## 7. 待用户确认项

1. 通道拍板：vendor 复活 + 随附层挂载（推荐）是否可接受
2. R2 图标策略：补进 QiLin primitives（推荐，利好后续）还是插件自持
3. 五行原生侧栏包保留为备用面（不删除）——默认保留
