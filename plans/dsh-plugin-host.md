# QiLin DSH 插件宿主（dsh-plugin-host）—— 无缝兼容 DSH 插件生态

> 由来：better-sidebar 案例验证了「直接装不可行」的三重宿主绑定（cordis 安装机制 /
> client 运行时依赖 / Typert 数据面）→ 用户定调总体要求：QiLin web 升级为 DSH 插件
> 生态的宿主——第三方 DSH 插件可在麒麟安装、使用、升级、卸载。

## 已定决策（用户拍板 2026-08-31）

- **安装模式**：装/卸/升级需**重启并重建 web bundle**——与 DSH 官方同构（构建期
  patch + inject），可靠性优先，不做运行时热插拔。
- **兼容分期**：先做**面板类插件**（sidebar tab / file viewer / dock——对用户最可见）；
  agent 运行时类（language / skills）后续按「一切皆 port」的要求封装成不同类型的
  port 插件。
- **版本基线**：锚定 **dsh 0.1.2-alpha.2**，长期实时跟踪上游。契约层（宿主 API 面）
  不变的版本，插件零适配；上游破坏性变更届时逐个分析。
- **自研侧边栏下线删除（用户拍板 2026-08-31，随 H4 执行）**：web-demo 的
  better-sidebar 自研实现整体删除；插件契约面（`core/sidebar/panel-registry` +
  `protocol`、`qiLin.sidebar` 服务桥）保持不变——插件零适配。插件面板改由宿主
  极简 dock 挂点承载。

## Task List

### H0 兼容性盘点 —— ✅ complete
- [x] 8 插件 × 宿主 API 面矩阵（inject / patch / mount 点 / host 半 / 数据源）
- [x] 插件分级：T1 自包含面板 / T2 agent 运行时 / T3 源码构建重插件；金丝雀 = kcoder-stats-panel
- [x] @deepseek-ai 运行时包可得性：本地 harness checkout 完整可得（npm 公共源待网络验证）

### H1 最小宿主内核 —— ✅ complete（真实第三方插件已跑通）
- [x] 浏览器端插件协议 shim：`window.__ModuleLoader__.load({id,factory})`（inject/apply 服务注入、replace-on-reload、插件错误不落页面）——实测 T1 插件 client 零静态 import，仅需该协议面，无需内嵌完整 cordis
- [x] 插件清单 + 同源 script 注入（public/plugins/manifest.json；模块级单例 boot 兼容 React strict-mode 双跑）
- [x] qiLin.sidebar 服务桥：DOM mount 适配为 SidebarPanelSpec 进 sidebarPanelRegistry；BetterSidebarRoot 🧩 chips 行曝光插件面板
- [x] hello-tab 样例全链跑通（浏览器实测：chip → tab → mount 内容渲染；tsc+eslint 绿）
- [x] 真实第三方插件跑通：**kcoder-git-panel**（浏览器实测：浮动面板渲染 verify-thread-1 真实 git 快照——变更统计/main 分支/任务计划扫描；GET 405 守卫实测）
- [x] 第二个真实插件 **kcoder-terminal**：titlebar 锚点按钮挂载 / vendor xterm 自托管 / RPC prefix 分发 / SSE 数据面路由全通；pty 引擎层 node-pty `posix_spawn` 被本机 macOS 拒绝（脱离沙箱复现——上游 native 模块环境限制，非集成缺陷；反证 ports PTY 选型纯 Python 正确）

### H2 Typert 能力桥 —— ✅ complete（含 api-remotes 端点对齐，随 H4-d 切片 2 落地）
- [x] hostServices 能力桥：`fs.list/readText/writeText` + `git.exec`（execFile 无 shell、4MiB 上限），统一 `threadWorkspaceScope` 围栏——插件经 ctx.get 软探测即用，路径强制限定 thread workspace 树内
- [x] **pty → ports 桥**：node-pty 兼容 shim（CJS，插件就近 node_modules 优先解析）——spawn 返回异步初始化门面（早期 write/resize 排队），输出走 gateway WS stream（binaryType=arraybuffer），write/resize/kill 走 ports REST，终端驻留保留线程 `__pty_bridge__`；**kcoder-terminal 引擎摆脱 native node-pty 完整跑通**（浏览器 dock 键入 echo 全回显）
- [x] api-remotes 协议端点对齐（H4-d 切片 2）：runtime `ctx.typertHost.mount(pkg,
      handler)` + POST /qilin-plugins/typert/<pkg>（loopback-only、typert 结果
      信封）；client `remote.$mount({package,descriptors})` 产 HTTP stubs 按
      service 分组，sessions.scope(id).get("remote.<svc>") 解析——smoke 三例全过

