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

### S1 落地记录（2026-10-05）

- 计划文件名漂移核实：`apps/web/tests/web-agent-presets.e2e.ts` 不存在；roster 断言的实际家是 `packages/preset/agent-presets/tests/shipped-root.spec.ts`（`['cordis','ptc','standard']`）。
- selection/authoring 两条 e2e 车道启动真实 Web 组合，D4 停用行会连坐其 GUI 面；各自以车道级 overlay 重插 `ui-agent-preset` 行（显式 `disabled: false`），插件作为引擎能力继续被覆盖，产品默认仍是停用。
- D4 的第五个受累面是 `ui-settings-plugin-inventory`：其预设切换器经 `ctx.locale.bind('settings.agentPreset')` 读 ui-agent-preset 的词典，命名空间消失后退化为原始键。修复为该插件自持三预设展示文案（id→键映射仍单点在 `@qilin/agent-presets/display`），并解除对 ui-agent-preset 的依赖声明。
- shipped-composition 的 Auto 热插用例改为车道内 user-root fixture 预设（persistent-shell 组合），minimal 的 terminal 注册表职责就地重建；该车道同场对齐两处存量漂移（`sidebar_open` 宿主级行、`EXPECTED_TOOLS` 的 win32 schedule 门控与 pwsh 行）。
- 黄金重录：D4 去除的 chrome（英雄条 chip、会话头预设标签）与 pwsh/schedule 既有目录漂移在同一批 refresh 中落盘；`minimal-preset` 快照车道与 `snapshots/web/minimal-preset/` 删除。
- 验证基线：typecheck、三包单测（375）、selection/authoring/shipped-composition 三车道 replay 全绿、hygiene 与 doc-sync 仅剩 main 既有红（runtime-closure、persistence-type-history）。全量 test:web 的其余红均为干净树复现的存量红，逐车道对照确认与 S1 无关。

### S2 落地记录（2026-10-05）

- 首日三个钉定：持久化走 localStorage（`qilin.workbench.v1`，沿 2026-09-14 right-sidebar「浏览器本机视图偏好」先例）；宿主槽位零新增——分段控件在 WorkspaceBrowser 挂的 `sidebar.workspaces` 槽内渲染；D3 通道 = `sessions.create` 透传 `agentPreset` + 空白会话 `agentPresets.select` 换绑（宿主 turnBoundary 拒绝非空白）。
- `ui-workbench` 纯状态零服务依赖（防消费环）；D2 折叠 `workbenchShows` 留在包内，WorkspaceBrowser 经注入的 `shows` 回调消费——client bundle purity 门禁禁止跨插件 value import，浏览器侧只留 type import。
- 依赖收窄：`UiWorkspaceService` 对预设面的依赖声明为结构化的 `AgentPresetSwitcher`（仅 `select`），不是整个 `ClientRemote['agentPresets']`——测试替身零转型，verification-no-unknown-casts 零新增。
- selection e2e 新用例断言「切标签→空白任务重绑→列表过滤」；create 透传的单元覆盖在 session-controller manager 测试。e2e 里 New Session 手势在 general 标签下会把 ptc 空白会话换绑成 standard（D2/D3 的正确行为），断言流程按此语义书写。
- 三个 PTC 车道（ptc-round/present/ptc-escalation）以 `seedWorkbench(page, 'coding')` 启动：车道宿主 `default: 'ptc'`，旧世界客户端省略 preset 依赖宿主兜底；D3 后客户端显式发送当前标签预设（general→standard，无 run_code →「unknown tool」）。修复后三车道黄金与 HEAD 完全一致——原黄金本就是 ptc 组合的正确记录，零黄金漂移；此前一轮 refresh 因 seed 未生效写坏过这三车道的中间产物，已由本次重跑自愈。
- Playwright 陷阱记录：`page.addInitScript(fn, arg)` 不 await 时注册与首次 goto 竞争，脚本被静默丢弃（无参数版本 await 后正常）；`seedWorkbench` 为 async 并在车道内 await。
- lifecycle-chrome 两条 aria 黄金新增分段控件 tablist 行（S2 chrome 的预期落盘）。
- 验证基线：typecheck 绿；ui-workbench/ui-workspace/session-controller 单测 1097 绿；selection/shipped-composition/lifecycle-chrome（30）与 ptc-round/present/ptc-escalation（11）六车道 replay 全绿；doc-sync 仅剩存量红（persistence-type-history）。hygiene 各失败项（vendor-rescope ×2、publint、constraints、package-dependencies、unknown-casts ×7、cordis-config sdk-minimal、runtime-closure）在本机与 S1 提交点逐门对照完全一致——S1 记录中「hygiene 仅剩两红」的说法与 S1 提交点的实际门禁状态不符，S2 对 hygiene 零新增。

### S3 落地记录（2026-10-05）

