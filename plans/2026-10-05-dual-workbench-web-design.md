---
description: "双工作台（通用/编码）Web 端完整设计与实施计划：预设面改造、ui-workbench 状态属主、coding-sidebar 迁入内置（单一外壳双内容体）、右栏门控、插件 audience、3.1.0 独立版本线。全部决策已拍板，未动代码。"
kind: "plan"
---

# 双工作台（通用/编码）Web 端完整设计与实施计划

- 日期：2026-10-05（同日两轮修订：决策收敛 + 侧栏单壳口径）
- 范围：仅 Web 端（引擎侧暂只做 web；其他桌面端产品是引擎的分支线修改，壳仍是独立项目，`data-window-drag`/`qilinDesktop` 边界保留）
- 前置讨论：2026-10-04/05 会话（四预设分析 → 标签组模型 → 通道与设置页 → 迁入内置 → 决策收敛）
- 配套文档：[独立版本线基线](./2026-10-05-independent-version-line-baseline.md)（3.1.0 起 / 上游=参考源 / 借鉴流程）

## 0. 已拍板决策汇总（全部收敛，无待拍板项）

| # | 决策 | 状态 |
|---|---|---|
| D1 | 四预设 → 三预设：standard 保留；ptc **只改显示名「编码模式」**（id/目录不动，存量 ptc 会话零破坏）；minimal 删除（存量 minimal 会话 resume 报 not-found，用户接受）；cordis 保留 | ✅ |
| D2 | 标签组是**筛选器不是合体**：通用=[standard, cordis]，编码=[ptc, cordis]；映射为客户端静态常量 | ✅ |
| D3 | 新任务**显式带 agentPreset**（BFF `session/create` 已支持，session-controller commands.ts:189；SDK 通道无此字段，缺口已记录不阻塞 web 端）；空白会话换绑走 `select` remote（仅空白会话放行） | ✅ |
| D4 | 设置页 agent 预设菜单移除：patch 停用 `ui-agent-preset` 客户端行（四个 GUI 面一并消失）；引擎 `agent-presets` 行保留，`default: standard` | ✅ |
| D5 | 右栏：**迁入内置**。dsh-coding-sidebar 代码搬入本仓成为 `packages/client/ui-sidebar-coding/`，与原生 ui-sidebar-right **同一套图标和按钮（单一外壳），只是不同模式下展开呈现的内容不同** | ✅（10-05 二次修订：从"双右栏"改为"单壳双内容体"） |
| D6 | 插件安装时选 audience：通用 / 编码 / 两者；不同标签下各自呈现 | ✅ |
| D7 | 版本线：以当前 main（3.0.11）为基座，本轮落地后开 **3.1.0**；上游降为参考源——借鉴不 merge；自家插件套件（npm 包）**一起换线** | ✅ |
| D8 | 上游借鉴节奏由用户决定，不建机制 | ✅ |
| D9 | dsh-coding-sidebar 的 npm 线**冻结**：内置为准，npm 包不再演进 | ✅ |
| D10 | audience 语义：**客户端呈现过滤，引擎组合不拆**（插件组合是进程级 standing 事实；audience 只决定 UI 显隐，不在引擎侧拆组合或禁工具） | ✅ |
| D11 | coding-sidebar 的 settings 接管与导航图标：**内置后不需要，自动全部呈现**；与引擎原生实现重复的部分该删就删（S3 内出清单） | ✅ |
| D12 | 远期方向：**原生窗口标签**——coding 工作台的 tab 迁入引擎原生 `sidebar.right.pane.tab` keyed 槽，单壳单体系，白得浮动窗/dockkit 能力；保留为 3.1.x+ 演进项，不挡 3.1.0 | ✅ |

## 1. 机制核实结论（证据）