### H3 生命周期管理 —— ✅ complete
- [x] CLI `scripts/plugin.mjs`：add（本地 dsh-plugins 形态目录）/ remove / upgrade / enable / disable / list——文件分发（client→public、server+vendor→plugins/ 非公开区）+ manifest 原子重写；与 DSH 官方同构（安装后需重启 web-demo）
- [x] 版本记录与基线校验位：entry 记录 version + source；宿主基线 DSH_BASELINE=0.1.2-alpha.2 常量（生态暂无标准兼容声明字段，声明出现时在此扩展比对）
- [x] 插件管理面板 `/workspace/plugins`：清单表格（版本/client/server/状态）+ 停用/启用/卸载（loopback 管理 API POST /qilin-plugins/api）+ 重启提示横幅；CLI 与面板共用 runtime 管理逻辑

### H4 面板类挂点铺开 —— H4-a/H4-b/H4-c ✅；H4-d 切片 1 ✅（slots 骨架），切片 2 待做
- [x] H4-a 自研侧边栏删除：components/better-sidebar（11 文件）+ core/sidebar 支撑层
      （panel-host/scope/use-sidebar-tabs/viewer-host/viewer-registry）+ gateway
      sidebar-tabs 持久化端点与路由测试 + better-sidebar e2e/单测/截图；
      rightPanelMode 布局机制一并移除（右栏恒为 RightContextPanel）
- [x] H4-b 插件面板 dock 挂点：PluginPanelDock（🧩 抽屉，titlebar 锚点同侧）承载
      sidebarPanelRegistry 的 plugin: 面板——qiLin.sidebar 契约不变，渲染面换宿主
      极简实现（registry 增加订阅通知，additive 不破坏契约）
- [x] H4-c betterSidebar service 对齐（0.1.2-alpha.2 契约面）：plugins-host/
      better-sidebar.ts 发布 ctx.get("betterSidebar")——editor openTab/openFile
      全语义（path 去重 + 内容种自动开抽屉）+ registerTab/registerFileViewer
      注册表（fetchStrategy 五态/priority/detect/exts/catch-all）+ 生命周期回调 +
      closeTab/activateTab/updateTab；宿主内建编辑器走 /api/files/read（相对路径
      直通 = DSH session-cwd 语义，绝对路径 cwd 前缀相对化，越界诚实降级）；真插件
      git-panel 端到端验证（变更行 + 计划点击两种路径形态均落 dock 渲染内容）
- [ ] H4-d conversation turnTail 链（后置，依赖聊天 UI 插槽对齐）

### H5 agent 运行时 port 化 —— H5-a ✅；H5-b/c/d 待做
- [x] H5-a **语言 port**：gateway 新增 ports 路由（注册/注销/列举 system-prompt
      sections，internal-auth POST /api/ports/system-prompt/sections）+ lead agent
      prompt.py 组装时并入注册 sections（order 升序，参照既有 skills system-prompt
      cache 机制）+ plugins-host-runtime 增 `ctx.systemPrompt.section(...)` 桥
      （POST 到 gateway，QILIN_GATEWAY_URL + internal token）——**验收通过 =
      kcoder-language 原样安装（v0.1.1 纯 server 半），真实对话回复为简体中文**
      （中性提示词 →「我是 QiLin 2.0，一个开源的超级智能体…」；用户明示可用英文时
      回复英文＝指令语义正确：防惯性、不压明示偏好）
- [x] H5-b **tools/post-execute 事件面** ✅：qilin/ports/tool_events.py 事件环
      （seq 单调/cursor 快照）+ ToolEventMiddleware（wrap_tool_call + **awrap_tool_call
      委托**——运行时走异步路径，缺 awrap 会 NotImplementedError 弄坏工具）+ gateway
      /api/ports/tools/events（cursor 长轮询）+ Node ctx.on("tools/post-execute")
      1.5s 轮询分发（next()={kind:accept}）——**E2E 验收：真实 write_file → 环内
      单事件（真实 callId/threadId）→ 金丝雀 decision:accept 分发**
- [x] H5-c **skills port** ✅：gateway /api/ports/skills（POST 物化/DELETE 注销，
      经 write_custom_skill 存储原生 API——custom 命名空间默认 enabled，零 schema
      改动获得 describe_skill/read_file/斜杠激活全链）+ Node ctx.skills.register
      桥（SKILL.md frontmatter 组装 + resourceBase 资源目录递归打包上传）+
      plugin.mjs 修复（readdirSync import + 内容目录随 server 半分发）——**验收 =
      kcoder-skills v0.4.0 原样安装，37 个 runtime skills 注册物化，storage
      enabled 列表全含，真实对话 describe_skill 查询成功**
- [ ] H5-d uiConversation 时间线 store + file-review-tab 实装（收拢 H4-d 尾）

## Findings

### H0 盘点矩阵（2026-08-31，源: ~/kk_Projects/dsh-plugins 8 插件实扫）

**插件分两个世界**——兼容难度天差地别：