- **迁入与身份重写**：`packages/client/ui-sidebar-coding/`（~193 源文件三遍机械重写 + 六个焦点文件手工改造）：`dsh-*`→`@qilin/client-*`；vendored fork 实名 `@qilin/schemastery`；xterm 对齐仓库 ^6.0.0（防双实例）；file-upload 先例的双 face leaf tsconfig（host 引用 core 面、client 引用 ui-settings/ui-slots/ui-primitives）；浏览器依赖全部落 devDependencies（codemirror 套件、@univerjs 0.25.1 钉版、mermaid 11.17.2、xlsx 0.18.5、docx-preview 0.4.0、@aiden0z/pptx-renderer 1.2.4 钉版、react-icons 5.7.0）。tsdown 走 tsdown.client.ts 共享预设：核心 bundle `name: '<pkg>/client'`（notices 收集器按名查找）+ `__ModuleLoader__.load` banner；6 个 lazy chunks（terminal/editor/locale/trajectory/mermaid/office）banner 写 `globalThis.__qilinChunks__`，经插件自有 `/sidebar/bundle` 路由加载（刻意不过模块加载器）。`ws` 无 @types，包内最小 ambient `ws.d.ts`。
- **R2 消解**：27 个上游 react-icons Regular 图标全部符号级映射到 3.0.8 已落地的 ui-primitives 集（三个 chevron 与 CloseFill 用 14 号字形），零新增、零 react-icons 运行时依赖（构建期 ESM 别名保留在配置里但不再被打包引用）。
- **R3 挂载缝修正（实机走查定谳，比首日复核多出的一处）**：首版把 coding 分支放在根 `SessionView`——绕过了坐席，而 ui-layout 右栏列恒 0 宽、可见面板是 `.panel` 绝对定位锚右缘定宽盒（由 `SidebarPanel` 渲染），coding 体 `inset:0` 填列只能得到 0×0。修正：切换移入 `RightbarSeat`/`SidebarPanel` 内部——`rightbar.session` owner 增 `useWorkbench: SnapshotSelectorHook<WorkbenchState>`（根注入原始源、组件侧框架映射为钩子），children 声明随分支挪到坐席注册（父声明+授权、子注册），`.codingSeat` 包装参加折叠滑移 CSS（与 dockkit 宿主同一 `--dsh-sidebar-width` 位移），dockkit 布局在编码态不挂载。实机几何：编码体 720px 全高、Terminal lazy chunk（真 zsh PTY）与 + 菜单 9 项均在壳内工作。
- **构建纪律（走查定谳的第二件事）**：客户端产物必须走编排的 `pnpm run build`（build.ts 注入 QILIN_CLIENT_* 公共环境 + `.qilin-build/client-build-environment.json` 产物清单）；对单包裸跑 `pnpm run bundle` 的产物在生产 Web 面引导失败——插件 entry 独立拉取后 import 静默失败（loader `_init` 的 catch 走未挂载的 logger，fiber undefined，boot 审计只报「import failed」），实机表现为「Failed to load plugins」。车道（Vite 变体引导）不经过该路径所以全绿——「车道绿」不等于「生产组合可引导」，实机走查是唯一裁判。
- **首日钉定回顾**：registerTab→rail 选「内容体内部导航」（插件保留自家 TabBar，不映射 dockkit rail；`betterSidebar` 注册表保留为包内扩展点）；D11 删 settings 接管（SETTINGS_SECTION_ID 用自己 id、priority 0）与 registerSettingsNavIcon；IME guard 不做 workbench 门控（无原生对应面）；悬浮窗随列裁剪可接受（v1）。
- **D11 重复实现盘点**：①settings 接管+导航图标已删，Side card 节以自身 id 低优先注册；②ui-deliverables 已原生认领 changes-review 地址族，插件的认领有 coding 门控（两态互不越界）；③`sidebar_open` 工具与原生 `@qilin/sidebar-opens` 同名——默认关闭（agentTerminalTools），同开时第二次注册响亮失败，留待用户裁是否改名；④title-bar/桌面壳兼容子系统（aionui 互斥、外部停用、layout-push、body 自挂载）随挂载改造一并删除；⑤插件自管面板宽度偏好（defaultWidthPercent）在编码态被原生列宽接管，设置面仍显示该键——v1 保留（settings 值无害），S4/S5 再裁。
- **测试债务**：迁移包整树豁免 coverage 门禁（vitest.config.ts + TODO(port)，沿 ui-renderer/ui-conversation 先例）；上游 `tests/open-intent.mjs` 行为用例未迁（unrun 机制），留 S4 后补。verify-doc-refs 清理四处上游死文档引用（plugin-dev-checklist、office-preview-design、两处 `docs/plan.md` 工作区路径约定——常量改运行时拼接保行为）。
- **验证基线**：双包 typecheck 0/0；ui-sidebar-right 单测 258 绿（含新 workbench 服务桩与 coding children 断言更新）；slot-catalog 重生成（契约进目录）；四车道 37 绿（lifecycle-chrome/selection/shipped-composition/ptc-round）；test:docs 20/20；doc-refs 3857 文件全解析。SAFE_HOST_DEPENDENCY_EXPORTS 5 个新条目已人工审阅通过（2026-10-06，用户批准 safe 分类）并落入策略表（defineTool/createUserMessage/installModelSelection/snapshotSubagentDescriptor/SessionLogOffset——逐条注释安全理由：纯工厂/数据投影、无模块级可变状态）；推 PR 时描述须按策略要求以显著标题列出这笔人工审阅。verify-package-dependencies 仅剩存量 1 项（@qilin/subprocess SubprocessExecutableNotFoundError 无人引用，早于 S3，另案处理）。