| 事实 | 证据 | 设计含义 |
|---|---|---|
| AppFrame 三栏全是槽位渲染 | ui-layout AppFrame.tsx:30 `PropsRenderSlots<'sidebar'\|'main'\|'rightbar'\|…>` | 右栏列「谁注册谁呈现」；列宽/拖拽/折叠由 ui-layout 拥有 |
| `rightbar` 槽唯一注册者是 ui-sidebar-right | ui-sidebar-right index.ts:205 | 双右栏不能各自注册 `rightbar`（槽所有权互斥）→ 单壳方案下切换在 ui-sidebar-right 内部完成 |
| 原生 tab 类型键是开放空间 | ui-sidebar-right contract/slots.ts:5-8、:59-64 keyed | D12 的路是通的（本轮不走） |
| coding-sidebar 是 body 级自挂载 + 私有注册表 | 其 index.tsx:12 createRoot、:211/:255 `document.body.appendChild`、`ctx.betterSidebar.registerTab/registerFileViewer` | 迁入必须改造：挂载服从工作台门控；registerTab 注册表向原生 rail 的映射 S3 首日钉定 |
| 会话头持久 `agentPreset` 字段 | preset-migration 快照断言 `agentPreset:'ptc'` | 会话列表按标签过滤可行（预设→标签反查） |
| 预设 id=目录名、roster 活读取 | preset/agent-presets discovery.ts:4/:305 | D1 文件层改动平凡；耦合在测试/快照/文案 |
| `agent-presets` 引擎 Config **无** modeSelectionEnabled 字段 | preset/agent-presets index.ts（Config 只有 default 等） | modeSelectionEnabled 是 settings 命名空间值：GUI 移除后无人能再翻转；历史用户若曾开启并设了非默认 default，其未点名新会话仍走该值（残留风险，见 §2.4） |
| BFF create 带 agentPreset，SDK 不带 | session-controller commands.ts:189/:205-206；sdk protocol types.ts:17-25 | web 端通道现成；SDK 缺口留给将来桌面壳线 |
| 插件安装持久化位置未钉 | manager-store 只有 UI 态（PackageRow/InstallState） | audience 字段落处 = S4 首日核实（候选：profile 层 spec / settings 命名空间） |

## 2. 架构

### 2.1 新包 `packages/client/ui-workbench`（工作台状态属主）

- **客户端服务 `workbench`**（capability seam：Service Definition = ui-workbench；Consumer = 右栏、会话列表、插件过滤）：`active: 'general' | 'coding'` + `switch()`；持久化位置 S2 首日定（settings 命名空间=跨设备 vs 本机存储）。
- 左栏：会话列表上方「通用 / 编码」分段控件（左栏会话列表现居 ui-chat ChatView / ui-workspace WorkspaceBrowser，宿主槽位实现 S2 首日核实）。
- 新任务按钮：以当前标签的默认预设显式建会话（D3：通用→standard、编码→ptc；标签内用户改选创造模式的，记住每标签选择）。
- 会话列表过滤：按会话头 `agentPreset` 反查所属标签；空白会话归属「创建它的标签」。
- 切换标签时屏上已有空白会话：调 `select` 换绑；非空白不切换（引擎正确语义，UI 忽略即可）。

### 2.2 右栏：单一外壳，双内容体（D5 最终口径）

**同一套图标和按钮**——右栏的开关、宽度、拖拽、tab rail 全部是原生 ui-sidebar-right/ui-layout 的既有 chrome，两个模式共用；切换工作台只换「展开后呈现的内容体」：

```
ui-layout（右栏列：宽度/拖拽/折叠/开关按钮 —— 全套原生 chrome，两模式不动）
└─ ui-sidebar-right（唯一 'rightbar' 注册者；rail 图标按钮语言统一）
   ├─ workbench.active = general → 现有 RightbarRoot 内容体（dockkit 面板，原样）
   └─ workbench.active = coding  → 编码内容体（子槽 'rightbar.session.coding'，single/session）
                                   └─ ui-sidebar-coding 注册面板内容（不自带 rail/chrome）
```