| 级 | 插件 | client 半 | host 半 | 宿主依赖面 |
|----|------|-----------|---------|------------|
| **T1 自包含面板** | kcoder-stats-panel | 打包产物,**零静态 import** | entry 零 require | 纯运行时服务面(cordis service 发现) |
| | kcoder-git-panel | 自包含 | node:child_process 跑 git CLI | + better-sidebar service(panel/sidebar/settings 高频) |
| | kcoder-terminal | 自包含(含 registerTab 调用) | node-pty 多标签(vendor 自带) | + better-sidebar registerTab |
| **T2 agent 运行时** | kcoder-language | 无 client 半 | system-prompt section 注入 | agent 运行时注入口 |
| | kcoder-skills | 无 client 半 | 技能包物化 | 技能系统格式 |
| **T3 源码构建重插件** | DSH-better-sidebar | **26× ui-primitives**、7× cordis、5× dsh-tools、3× dsh-llm/agent、chat.* 深 slots | typert remotes(fs/git/pty) | 完整宿主运行时 |
| | dsh-file-review-tab | 6× typert-protocol、conversation turnTail、消费 better-sidebar service | undo/redo remote | 宿主 + 插件间服务 |
| | dsh-super-ppts | inject runtime | dsh-tools/tool-subagent/workflow/web 面 | agent 工具面 |

**关键结论**:
1. T1 对宿主的依赖是**运行时服务面**(cordis service 发现 + 服务名约定),不是编译期
   import——client.js 自包含零依赖。兼容 T1 ≈ 实现 cordis 内核 + 两个服务:
   **better-sidebar tab service(registerTab/registerFileViewer)** 与宿主环境注入。
   其中 tab service 与 QiLin 现有 sidebar 协议(openTab/SidebarPanelApi)天然对齐。
   **H1 实测修正**:①注册协议实为 `window.__ModuleLoader__.load({id,factory})`(client
   经宿主 /plugins combo 以普通 script 拼接执行),factory 返回 cordis 惯例
   {inject,apply};②terminal 里的 registerTab 是其自绘多标签的**局部函数**——T1
   插件并不消费 better-sidebar service,而是自绘 UI + 依赖宿主 DOM 锚点(如
   `__dsh_desktop_titlebar`);③stats-panel 依赖 DSH 聊天页特有 DOM(StatsLine),
   不适合作金丝雀——改用自研 hello-tab 验证协议链(已完成)。
2. T1 的 host 半只用 node: 内置(git CLI/pty)——沙箱/安全模型按 DSH 约定
   (isTrusted loopback、POST-only、execFile 无 shell)实现即可,PTY 桥可接 ports。
3. T3 需要完整 ui-primitives + conversation slots——后置到 H4,不作 H1 目标。
4. **金丝雀选定:kcoder-stats-panel**(最纯:entry 零 require、client 自包含、单面板);
   次选 git-panel / terminal(引入 better-sidebar service 面 + host exec/pty 桥)。
5. **运行时包可得性 ✅**:DSH harness checkout 的 node_modules 有完整 @deepseek-ai 族
   (cordis/cordis-plugin-* /dsh-api-remotes/dsh-agent* 等);DSH 本体源码仓在
   ~/kk_Projects/deepseek-harness。npm 公共源待网络环境验证(沙箱内 EPERM)。
6. 插件安装模型(dsh-plugins README):`dsh plugin --profile web add <pkg|path>` →
   profile bundle stack merge(cordis.patch.yml insert)→ 重启生效——H1/H3 的对齐蓝本。

（H0 盘点矩阵待填）

### H4 开工侦察（2026-08-31，自研侧边栏下线切割面）

- **自研侧边栏占地**：`src/components/better-sidebar/` 11 文件 589 行（Root/Drawer/
  TabBar/TabContent + FileExplorer/FileViewerTab + 5 viewers）；`src/core/sidebar/`
  7 文件中 **5 个只被 better-sidebar 消费**（panel-host←TabContent、use-sidebar-tabs←
  Root、scope←Root/FileExplorer、viewer-registry←FileViewerTab、viewer-host **已无
  消费者**＝死代码）。仅 panel-registry + protocol 被插件宿主（services.tsx）引用。
- **插件契约面（不动）**：`qiLin.sidebar.registerTab` → sidebarPanelRegistry（id
  前缀 `plugin:`）；hello-tab 是唯一消费者；git-panel/terminal 自绘（titlebar 锚点）。
  🧩 chips 行在 BetterSidebarRoot 内——删除后由新 PluginPanelDock 承接。
- **rightPanelMode**：仅 3 处消费（workspace-content 三元、layout-context 读写、
  settings 页选择器）；layout-context 单测只测 mode → 随机制一起删。