### S4 落地记录（2026-10-06）

- **首日钉定回顾**：audience 记录落 profile manifest `qilin.profile.audiences: Record<包名, 'general'|'coding'|'both'>`（缺省读 both——CLI/老 profile 装的存量零改动、零写放大）；过滤机制 = ui-renderer 无依赖「呈现门」+ ui-plugin-manager 作门实现者；graph 级排除不做（=变相禁用，违背 D10「客户端呈现过滤、引擎组合不拆」）。
- **Host 侧**：`@qilin/package-manifest` 增 `QilinProfileAudience`/`audiences` 字段；plugin-manager 增 `setAudience` Remote（unknown-plugin/shipped-layer 拒绝、presentation-only 不触发 reload）、`installBundle` options 增 `audience`（enabled:false 也记录——装完再启停不丢选择）、`selectBundle` 只在显式传入时写记录（重复 enable 不再误报 changed、不污染 manifest）、`removeBundle` 随 pnpm remove 清除记录、`listBundles` 每行回读 `audience`（required，缺省 both）。单测 200 绿（新增 audience 写读/校验/清除/安装携带五组）。
- **ui-renderer 呈现门**：ui-slots `entriesOfSlot(key, admit?)`（选举与 chain 遍历前过滤——single/keyed 单元格落到下一个存活者、list 行整行消失、chain 拒选，owner fallback 而非 deadCell）+ `SlotAdmissionGate`（admit(registrant)+revision）与宿主面必填 `admissionRevision`；SlotRegistry 增 `installAdmission`（boot-once、安装者 fiber 生命周期），宿主面 `entriesOf/entriesOfSlot` 过门、`entries()/snapshot()` 检查面不过（诊断完整）；SlotOutlet/RootOutlet 订阅 revision（WeakMap 缓存 subscribe 闭包防每渲染重订阅）。单测 173 绿（core 四 kind 语义 + registry 过滤/boot-once/卸载还原 + 翻签实时回退）。
- **ui-plugin-manager 门实现与 UI**：`admission.ts` 组合 workbench.active × listBundles audience → 签名比对发布 revision（admit 每调用现读快照，未读名/无记录名一律放行）；安装对话框 spec 屏「呈现位置」三选一（随 installBundle 记录）；详情页同名字段组可改（`setAudience`，失败走 failedAudience toast）；卡片非 both 标注「通用/编码」小标；locale 双语成对。
- **S3 残留清偿**：verify-concrete-terms 在 S4 门前暴露 ui-sidebar-coding 六处出处措辞禁词（S3 提交点漏跑该门）——dead defensive 字段删除（全仓无写入者，行为不变）、JSDoc 与 README 标题改具体词；Summary 收敛回 100 词内，pairing 重录。
- **实机走查修正两处（走查定谳）**：①**registrant 戳记前提纠偏**——S4 探索记的「registrant = ctx.fiber.name = 插件包名」不成立：Loader entry 插件是无名 `{apply}` 对象，cordis 的 `fiber.name` 继承自最近命名祖先（实测浏览器侧为 'au'）。修正：ui-renderer `_register`/`_registerFactory` 的戳记改为 `fiber.entry.options.name`（= Loader entry 模块名 = 插件包名，宿主与浏览器一致）优先、fiber 展示名兜底，单测钉死优先级。②**门需要启动即armed**——门读 manager store，而 store 原本只在页面首渲时才读 Host：未开过插件管理页的会话里门零数据、全放行。修正：apply 增 `gate boot read`（连接未就绪失败由既有 `connection/reset` 刷新自愈），browser-plugin spec 的「渲染才读」前提随新现实改写（boot 读一次 armed，changed/reconnect 各加一次，页面 ensure 不再加读）。
- **实机走查全链通过（2026-10-06，隔离 home + web profile 4177）**：本地路径安装 `@local/audience-demo`（安装对话框呈现位置三选一记录 coding，落 manifest `audiences`）；通用态 overlay 消失 → 编码态出现 → 切回无残留 → 往复可重复；卡片「编码」标注；详情页「呈现位置」字段组回读正确，改「两个工作台」经 `setAudience` 落盘（manifest `both`）且通用态即放行。测试插件为最小第三方 web bundle（patch 行 + `qilin.client` + `__ModuleLoader__` 闭包注册 `shell.overlay`），走查后留 /tmp 不入库。
- **验证基线**：全仓 typecheck 0 错；相关包单测绿（plugin-manager 200 / ui-plugin-manager 139 / ui-renderer 136 / ui-slots 37 等，stamp 修正后复跑）；test:docs 20/20；oxlint 触包 0 错；客户端产物走编排 `pnpm run build`（走查前重建，服务器随重建重启防陈旧 rev）。推 PR 时按仓库规矩补录 GIF。
