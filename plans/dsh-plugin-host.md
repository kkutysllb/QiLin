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

### H2 Typert 能力桥
- [ ] gateway 实现 api-remotes 协议端点（翻译层，南向接 QiLin 现有 API）
- [ ] fs → files API（已有）、pty → ports（已有）、git → 新增评估

### H3 生命周期管理
- [x] CLI `scripts/plugin.mjs`：add（本地 dsh-plugins 形态目录）/ remove / upgrade / list——文件分发（client→public、server+vendor→plugins/ 非公开区）+ manifest 原子重写；与 DSH 官方同构（安装后需重启 web-demo）
- [ ] semver + dsh 版本兼容声明检查
- [ ] 插件管理面板（清单/启停/卸载）

### H4 面板类挂点铺开
- [ ] sidebar tab / file viewer / dock 挂点对齐 0.1.2-alpha.2 契约
- [ ] conversation turnTail 链（后置，依赖聊天 UI 插槽对齐）

### H5 agent 运行时 port 化（远期）
- [ ] language（system-prompt section）/ skills 按「一切皆 port」封装为 port 型插件

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
- 2026-08-31: **H3 生命周期 CLI 完成**(commit d4b6dec):scripts/plugin.mjs
  add/remove/upgrade/list——本地 dsh-plugins 形态目录一键安装(client→public、
  server+vendor→plugins/ 非公开区)、manifest 原子重写、remove 双半清净、source
  路径记录;与 DSH 官方同构(安装后重启 web-demo)。实测:remove→add→list 全链
  + 浏览器 smoke(三插件并存,git-panel 数据渲染)。管理面板与 semver 兼容检查
  留待后续;剩余主线:H2 Typert 桥泛化、H4 conversation 挂点、H5 port 化。

## Errors