- **sidebar-tabs 持久化**：gateway `routers/sidebar_tabs.py`（threads_meta
  metadata_json.sidebar_tabs）+ app.py 两行注册 + tests/test_sidebar_tabs_router.py
  ——功能随侧边栏死，端点一并删除（存量 metadata 字段惰性留存，无需迁移）。
- **测试牵连**：删 tests/unit/components/better-sidebar/（7 文件）、core/sidebar 的
  use-sidebar-tabs/viewer-registry 单测、e2e better-sidebar.spec.ts + 3 截图；
  **保留** panel-registry/protocol-types 单测（契约仍在）与 e2e sidebar.spec.ts
  （那是左侧 WorkspaceSidebar 导航，无关）。

### H4-c 侦察（2026-09-01，betterSidebar service 契约）

- **契约源**：dsh-plugins/DSH-better-sidebar/src/client/service.ts（插件版本
  0.12.0）——BetterSidebarService 共 17 方法：registerTab / registerFileViewer /
  openTab(OpenTabSeed) / openFile / matchFileViewer / closeTab / activateTab /
  updateTab / getSnapshot / subscribe(State) / getTabs / getTab / is*Enabled。
  OpenTabSeed = {type,title?,path?,diff?,id?,url?,meta?}；内容种（path/url）必须
  「落进视野」（面板收起时自动展开）；类型种不展开。
- **消费面分层**：已装 git-panel 只用 openTab({type:'editor',title,path,id})
  （计划预览 + 变更文件点击；服务缺席有 server open-plan 回退链）；
  dsh-file-review-tab inject [betterSidebar,sessions,locale,remote,slots] 并动态
  解析 uiConversation.events——T3 面依赖 slots/remote（H4-d/H2 尾），不在本片。
- **面板让位协议（用户确认）**：git-panel ↔ better-sidebar 互斥走 **DOM 探测**
  （[data-dsh-better-sidebar] + panelHidden 类）而非服务；义务债务（yielded 反向 /
  sideYielded 正向）+ MutationObserver 沿触发去重 + 设置页同构让位。QiLin 恒缺席
  → 协议休眠；dock 为浮层无布局争夺，**故意不模拟该属性**（模拟会空唤醒对方的
  收起/履约逻辑）。
- **文件读取**：gateway /api/files/read?thread_id&path（path 相对 thread
  workspace、仅 textual；binary 400 提示走 /api/files/raw）+ /api/files/raw
  （bytes，可作 mediaUrl）。git-panel 给**绝对路径** → 由 sessions cwd
  （cwdByThread）转相对；worktree 覆盖路径在 workspace 外 → 诚实降级提示。
- **H4-c 范围落定**：betterSidebar 服务落进 plugins-host——editor openTab /
  openFile 全语义（path 去重、内容种自动开抽屉）、registerTab/registerFileViewer
  注册表（fetchStrategy 五态 + priority desc + detect/exts/catch-all 匹配）、
  生命周期回调、features=[openFile,tabLifecycle,updateTab]；SidebarStore/设置/
  prefs 面 stub（T3 消费者才需要）。宿主内建编辑器 = 线程围栏内取文 + 行号
  pre（>5000 行截断提示）；插件注册的 viewer 组件按 fetchStrategy 喂参数。

### H4-d 侦察（2026-09-01，file-review 依赖深度 + 切片决策）

- **dsh-file-review-tab 依赖五件**：①ctx.slots（inject(name,factory,label) +
  register(contribution, component)，contribution={name,select,priority,locale,
  registrant,inject(sessionId)→props 袋}）；②ctx.remote.$mount(TYPERT_REMOTE)
  ——插件自带 typert 三件套（remote.js/typert-descriptors/typert.host.js，
  server 半用 @deepseek-ai/dsh-typert-protocol + dsh-atomic-write），经
  sessions.scope(sessionId).get("remote.fileReview") 逐会话取 status/apply；
  ③uiConversation 服务：binding(sessionId)?.target("chat") → {getSnapshot,
  subscribe}，face={legacy,timeline.turns(Map)→data(Map,fileReviewChanges)}；
  ④locale（t()）；⑤betterSidebar（H4-c 已覆盖：updateTab/openTab/activateTab
  带 meta 全支持）。
- **关键形状发现**：T3 插件用 ctx.sessions / ctx.betterSidebar / ctx.slots /
  ctx.remote **属性访问**（cordis ctx 本态），T1 用 ctx.get()——宿主 shim 应改
  Proxy：属性访问回落 getPluginService(name)，一次修好两面。
- **切片决策**：file-review 完整功能（typert server + uiConversation 时间线
  store）是 T3 级，单轮吞不下。H4-d 切片 1 = ctx Proxy + slots 服务 + 聊天 UI
  turnTail 挂点 + remote/locale 骨架 + hello-turntail 金丝雀（DOM mount 形态
  contribution，宿主双支持 React component / DOM mount）；typert 传输与
  uiConversation 时间线留切片 2+。

## Progress Log