- **跨包规则合规**：ui-sidebar-right 不 import ui-sidebar-coding 的任何值——交接走槽位（父声明 + 授权，子注册）；两包各自 `inject: ['workbench']` 读同一服务。
- **ui-sidebar-coding 迁入改造清单**：
  1. 说明符/身份重写 `dsh-*`→`@qilin/client-*`，包骨架按「New plugin package checklist」三注册面（tsconfig aggregate / patch 行 / web-app 依赖）；
  2. 弃 body 级自挂载（createRoot+appendChild），改为注册 `rightbar.session.coding` 内容体；
  3. `ctx.betterSidebar.registerTab` 私有注册表 → 原生 rail tab 的映射方式 S3 首日钉定（候选：映射为 ui-sidebar-right 的 tab 类型键 = 编码态 rail 图标集；或内容体内部导航）；
  4. 拦截面全部加 workbench 守卫：turn-tail、open-path、link-intercept（通用态放行原生行为，编码态走自家）；
  5. settings 接管与设置页导航图标**删除**（D11：内置后自动呈现，原生面即唯一面）；与引擎原生能力重复的实现逐项盘点、该删就删（S3 交付清单之一）；
  6. `ctx.betterSidebar` 注册表中非 tab/fileViewer 的部分保留为插件内部扩展点（生态价值后续再评估）。

### 2.3 插件 audience（D6/D10）

- 安装流（InstallSubject → 现有确认链）加一步：通用 / 编码 / 两者；落安装记录 `audience` 字段（位置 S4 首日钉）。
- **过滤语义（D10 已确认）：客户端呈现过滤，引擎组合不拆**。audience 只决定「工作台 W 的 UI 是否呈现该插件的面板/入口」；per-workbench 工具差异若将来需要，走 preset 组合行（`disabled`）机制，本轮不做。
- 消费点：ui-plugin-manager 列表标注 audience；各面板/入口按 `workbench.active ∈ 插件 audience` 显隐。

### 2.4 预设面改动（D1/D4 落地口径）

- `presets/ptc/preset.yml`：name → 「编码模式」，description 改写（去掉 PTC 字样，说明工具经 SDK 呈现的编码 Agent 定位）；id/目录不动。
- 删 `presets/minimal/`（roster 活读取，进程内立即生效）。
- cordis.patch.yml：`ui-agent-preset` 行加 `disabled: true`（保留行以维持 web-app 依赖声明被 verify-cordis-config 接受；禁用行有既有先例 :457-479）；engine `agent-presets` 行保留，`default: standard` 不变。**已知残留**：modeSelectionEnabled 是 settings 值而非 Config 字段，历史用户若曾开启并设了非常规 default，其未点名会话仍走该值——GUI 移除后无人能翻转，接受。
- 停用的四个 GUI 面（已核对话骨架对空槽渲染空，不响亮失败）：设置区、新任务英雄条 chip、会话头预设标签、「让 Agent 创建插件」菜单项。预设创作入口随之消失（cordis 预设保留，文件级复制不受影响）。

### 2.5 迁入风险清单（继承 2026-10-01 分析，按 3.0.11 更新）

| # | 风险 | 现状 |
|---|---|---|
| R1 | 模块加载契约 | **消解**：迁入后走仓内标准 client 构建 |
| R2 | 图标面：11 个上游 Regular 名图标 vs QiLin 编号命名集 | 仍需处理；推荐补进 ui-primitives（增量、零风险） |
| R3 | 契约漂移 | **变大**：原分析核对于 rc.2，现 main 已合并 0.2.1-alpha.1（3.0.11）。消费面（conversation.chat.turnTail、settings.section 胜出投影、uiWorkspace、remote.session、`[data-slot=conversation]` 锚点）需按当前 HEAD 逐面复核 |
| R4 | 依赖与合规 | node-pty（allowBuilds）、Office/视频 6 钉版依赖、THIRD_PARTY_NOTICES、react-icons ESM 别名 |
| R5 | profile 接线 | 内置行直接进 cordis.patch.yml，无需随附层/收敛迁移 |