- 2026-08-31: 计划创建。三项决策落定（同构安装模式 / 面板类先行+运行时类 port 化 /
  锚定 0.1.2-alpha.2 长期跟踪）。开工 H0。
- 2026-08-31: H0 完成。核心发现:**插件分两个世界**——T1 自包含面板（stats-panel/
  git-panel/terminal:client 零静态 import、host 半纯 node:内置,依赖只是运行时服务面）
  vs T3 源码构建重插件（better-sidebar/file-review/super-ppts:静态 import ui-primitives/
  typert/dsh-tools,深绑定）。兼容层最小集 = cordis 内核 + better-sidebar tab service
  (registerTab/registerFileViewer,与 QiLin 现有 SidebarPanelApi 天然对齐)。金丝雀 =
  kcoder-stats-panel。运行时包本地可得 ✅。下一步 H1:最小宿主内核。
- 2026-08-31: H1 内核完成(commit fec79a8)。落盘 web-demo/src/plugins-host/{module-loader,
  services,plugin-host} + public/plugins/{manifest.json,hello-tab/client.js} + sidebar
  🧩 chips 行。**浏览器端到端实测通过**:manifest 驱动 script 注入 → __ModuleLoader__
  注册 → inject:['qiLin.sidebar'] 服务注入 → registerTab 进 registry → 侧边栏 tab
  渲染 mount 内容(截图证据)。调试修掉两个真问题:①React strict-mode 双跑 + 模块级
  bootStarted 守卫导致首次 boot 被 cleanup 取消后永不重试 → 改模块级单例 promise
  (失败重置可重试);②rightPanelMode 持久化 readMode 只认裸字符串 'sidebar'。
  发现:web-demo /workspace 主页有独立登录门(与 gateway QILIN_AUTH_DISABLED 无关),
  验证需注册账号登录(KWORKS_AUTH_DISABLED 实际不被 src 消费,仅 E2E terminal 页
  因不在门内而幸免)。下一片:真实第三方插件(git-panel/terminal)——需 host 半
  (同源 RPC isTrusted 边界 + node:exec / node-pty 桥接 QiLin ports)。
- 2026-08-31: **H1 全部完成——真实第三方插件 kcoder-git-panel 在麒麟跑通**(commit
  a0f81a4)。架构:插件 server 半挂载进 server.js(Node 宿主面)——plugins-host-runtime.mjs
  提供最小 cordis ctx shim(webServer.register prefix 路由挂原生 req/res / ctx.effect /
  ctx.get 软服务表),长前缀匹配先于 /api 代理;**协议实测修正:apply 恒收 ctx 首参**
  (inject:[] 也传,client 用 ctx.get 软探测 services——与 hello-tab 初版的 positional
  注入设想不同,已全部对齐 DSH 真实形态);sessions 软服务(ISessions 倒影)+
  files/workspace-path 端点(thread→host 工作区路径,H2 首步)+
  __dsh_desktop_titlebar 锚点 shim(插件入口按钮挂载)。验证:浏览器真实加载
  @kcoder/git-panel,浮动面板渲染 verify-thread-1 真实 git 快照(变更统计/main 分支/
  任务计划扫描/相对时间),GET 405 守卫实测;tsc+eslint+ruff 绿。剩余:H2 Typert 桥
  泛化(hostServices 表扩容)、H3 生命周期 CLI/UI、H4 conversation 挂点、H5 port 化。
- 2026-08-31: **第二个真实插件 kcoder-terminal 安装验证**(commit 4378eea)。titlebar
  锚点按钮挂载/vendor xterm 自托管(200)/RPC prefix 分发/SSE 数据面路由全通;
  pty 引擎层 node-pty posix_spawn 被本机 macOS 拒绝(完全脱离沙箱仍复现——上游
  native 模块环境限制,DSH-Desktop Electron 环境才工作;反证 ports PTY 选型纯
  Python 正确)。安装状态入库:manifest 三插件(hello-tab/git-panel/terminal)。
- 2026-08-31: **H3 收尾完成——管理面板**(commit 28c36be)。/workspace/plugins 管理页:
  清单表格(版本/client/server/状态)+停用/启用/卸载按钮(POST /qilin-plugins/api,
  loopback-only)+重启提示横幅;CLI 对齐(enable/disable+version 记录+基线显示);
  manifest 支持 disabled 字段(client 注入与 server 挂载双跳过)。浏览器实测:
  停用→已停用→启用往返通过,截图证据。修复:runtime 重写漏 import writeFileSync
  (setDisabled 500,日志定位)。H3 ✅ 全部完成。
- 2026-08-31: **H2 pty→ports 桥完成**(commit 09c4147):node-pty 兼容 shim 让
  kcoder-terminal 引擎摆脱 native 限制——spawn 返回异步初始化门面(早期操作排队),
  输出走 gateway WS stream(binaryType=arraybuffer),写操作走 ports REST,终端驻留
  保留线程 __pty_bridge__。**浏览器实测 dock 键入 echo 全回显**(zsh 提示符往返)。
  修复:Node undici WebSocket 默认 binaryType=Blob,帧处理按 ArrayBuffer 匹配
  导致输出全丢(浏览器默认 arraybuffer 故 P4b 未踩)。
- 2026-08-31: **H2 第一片完成——fs/git 能力桥**(commit 9f55ee3)。hostServices 扩容:
  fs.list/readText/writeText + git.exec(execFile 无 shell),统一 threadWorkspaceScope
  围栏(路径强制位于 .qilin/threads/<tid>/user-data/workspace 树内,越界抛错);
  pluginServices() 导出供冒烟。冒烟全绿:双插件挂载 + fs 读写 + git log + 围栏拒绝
  外部路径。Typert/api-remotes 端点对齐后置 H4(依赖 client 运行时);pty→ports 桥
  待做(node-pty 本机受限,桥向 ports TerminalPort 是正解)。
- 2026-08-31: **H3 生命周期 CLI 完成**(commit d4b6dec):scripts/plugin.mjs
  add/remove/upgrade/list——本地 dsh-plugins 形态目录一键安装(client→public、
  server+vendor→plugins/ 非公开区)、manifest 原子重写、remove 双半清净、source
  路径记录;与 DSH 官方同构(安装后重启 web-demo)。实测:remove→add→list 全链
  + 浏览器 smoke(三插件并存,git-panel 数据渲染)。管理面板与 semver 兼容检查
  留待后续;剩余主线:H2 Typert 桥泛化、H4 conversation 挂点、H5 port 化。
- 2026-08-31: **H4 开工——用户拍板自研侧边栏下线删除**。侦察完成（见 Findings），
  切割面锁定：删 better-sidebar UI + core/sidebar 支撑层 5 文件 + gateway
  sidebar-tabs 端点 + rightPanelMode 机制；保 panel-registry/protocol 契约与
  qiLin.sidebar 服务桥；新增 PluginPanelDock 作为插件面板宿主挂点。
- 2026-09-01: **H4-a + H4-b 完成（自研侧边栏下线 + PluginPanelDock 新挂点）**。
  变更 42 文件：删 components/better-sidebar（11）+ core/sidebar 支撑层（5）+
  gateway sidebar_tabs.py/app.py 注册/路由测试 + 单测 e2e 截图（12）；改
  workspace-content（右栏恒 RightContextPanel）/layout-context（mode 机制摘除）/
  settings 页（Right panel 组删除）/panel-registry（subscribe+缓存快照，
  additive）/plugin-host（挂 dock）/message-feed+message-item（import/order
  既有 lint 欠账顺手清）；新增 plugins-host/panel-dock.tsx（🧩 切换钮 + 抽屉：
  chips 行 + activeSpec.render(scope/payload/api)，api.openTab/closeSelf/toast
  → sonner，useSyncExternalStore 订阅注册表）。**验证全绿**：tsc 0 错、eslint
  --quiet 0 错、vitest 67 文件 381 测试全过、ruff 清、gateway import OK（带
  env）；浏览器实测：dock 打开渲染 hello-tab（mount 时间戳）、git-panel 新任务页
  预期降级「等待工作区」/线程页解析真实工作区（+2−0 统计）、terminal 经 pty 桥
  出 zsh 提示符、RightContextPanel 右栏完整、设置页 Right panel 组已消失。
  截图 h4-dock-open.png / h4-gitpanel.png / h4-terminal.png。剩余 H4-c
  （file viewer/dock 挂点对齐 registerFileViewer 契约面）、H4-d（turnTail）。

- 2026-09-01: **H4-c 完成——betterSidebar service 落地 + 真插件端到端验证**。
  新增 plugins-host/better-sidebar.ts（431 行：契约类型 BsTab/BsOpenTabSeed/
  BsTabDescriptor/BsFileViewerDescriptor 结构对齐 DSH 0.12.0 + 开页存储 + 服务
  对象注册 "betterSidebar"）；panel-dock 扩展为双源（registry panels + bs tabs，
  内容种自动开抽屉对齐 DSH「content open must land in sight」，chips 双行 +
  activeBs/activeId 互斥选择）；services.tsx 导出 getCurrentThread/peekThreadCwd。
  关键发现落 Findings：git-panel 变更行走 **git 相对路径**（porcelain 截断）、
  计划行走绝对路径——toThreadRelPath 按形态分流（相对直通=DSH session-cwd 语义；
  绝对按 cwd 前缀相对化，越界 null → 诚实降级提示）。单测 10 个（探测面/去重/
  生命周期/matchFileViewer/detach/openFile/toThreadRelPath）全过；tsc/eslint/
  prettier 清；vitest 全量 68 文件 390 测试全过。浏览器端到端：verify-thread-1
  git 面板点 README.md（相对）与 计划（绝对）→ dock 抽屉自动展开、chips 就位、
  内建编辑器行号渲染真实内容（截图 h4c-dock-editor.png / h4c-editor-tabs.png）。
  H4 面板类挂点仅剩 H4-d（turnTail，依赖聊天 UI 插槽 + slots/remote 面）。