## 3. 实施计划（文件级）

### S1 预设面（独立可发布，先行）

| 文件 | 改动 |
|---|---|
| `packages/preset/agent-presets/presets/ptc/preset.yml` | name→「编码模式」，description 改写 |
| `packages/preset/agent-presets/presets/minimal/` | 整目录 `git rm` |
| `packages/bundle/web-app/cordis.patch.yml:417-419` | `ui-agent-preset` 行 `disabled: true` + 注释改写（引用本计划） |
| `packages/client/ui-agent-preset/src/client/locales.ts:161` | 枚举文案「标准、编码、创造及自定义模式」 |
| `apps/web/tests/web-agent-presets.e2e.ts:246` | roster 断言 `['cordis','ptc','standard']` |
| `apps/web/tests/minimal-preset.snapshot.ts` + `snapshots/web/minimal-preset/` | 删除 |
| `apps/web/tests/shipped-composition.e2e.ts:1078-1083` | minimal terminal-registry 用例改写：无 shipped 预设再有 terminals → 测试内 fixture 预设（ptc 行 + persistent-shell 组合）写入 user root |
| `apps/web/tests/agent-preset-selection.e2e.ts` | minimal→cordis/ptc retarget；reduced-menu 断言（无 compact/plan/goal）随 minimal 删除 |
| `apps/web/tests/agent-preset-authoring.e2e.ts:155` | 复制源 minimal→standard/ptc；`expected/agent-preset-authoring/*.expected.md` goldens 随重烘 |
| `apps/web/tests/fixtures/assembled-remote.fixture.json:175` | minimal 条目清理 |
| `packages/preset/agent-presets/README.md` | minimal 段删除、展示名同步 |

验证：`pnpm run typecheck`；web e2e 定向（authoring/selection/roster 三件）+ `QILIN_SNAPSHOT=replay pnpm run test:web`（assembled 输出变了）；`pnpm run doc-sync`。
明确不做：preset id 不改（存量 ptc 会话零破坏）；preset-migration 快照 `agentPreset:'ptc'` 断言原样保留。

### S2 ui-workbench 骨架

新包三注册面（tsconfig aggregate / patch 行 / web-app 依赖）；workbench 客户端服务 + 持久化；左栏分段控件；新任务显式带 agentPreset（D3）；会话列表按 agentPreset 反查过滤；空白会话 `select` 换绑。测试：包内单测 + selection e2e 扩展（标签切换→新任务预设断言）。依赖：无。

### S3 coding-sidebar 迁入（最大切片）

R3 五面契约按 HEAD 复核 → 11 图标补 ui-primitives → 说明符重写与包骨架 → 挂载改造（内容体注册，§2.2）→ registerTab→rail 映射钉定 → 拦截面 workbench 守卫 → settings 接管/导航图标删除 + 重复实现盘点清单（D11）→ R4 依赖合规（node-pty allowBuilds、6 钉版、NOTICES、react-icons 别名）。验收：通用/编码两态右栏切换实机走查（同壳不同内容）+ 既有关键 e2e 不回归。依赖：S2。

### S4 插件 audience

安装记录落点首日钉定 → 安装流三选一 → ui-plugin-manager 标注 → 面板显隐过滤。依赖：S2。

### S5 版本线 3.1.0

`pnpm run version:set 3.1.0` → 重建 → tag `v3.1.0` → GitHub Release（notes）→ 插件套件同步换线重号（D7）→ npm 包冻结声明（D9）→ 基线文档转 implemented Agent Note。依赖：S1–S4 全绿。

### 横切纪律

- 每切片独立提交、独立可发布；S1 先行落地后 S2–S4 可并行推进。
- GUI 行为变更按仓库规矩录 GIF；涉及 assembled 输出的跑 replay 快照。
- 完成的唯一定义是**实机走通**：S3 验收必须在真浏览器过「切标签→右栏内容体切换→编码面板功能→切回通用无残留」全链。