- 2026-09-01: **H4-d 切片 1 完成——slots 服务 + 聊天 turnTail 挂点 + ctx Proxy**。
  ①module-loader makePluginCtx 改 Proxy：未知属性访问回落 getPluginService——
  T3 插件的 ctx.slots/ctx.sessions/ctx.betterSidebar 属性访问形态一次修好，
  T1 的 ctx.get 不受影响（回归浏览器验证 terminal/git/dock 全在）。
  ②新增 plugins-host/slots.ts：inject(name,factory,label) + register(contribution,
  component?)（priority 升序、快照缓存供 useSyncExternalStore）；contribution
  支持 React component（DSH 形态）与 mount/unmount DOM 钩子（宿主扩展，纯脚本
  插件可用）。③新增 conversation-slots.tsx：ConversationSlotMount 渲染挂点
  （inject(sessionId) 产 props 袋 + SlotErrorBoundary 兜底 + DOM mount memo）。
  ④message-feed assistant 组尾部挂 turnTail（turn=group.id，div 包裹对齐其他
  分支布局）。⑤services.tsx 增 sessions.scope(id).get("remote.<pkg>") +
  remote.$mount 注册表（typert HTTP 传输留切片 2）。⑥locale.ts stub（register/
  bind/t，点路径查字典，缺键回落键名）。⑦金丝雀 hello-turntail（纯脚本 +
  DOM mount）入 manifest。验证：tsc/eslint/prettier 清，vitest 391 全过；
  浏览器新线程发真实消息（MiniMax-M3），助手轮尾渲染 🧩 turnTail[lc_run--…]
  hello from hello-turntail（9s 内），a11y 快照为证。**待切片 2**：typert
  HTTP 传输（remote.fileReview status/apply 落地）、uiConversation 时间线
  store（face={legacy,timeline}）、file-review-tab 实装。

- 2026-09-01: **H4-d 切片 2 完成——typert 传输双端落地（H2 api-remotes 欠账
  闭环）**。runtime 新增 `ctx.typertHost.mount(pkg, handler)`：自动注册
  POST /qilin-plugins/typert/<pkg>（loopback-only、4MiB body、typert 结果信封
  {ok,value}|{ok:false,error}，throwing handler 转信封不 500）；client
  `remote.$mount({package,descriptors})` 按 descriptors 产 HTTP stubs（按
  service 分组挂 serviceRemotes，sessions.scope(id).get("remote.<svc>") 解析，
  sessionId 注入 wire）。关键侦察：file-review server 半需要
  ctx.systemPrompt.section + tools/post-execute 事件——**其实装是 H5 级**（agent
  运行时面），H4 范围交付通用设施。smoke（scripts/smoke-typert.mjs）三例全过：
  mount→route→envelope / throwing→error envelope / GET→405；tsc/eslint/prettier
  清；vitest 391 全过。H4-d 剩余：uiConversation 时间线 store + file-review
  实装——**均依赖 H5**（system-prompt/tools 事件面），随 H5 排期。

- 2026-09-01: **H5 开工侦察**。①T2 契约实拍：kcoder-language entry 仅
  inject ['systemPrompt'] → ctx.systemPrompt.section({name,order,text})→disposer，
  零依赖纯 ESM，order 900 语义（升序拼接近末尾、recency 最高，对抗英文历史
  惯性）；开关由 patch 层 disabled 控制。②QiLin 侧挂点确认：
  qilin/agents/lead_agent/prompt.py 已有 skills system-prompt cache 机制
  （clear/refresh(_async)/per-user 变体）——注册式 section 可循同一模式并入；
  qilin/ports/ 目前是终端类设备 port（posix/windows backend + protocol），尚无
  system-prompt registry；gateway 无 ports 路由。③架构判断：DSH 单进程 cordis
  直注册；QiLin 分进程（Python agent + Node 插件宿主）——language port 设计为
  gateway 注册端口（internal-auth）+ prompt 组装时并入 + Node 桥转发，跨进程
  保持「一切皆 port」。切片 1 设计已定稿（见 Task List H5-a），含验收标准。

- 2026-09-01(再续): **H5-a 完成——语言 port 全链验收通过**。①prompt.py 汇入：
  apply_prompt_template 末尾追加 render_ports_prompt_sections()（全局稳定不破
  prefix-cache；尾随追加正合 order 900 recency 语义；单测 INTEGRATION OK）。
  ②Node 桥：plugins-host-runtime systemPrompt 服务（section→POST announce、
  disposer→DELETE；token 读 env 或 .qilin-internal-token；fire-and-forget）；
  修 TDZ（hostServices 提前引用）与 plugin.mjs 漏 import renameSync 两个既有 bug。
  ③internal_auth 增 matches_internal_secret（常量时间裸 secret 比对）——ports
  路由接受 minted token 或裸 secret（本地插件宿主信任面）。④plugin.mjs add
  kcoder-language（v0.1.1 纯 server 半）成功。**E2E 验收**：gateway 端口确认
  section 注册 → 新线程真实对话 → 简体中文回复（截图 h5a-chinese-reply.png）。
  教训：坑 1——internal token 是签名结构非裸 secret（补 matches_internal_secret
  降级面）；坑 2——E2E 首测提示词自带「可用英文」削弱了被测指令，E2E 提示词
  设计不能与验收断言冲突。

- 2026-09-01(三续): **H5-b 进行中——事件面两端就绪，发射点待改层**。已落：
  qilin/ports/tool_events.py（seq 环 + cursor 快照）+ 中间件 + gateway
  /api/ports/tools/events（cursor 长轮询）+ Node ctx.on("tools/post-execute")
  轮询分发 + hello-toolevents 金丝雀（已 mounted）+ 4 pytest。
  **关键发现（实证）**：lead agent 的 LangGraph 图工厂**不走 langchain
  create_agent 的 wrap_tool_call 组合路径**（site-packages 探针零输出，恢复
  原状）——中间件钩子在该图里静默不分发；wrap 逻辑本身已单测验证正确。
  **下一步（唯一关键步）**：把 publish_tool_event 移到 **qilin/sandbox/tools.py
  的 write_file / str_replace 函数体内**（工具实现层＝一切皆 port 的正确发射点，
  图装配无关），入参即 path/前后文；发射后金丝雀日志 [hello-toolevents] tool:
  即为验收。注意：工作区写路径是 sandbox /mnt/user-data/workspace/...（隔离挂
  载），path 归一化到 thread workspace 需在发射层处理。

- 2026-09-01(四续): **H5-b 完成——tools/post-execute 事件面全链验收**。中间件
  补 awrap_tool_call（委托 wrap_tool_call）后全链打通：真实 write_file → 事件环
  单事件（真实 callId/threadId/sandbox 路径）→ Node 轮询 → 金丝雀 decision:accept。
  **排障三课**：①lead graph 不走 create_agent wrap_tool_call 组合的假设被证伪——
  真因是运行时只走异步工具路径，同步中间件缺 awrap 即 NotImplementedError 且
  **弄坏工具执行**（agent 亲口报告）；②E2E 完成判定不能匹配侧栏消息列表文本
  （旧线程标题常驻误匹配）；③background web-demo 重复启动会撞 .next/dev/lock，
  重启前必须 lsof 清端口。双发射去重：中间件（带 callId）为唯一源，sandbox 函数
  层发射已撤。待续：H5-c skills port；H5-d file-review 实装（事件面已备，补
  before/after 内容捕获与 uiConversation）。

- 2026-09-01(五续): **H5-c 完成——skills port 全链验收通过**。设计抉择：不做
  内存注册表，而是经 write_custom_skill 存储原生 API 把插件技能包**物化为
  custom 命名空间技能**（custom 默认 enabled；原生获得 describe_skill/read_file/
  斜杠激活/skill_evolution 全链，零 skills 子系统改动）。实现：①ports.py
  POST /api/ports/skills（SKILL.md + templates/scripts/references/assets 资源
  白名单校验）+ DELETE /skills/{name}；②runtime ctx.skills.register 桥（SKILL.md
  frontmatter 由 manifest 元数据组装 + resourceBase 递归打包）；③plugin.mjs 两修
  （readdirSync import 漏 + server 半内容目录随装分发——kcoder-skills 的
  skills/ 目录即由此入库）。**验收链**：注册日志 37 runtime skills → storage
  load_skills(enabled_only=True) 含全部样例 → 真实对话 describe_skill 查询
  planning-with-files 成功（24s）。剩余：H5-d uiConversation + file-review
  （事件面/语言面已备）。

## Errors
- 2026-09-01(续): **H5-a 第一砖落地——语言 port 注册端**。qilin/ports/system_prompt.py（线程安全注册表：upsert by name/order 升序 render_sections）+ app/gateway/routers/ports.py（/api/ports/system-prompt/sections POST/GET/DELETE，X-QiLin-Internal-Token 校验）+ app.py 接线 + 3 pytest 全过 ruff 清。**下一步**：①prompt 组装汇入（grep get_skills_prompt_section 消费点旁并入 render_sections()）②Node 桥 ctx.systemPrompt.section→POST（token 读 .qilin-internal-token）③kcoder-language 安装 + 中文回复验收
