# OpenKylin 桌面端原生产品设计

- 日期：2026-10-07
- 状态：实施中——M0–M3 已实施（见 §14），M4 打包发布未做
- 上游基线：QiLin 3.1.1（tag `v3.1.1`，commit `d9dc36d499…`，独立版本线；历史锚 fdca446ccd…→b2d18618fc…，2026-10-08 对齐到 tag 第四次重发）
- 参考实现：dsh（deepseek-harness 0.2.1-alpha.1）`apps/desktop` + `apps/desktop-host`
- 取代关系：本设计取代 [2026-09-16 设计](2026-09-16-openkylin-desktop-design.md) §11 末条修订确立的 **host & sidecar 套壳形态**——那是"shell 窗口 loadURL 侧车 HTTP 页面"的浏览器载体；本设计把桌面端升级为**真正的桌面端产品**：自有 Electron 壳 + 引擎宿主子进程 + 私有协议承载 + 完整产品链（打包完整性、更新、恢复、插件管理）。同源一致性、品牌注入、仓库边界等原则全部沿用。

## 1. 背景与目标

### 1.1 现状的局限（为什么套壳不够）

当前 `desktop/` 壳（sidecar 形态）把 QiLin 产品面 CLI 当黑盒：shell 窗口 `loadURL(侧车 URL)`，桌面与 Web 的差异只剩启动页与自绘标题栏。它无法做到：

1. **产品级进程治理**：无 desktop-runtime.json 运行时完整性、无任务锁交接、无崩溃报告/致命恢复、退出不检查活动任务。
2. **资源面收口**：renderer 直接持有指向侧车 loopback origin 的完整 URL 与 cookie 流转，壳只是"带沙箱的浏览器"，静态资源与 API 全部经 HTTP 取自侧车。
3. **发布完整性**：无全树哈希封盘、无签名前后门禁、更新只覆盖 electron-updater generic feed 的最小面。
4. **上游已变**：QiLin 3.1.x 移除 `apps/desktop` 后，"借用上游桌面形态"已不可能；但上游在 web client 侧**保留了桌面启动门与 transport 钩子**（§4），这正是原生桌面形态的官方接入缝——上游产品决策档案（`.agents/notes/archived/architecture/2026-08-25-electron-desktop-packaging-and-updates.md`、`2026-09-10-desktop-web-wrapper.md`）记录的成熟形态是 **Electron 壳 + 私有 desktop-host 子进程 + 共享 Web profile + 认证 loopback**，本设计即在该缝上重建此形态。

### 1.2 参考：dsh 桌面端的已验证架构

dsh 桌面端（约 `apps/desktop` 8.2k 行 + `apps/desktop-host`）的核心结构：

```
Electron 主进程（壳）
  ├─ dsh-app:// 特权协议：静态资源直读磁盘 dist + 动态请求认证反代到宿主
  ├─ spawn Electron-as-Node（ELECTRON_RUN_AS_NODE）跑 desktop-host 子进程
  │    stdio ['ignore','pipe','pipe','ipc'] —— Node 内建 IPC JSON 消息
  ├─ 宿主内 runProfile 程序化 boot 引擎（cordis 同进程装配，不经 CLI）
  │    loopback 127.0.0.1:0 + launch token；ready{url, injections} 回传
  └─ renderer（共享 Web client dist）：boot 门等 IPC 注入 → 注入表落位 → 应用启动
```

三条不变量（摘自参考实现，本设计全盘沿用）：

1. **Web 永远跑在壳自有 scheme 后面**：静态资源与动态 API 由同一 `protocol.handle` 分流，认证 cookie 只存在于主进程，renderer 拿不到宿主凭证。
2. **后端是可被壳杀死/重启的短生命周期子进程**：安装/退出/恢复都先做"任务锁 → 凭据清理 → 优雅停机"三步交接。
3. **发布完整性在构建期封盘**：签名的全树 sha256 清单，运行期只校验不比较。

### 1.3 目标

1. 基于 QiLin 3.1.1 构建 macOS arm64 桌面产品：自有壳、引擎宿主子进程、私有协议承载共享 Web client。
2. 工作区不暴露可被第三方进程使用的服务面：宿主仅监听 `127.0.0.1:0`（随机 loopback 端口 + launch token），壳不开放任何额外监听。
3. 完整桌面产品链：desktop-runtime.json 运行时完整性、崩溃报告与致命恢复、退出/更新前任务检查、electron-updater 自动更新（GitHub Releases）、内置 pnpm 插件管理。
4. Web 与 Desktop 继续共享同一份 `@qilin/web-frontend` 构建物与同一套品牌主题（web-brand 层原生生效），摘要门禁不变。
5. 中文品牌体验沿用现有资产（启动页、自绘标题栏、中文文案、朱砂主题）。

### 1.4 非目标（首版裁剪）

- 不做 portless 自定义字节管道传输（上游产品决策已明确否决，见 §2.3）。
- 不做 dsh 的 Platform 嵌入视图（deepseek 账号体系）与 mandatory-update 私有策略后端。
- 不做 Office/LibreOffice 技能与 primary-runtime 重载荷（dsh skill-office 专属）。
- 不做独立 Welcome/凭据窗：登录与初始化走 Web client 自有的 `/login`、`/setup` 页面（`packages/bundle/web-app` `PUBLIC_DOCUMENTS`），浏览器用户同款流程。
- 首版仍以 macOS arm64 为唯一发布目标。

### 1.5 硬约束（沿用 2026-09-16 设计 §1.2 全部条款）

在此之上新增：

1. 产品仓继续**零 npm 依赖**；宿主入口以"物化进运行树"或"绝对 file URL 导入"消费 `@qilin/*` 包（§6.2），不得在产品仓引入 node_modules。
2. 任何对 QiLin 契约的引用集中收敛在 `desktop/main/qilin-contract.mjs`（现有单一适配点原则升级为"契约 + 接入缝"两层，见 §4）。
3. 升级上游时补丁失配、运行时清单失配、Web/Desktop 摘要不一致，任一命中即 CI 失败。

## 2. 总体方案

### 2.1 三进程模型

```
OpenKylin Desktop（Electron）
│
├─ 主进程（壳，desktop/main）
│    ├─ qilin-app:// 特权协议（standard/secure/supportFetchAPI/stream/codeCache）
│    │    ├─ qilin-app://shell/*   → 壳自有页面（splash、恢复、更新对话框）
│    │    ├─ qilin-app://app 静态  → 直读运行树 @qilin/web-frontend/dist
│    │    │     （index.html 注入 __QILIN_BOOT_READY__ deferred）
│    │    └─ qilin-app://app 其余  → 认证反代到宿主 loopback（cookie 壳侧注入）
│    ├─ ws://127.0.0.1/* onBeforeSendHeaders：origin 改写 + cookie 注入
│    ├─ Node IPC 管理宿主子进程（ready/fatal/shutdown-complete/quit-inspection/update-tasks）
│    └─ preload 暴露 qilinDesktopBoot 桥 + 受控产品 API
│
├─ 宿主子进程（desktop/host，Electron-as-Node）
│    ├─ runProfile({ profile: 'qilin', args: ['--no-open','--port','0'] })
│    │    程序化 boot：base + web-app + web-brand（产品面，cordis 同进程）
│    ├─ ctx.webServer.collectIndexInjections() + ctx.connection.authenticatedUrl()
│    ├─ 内置 pnpm packageManager 注入（插件安装事务）
│    └─ quit-inspection / update-tasks（活动任务与定时任务检查）
│
└─ renderer（共享 Web client，qilin-app://app 载体）
     ├─ boot：qilinDesktopBoot.ready() → __QILIN_TRANSPORT__={ownsHost:true, streamBaseUrl}
     │    → applyIndexInjections → resolve __QILIN_BOOT_READY__
     └─ 运行期：fetch /api/* 走协议反代；流式走 streamBaseUrl 的 WS mux
```

### 2.2 与现网 sidecar 形态对照

| 维度 | 现网 sidecar 套壳 | 本设计（原生桌面） |
|---|---|---|
| 引擎进程 | CLI 子进程黑盒（`node bin.js --port N`） | 宿主进程内程序化 boot（`runProfile`），可注入 packageManager、可加应用级插件 |
| 工作区承载 | shell 窗口 `loadURL(http://127.0.0.1:port)` | `qilin-app://app` 私有协议；静态资源壳直读，动态请求壳反代 |
| renderer 可见凭证 | 完整就绪 URL（含 token）在导航历史中流转 | cookie 只在壳主进程；renderer 只见 `qilin-app://app` |
| 端口 | 稳定记忆端口（cookie 跨启动复用） | 随机 loopback 端口（cookie 由壳托管，无须稳定端口） |
| 运行时完整性 | 无 | desktop-runtime.json 全树 sha256，启动校验 |
| 崩溃/恢复 | 启动页重试 + 日志尾部 | crash-report + fatal-recovery（禁用插件重试）+ 渲染进程崩溃上报 |
| 退出 | SIGTERM → 宽限 → SIGKILL + watchdog | + quit-inspection（活动任务/定时提醒检查）+ 任务锁 |
| 更新 | electron-updater generic feed | 同前 + 更新前任务准入锁与宿主优雅交接、update journal |
| 插件管理 | 物化脚本（terminal-builtin） | 宿主内置 pnpm 事务 + desktop profile 隔离 + 禁用插件恢复 |

### 2.3 关键决策：认证 loopback 反代，而非 portless 私有管道

三个候选在调查中均落到证据：

- **portless 自定义字节管道**：上游产品决策档案明确否决——"Shared HTTP gives up the portless guarantee"的反面教训是：portless 管道要求把 web client 的 RPC/SSE/WS 三条通路全部改写为私有协议，且 `createSharedFetchHandler`/`wireStream` 虽然存在（`packages/api/gateway/src/index.ts:206`、`packages/client/connection/src/rpc-host.ts:170`），但 `webServer` 缺席时 `frontend-static`/`open-in-app`/`preview-media`/文件上传等都要假 webServer 适配，改造面大、收益只有"端口不存在"这一点。
- **进程内直连 gateway（webworker-runtime 模式）**：技术可行（`ClientTransportHooks.rpc/fetch/openStream` 全替换），但等于自建 Request↔消息编解码桥，且要为宿主进程与 renderer 的每类消息做背压与保序——重复造 upstream 已有的 loopback 栈。
- **认证 loopback 反代（本设计，dsh 已验证形态）**：宿主照常挂 webServer（`listenOn: settle`，127.0.0.1:0），壳用特权协议把静态资源收归本地、动态请求带认证转发。`ownsHost: true` 语义就是为此设计（`packages/client/connection/src/client/index.ts:98-104`）。renderer 的 fetch/WS 代码零改动；安全边界由壳的 origin 校验 + cookie 托管达成。

结论：**选认证 loopback 反代**。安全等价（无外部暴露、renderer 无凭证），工程面最小，且与上游"共享 Web profile runner"的桌面形态同构——升级时漂移最小。

## 3. 运行时架构

### 3.1 宿主子进程（desktop/host）

- **形态**：Electron 可执行以 `ELECTRON_RUN_AS_NODE=1` 运行宿主入口，`stdio: ['ignore','pipe','pipe','ipc']`（第 4 项启用 Node 内建 IPC）；`--expose-internals` 保留（HMR loader 兼容）。参考 dsh `apps/desktop/src/host-process.ts:186-201` 与 `apps/desktop-host/src/index.ts`（仅约 120 行，形状可直接移植）。
- **引擎 boot**：调 `runProfile`（`apps/cli/src/profile-boot.ts:254`，签名与 dsh 同源）——`profile: 'qilin'`（产品面 = base + web-app + web-brand，`packages/boot/app-boot/src/profile.ts:246-265`）、`args: ['--no-open', '--port', '0']`；`packageManager` 注入内置 pnpm（`process.execPath` + `--expose-internals` + pnpm.mjs，对应 dsh `desktop-host/index.ts:31-41`）。boot 返回 cordis `ctx`，宿主可在其上追加应用级插件（首版无）。
- **IPC 小协议**（宿主 → 壳）：`booting`、`ready{url, injections}`（`ctx.connection.authenticatedUrl()` + `ctx.webServer.collectIndexInjections()`，`packages/host/webserver/src/index.ts:435`）、`fatal{message, diagnostic}`（64KiB 诊断）；（壳 → 宿主）：`shutdown`、`quit-inspection`、`update-tasks{lock|unlock|inspect}`（带 requestId 的请求-响应 + 截止时间）。消息形状运行时校验（移植 dsh `host-process.ts:53-91` 的守卫风格）。
- **任务检查**：`quit-inspection` 查活动会话/后台任务/定时提醒（QiLin 侧经 `ctx` 的 agents/sessions/jobs 服务实现，对应 dsh `quit-inspection.ts` 的 waterfall 语义）；`update-tasks` 在锁定态对新 `connection/request` 返回 503、已准入请求 drain（对应 dsh `update-tasks.ts:16-62`）。
- **关闭纪律**：`shutdown` → 10s → SIGTERM → 5s → SIGKILL；优雅退出要求 exitCode 0 + 收到 `shutdown-complete`（移植 dsh `host-process.ts:288-308`）；QiLin 侧进程收尾用 `apps/cli/src/process-shutdown.ts`。

### 3.2 壳（Electron 主进程）

- **协议三路由**（`protocol.handle`，特权 scheme `qilin-app`）：
  1. `qilin-app://shell/*`：壳自有页面（splash/恢复/更新对话框），本地 `desktop/renderer`；
  2. `qilin-app://app` 的 `/`、`/index.html`、`/assets/*`、favicon：直读运行树 `node_modules/@qilin/web-frontend/dist`（QiLin 侧 dist 锚点同款：`packages/bundle/web-app/src/index.ts:181-189`），index.html 注入 `<script>globalThis.__QILIN_BOOT_READY__ = Promise.withResolvers()</script>`；
  3. 其余 `app` 路径：`forwardWebRequest` 反代宿主 loopback——校验 Origin 必须为 `qilin-app://app`，剥离 host/origin/cookie，注入宿主认证 cookie，流式透传，丢弃 `set-cookie` 与逐跳头；`/plugins/*` 强制 `no-store`（移植 dsh `web-document.ts:43-93`，包名无关）。
- **认证兑换**：宿主 ready 后壳用 manual-redirect fetch 访问 `authenticatedUrl` 换取签名 cookie（QiLin 的 token→HMAC cookie 流程：`packages/client/connection/src/browser-auth.ts`，cookie 名 `qilin-auth-<sha256(host)>` 绑定 authority）；cookie 存主进程，永不下发 renderer。
- **WS 头改写**：`onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] })`——仅主窗、origin 强制 `qilin-app://app`、附认证 cookie（流式 mux `/api/remote.mux` 的载体；`streamBaseUrl` 来自 boot 注入）。
- **boot 门接线**：preload（`qilin-app://app` origin 门控）暴露 `window.qilinDesktopBoot = { ready, failed }`——`ready()` 经 IPC 返回宿主 `ready` 消息的 `{injections, streamBaseUrl}`。client 侧（`apps/web/src/main.ts:5-36`，已验证）自行设置 `__QILIN_TRANSPORT__ = { ownsHost: true, streamBaseUrl }`、按序落注入表、resolve 闸。**注意桥名与闸名是上游契约**（`qilinDesktopBoot` / `__QILIN_BOOT_READY__`），登记进 qilin-contract。
- **窗口**：主工作区窗（现有品牌化形态：hiddenInset + 自绘标题栏注入保留）；close → hide（mac 常驻语义，退出走显式退出 + quit-inspection）；单实例锁；splash 沿用现有 `desktop/renderer/splash.html`（qilin-app://shell 载体，等待宿主 ready，失败态有重试/复制诊断）。
- **sender 校验**：所有 IPC handler 校验 `event.senderFrame.url` 为 `qilin-app:` + hostname 白名单（`shell`/`app`），产品 API 仅主窗主帧（移植 dsh `assertDesktopSender`/`assertProductSender` 模式）。
- **导航与弹窗**：`will-navigate` 仅放行 `qilin-app:` 同源；`setWindowOpenHandler` 全 deny + `shell.openExternal`；权限请求全拒（沿用现网壳策略，参考 dsh 白名单形态）。

### 3.3 数据与 home

- `$QILIN_HOME`（默认 `~/.qilin`）语义不变：会话、凭据、插件与 CLI/浏览器共享。侧车时代的 `desktop-sidecar-port.json` 端口记忆**废弃**（随机端口 + 壳托管 cookie 后无此需要）；`session_projcache` 投影缓存继续作为自绘标题栏工作区解析的数据源（`desktop/main/workspace.mjs` 不变）。

### 3.4 插件管理

- **desktop profile 隔离**：壳托管专用 profile 目录（`$QILIN_HOME/profiles/qilin` 沿用产品面锚），装载 bundles 的运行树与用户插件目录分层；所有 profile 写操作走 PID 文件锁（移植 dsh `project-manager.ts:93-130`）。
- **内置 pnpm**：宿主以 `process.execPath --expose-internals pnpm.mjs` 注入 `packageManager`；node-bin 垫片（`DSH_DESKTOP_NODE_EXECUTABLE` 同款包装器）随包发布，保证原生模块（node-pty 等）构建许可可控。
- **恢复**：fatal-recovery 的"禁用第三方插件并重试" = profile 锁下 `sanitizeProfile` 备份补丁层并禁第三方 bundle（对应 QiLin `initProfile`/profile 工具族，`packages/boot/app-boot/src/profile.ts`）。
- **内置终端**：`@kkutysllb/dsh-terminal` 继续经物化脚本装进 profile 私有锚（`scripts/lib/terminal-builtin.mjs` 机制不变）。

### 3.5 崩溃与恢复

移植 dsh 三件套（代码自包含、仅依赖 node:fs/crypto）：

- **crash-report**：`~/Library/Logs/<name>/crash-<UTC>-<source>.log`（source ∈ host/web-boot/renderer/main），事实头 + `util.inspect` 全错 + 宿主 64KiB 诊断 + renderer console 尾巴，保留最新 10 份；
- **fatal-recovery**：每进程首个 fatal → 写报告 → 原生恢复框（退出/重启/禁用插件重试），`EADDRINUSE` 专文案；恢复期间阻止重复入场；
- **上报点**：宿主 fatal、主窗 `did-fail-load`/`preload-error`/`render-process-gone`、主进程顶层 catch、renderer `qilinDesktopBoot.failed()`（对应 dsh `bootFailed`，source='web-boot'）。

### 3.6 更新

- electron-updater generic provider → 本仓 GitHub Releases `releases/latest/download`（现有 `OPENKYLIN_UPDATE_ORIGIN` 机制不变）；`autoDownload=false`，check/download/install 三段确认。
- **安装前交接**：等命令空闲 → `update-tasks('inspect')` → 确认 → `update-tasks('lock')` → 宿主优雅停机 → `quitAndInstall`；失败回滚解锁并可重启宿主复原文档（移植 dsh `main.ts:584-638` 编排）。
- update journal（JSONL、脱敏、白名单动作）作为可选项随包启用。

## 4. QiLin 3.1.1 接入缝清单（已验证）

| # | 接入缝 | 位置（QiLin 3.1.1） | 用途 |
|---|---|---|---|
| 1 | `runProfile` 程序化 boot | `apps/cli/src/profile-boot.ts:254`（`packageManager` 注入 :301） | 宿主进程内装配引擎 |
| 2 | `PROFILE_TEMPLATES['qilin']` = base + web-app + web-brand | `packages/boot/app-boot/src/profile.ts:246-265` | 产品面 bundle 组合 |
| 3 | 桌面启动门：`qilinDesktopBoot.ready()/failed()` | `apps/web/src/main.ts:5-36`（**上游契约，桥名必须一致**） | renderer boot 编排 |
| 4 | boot 闸 `__QILIN_BOOT_READY__` deferred | 同上 + `packages/client/web/src/boot.ts:57-75` | 壳在 index.html 注入 |
| 5 | `ClientTransportHooks` / `__QILIN_TRANSPORT__`（`ownsHost`/`streamBaseUrl`） | `packages/client/connection/src/client/index.ts:79-113` | transport 语义（本设计只设 ownsHost+streamBaseUrl，不改 RPC 载体） |
| 6 | `collectIndexInjections()` | `packages/host/webserver/src/index.ts:435` | 插件 index 注入表随 ready 回传 |
| 7 | `authenticatedUrl()` / token→HMAC cookie | `packages/client/connection/src/browser-auth.ts`（cookie 绑定 authority） | 壳侧认证兑换 |
| 8 | webServer 路由语义（register/registerUpgrade/fallback） | `packages/host/webserver/src/index.ts` | 宿主 loopback 服务面 |
| 9 | WS mux `/api/remote.mux` + `$events` | `packages/api/gateway/src/stream-protocol.ts:7` | 流式响应载体（streamBaseUrl 指向宿主） |
| 10 | dist 锚点 `require.resolve('@qilin/web-frontend')/dist` | `packages/bundle/web-app/src/index.ts:181-189` | 壳直读静态资源 |
| 11 | 进程收尾 `process-shutdown` | `apps/cli/src/process-shutdown.ts` | 宿主优雅停机 |
| 12 | entry 路径 `/workspace`（`WEB_ENTRY_PATH`） | `packages/client/connection/src/web-entry.ts:9` | 协议层 `/`→index 与入口 URL 对齐 |

## 5. dsh 能力取舍

| dsh 能力 | 处置 | 说明 |
|---|---|---|
| host-process / desktop-host 小协议 | **移植** | 包名替换为 `@qilin/*`，消息守卫照搬 |
| web-document（静态 + 反代 + 认证） | **移植** | scheme 改 `qilin-app`，dist 锚点换 @qilin |
| runtime-tree / desktop-runtime.json | **移植** | 全树 sha256 + 版本绑定，代码自包含 |
| crash-report / fatal-recovery / startup-error | **移植** | 原样；禁用插件回调接 QiLin profile sanitize |
| quit-confirmation / quit-inspection / update-tasks | **移植** | 任务检查改用 QiLin ctx 服务 |
| update-coordinator / schedule / journal / http-executor | **移植** | 去 mandatory-update 依赖 |
| single-instance / 窗口修饰 / close→hide | **移植** | 现有壳已部分具备 |
| electron-builder 配置骨架 / prepare 流水线 / node-bin 垫片 | **改造** | 包集合换 `@qilin/*`；无 dsh 私有 tarball 源，改从品牌化 checkout 物化（§6） |
| Welcome 窗 + 凭据 RPC | **裁掉** | 登录/初始化走 web client `/login`、`/setup` |
| Platform 嵌入视图 / platform-session | **裁掉** | deepseek 账号体系专属 |
| mandatory-update-policy | **裁掉** | dsh 私有策略后端（code 40005） |
| office-engine / primary-runtime 重载荷 | **裁掉** | 首版不带 LibreOffice/Python 载荷 |
| browser-guests（webview 租约） | **暂缓** | 以 QiLin web client 是否使用 webview 而定；首版 `setWindowOpenHandler` 全 deny 即可，列为后续加固 |

## 6. 打包与发布

### 6.1 包结构

```
OpenKylin Desktop.app
├─ Contents/Resources/app.asar          # 壳：main/preload/renderer + package.json
├─ Contents/Resources/app.asar.unpacked  # 原生件（如需）
└─ Contents/Resources/runtime/
     ├─ desktop-runtime.json            # 全树 sha256 清单（封盘生成）
     ├─ node-bin/                       # Electron-as-Node 垫片（--expose-internals 包装）
     ├─ pnpm/                           # 内置 pnpm
     └─ qilin/                          # 品牌化 QiLin 运行树（node_modules 形态）
          ├─ node_modules/@qilin/cli            # bin.js（宿主 runProfile 入口依赖）
          ├─ node_modules/@qilin/*              # base/web-app/web-brand/… 全依赖闭包
          ├─ node_modules/@qilin/web-frontend/dist  # 壳直读的静态资源
          └─ openkylin-host/                    # 宿主入口（物化，见 6.2）
```

### 6.2 构建流水线（演进现有脚本）

1. `fetch-upstream` + `apply-branding`（现有，不变）→ 品牌化 checkout；
2. **物化运行树**（新增，对应 dsh `prepare-dsh`）：以 checkout 的 pnpm 冻结闭包物化 `runtime/qilin/`（`--prod --frozen-lockfile`，核心包只认 checkout 本地来源，防 registry 漂移）；宿主入口（`desktop/host` 的 ESM 文件）物化到 `runtime/qilin/openkylin-host/`——宿主代码对 `@qilin/*` 的导入经相对运行树解析（或绝对 file URL），产品仓保持零依赖；
3. `writeDesktopRuntime` 封盘（全树 sha256/bytes/executable 清单 + release 版本绑定）；
4. electron-builder 打包（asar + extraResources runtime/ + mac hardened runtime/entitlements/notarize，沿用现有签名变量与 `QILIN_DESKTOP_APP_ID`）；
5. `verifyDesktopRuntime`（afterPack 重算全树哈希）+ 现有 `verify-web-desktop-sync`（壳直读的 dist 与 Web 交付面同摘要）+ `check-source-leakage`；
6. 产物：DMG/ZIP/blockmap/latest-mac.yml/SBOM/manifest → GitHub Release（现有 release.yml 演进）。

### 6.3 verify-artifact 契约改写

现有 `scripts/verify-artifact.mjs` 面向 `desktop-runtime.json`（上游 3.0.x 形态）校验；改为校验本设计 §6.1 的自有清单（schema 换 `release{version, qilinCommit, hostProtocolVersion, nodeVersion, pnpmVersion}` + `files[]`），`upstream/qilin.lock.json` 仍是版本绑定来源。

## 7. 安全边界

沿用三不变量（§1.2），落成可测断言：

1. renderer 进程无 Node、无原始 IPC 之外的能力（sandbox + contextIsolation + 无 nodeIntegration，全窗强制）；
2. IPC 仅接受 `qilin-app:` origin 白名单内的 senderFrame；产品 API 仅主窗主帧；
3. 任何监听 socket 仅 `127.0.0.1`（宿主，随机端口，launch token 保护）；壳不新增监听；renderer 无宿主 cookie（cookie 兑换与注入全部在主进程）；
4. 导航仅 `qilin-app:` 同源，外链 `shell.openExternal`；window.open 全 deny；权限请求全拒；
5. 反代仅转发 Origin 为 `qilin-app://app` 的请求，剥离逐跳头与 `set-cookie`；
6. 运行时清单失配 = 拒绝启动（安装损坏路径，进 fatal-recovery）。

## 8. 品牌与中文体验

- 启动页（splash）沿用现有中文品牌页，载体改 `qilin-app://shell/splash.html`；等待宿主 ready，`fatal` 消息驱动失败态（重试 = 重启宿主；复制诊断 = 状态快照 + 宿主日志尾部）。
- 自绘标题栏（KCoder 移植）与工作区解析继续工作在 `qilin-app://app` 文档上；配色探针随 §README 跟进项迁 `--qilin-*` 词汇表。
- 工作区主题走上游 web-brand 层（`ui-brand` + `ui-theme-brand`）+ `shared-web-branding.patch`，与 Web 端同源不变。
- 菜单/关于页/更新提示中文文案随壳实现；关于页显示 OpenKylin 维护关系、上游 commit、构建时间、签名状态。

## 9. 测试与验收

1. **产品层测试**（现有 `node --test` 演进）：锁文件/品牌清单 schema、补丁应用、哈希工具不变；新增宿主 IPC 小协议守卫、runtime-tree 读写与篡改拒绝、web-document 路径穿越/Origin/逐跳头剥离、boot 注入表形状。
2. **壳行为测试**：单实例、close→hide、quit-inspection 分支（有/无活动任务）、fatal-recovery 三按钮路径、更新三段确认与任务锁交接。
3. **同源门禁**：`verify-web-desktop-sync` 改比对"壳直读 dist ↔ Web 交付 dist"；`webBundleSha256` 全等语义不变。
4. **macOS smoke**：打包 → `verifyDesktopRuntime` → 启动后仅存在 `127.0.0.1` 随机端口监听、renderer 进程拿不到宿主 cookie（`session.defaultSession` cookies 过滤断言）→ 崩溃恢复与禁用插件重试 → 退出无孤儿进程（watchdog 保留）。
5. **双端同场景 e2e**（README 跟进项既有条目）在新形态上补齐。

## 10. 迁移路径

| 阶段 | 内容 | 现有资产的处置 |
|---|---|---|
| M0 锁升级 | 3.0.0 → 3.1.1：锁文件（仓库 URL/commit）、补丁重生成（`--dsw-*`→`--qilin-*` 影响） | 现有 sidecar dev 流程在 3.1.1 上先行验证 |
| M1 宿主 | `desktop/host` 入口 + IPC 小协议 + runProfile 接线；dev 模式先以"Electron-as-Node 宿主 + 壳 loadURL"灰度（宿主就绪即原生 ready，但承载仍走 URL） | `qilin-manager.mjs` 保留为 M1 的兜底服务面管理器 |
| M2 协议承载 | `qilin-app://` 三路由 + 认证反代 + boot 门 + preload 桥；splash 迁 shell 载体 | `windows.mjs` 的 loadURL 路径降级为 `OPENKYLIN_DEV_BARE=1` 的调试逃生口 |
| M3 产品链 | runtime-tree 封盘/校验、crash/fatal/quit/update 移植、内置 pnpm 插件管理 | terminal-builtin 物化机制并入宿主启动前准备 |
| M4 打包发布 | electron-builder 配置 + prepare 流水线 + release.yml 演进 + 签名公证 | `build-desktop.mjs`（上游 package 脚本驱动）退役，改自有打包编排 |

每阶段独立可验收；M2 完成即达成"非套壳"的产品形态，M4 完成即达成发布闭环。

## 11. 风险与控制

| 风险 | 控制 |
|---|---|
| 上游独立线快速演进，接入缝漂移 | §4 清单进 qilin-contract 单点；锁 + 补丁 SHA + 摘要门禁失败即停 |
| `@qilin/*` 闭包物化体积/原生件 | 冻结 lockfile + 只认 checkout 本地来源；原生构建许可白名单（node-pty 等） |
| `qilinDesktopBoot`/`__QILIN_BOOT_READY__` 契约变动 | 契约测试（§9.1）读取上游源码形状断言；失配 loud fail |
| 反代语义缺口（上传/大文件/WS 断线） | 流式透传保留 body/signal/duplex；smoke 覆盖上传与 mux 重连 |
| Electron-as-Node 的 fuses 依赖 | electronFuses.runAsNode 保持开启并在打包后校验 |
| 签名后修改资源破坏公证 | 封盘/哈希/注入全部在签名前完成，签名后只读校验（沿用既有门禁） |

## 12. 关键决策记录

- **形态**：选"自有壳 + 宿主子进程 + 认证 loopback 反代"，而非继续 sidecar 套壳（缺产品链）或 portless 私有管道（上游决策已否决、改造面大）或 SDK 面承载（协议仅 3 方法，能力差一个网关）。
- **引擎装配**：`runProfile` 程序化 boot 产品面（`qilin` profile），不经 CLI 子进程；与 dsh desktop-host 同构，升级漂移最小。
- **传输语义**：renderer 侧只设 `__QILIN_TRANSPORT__ = { ownsHost: true, streamBaseUrl }`，不改 RPC/fetch/openStream 载体——上游桌面钩子的设计意图即"共享 HTTP 栈 + 壳 ownsHost"。
- **认证**：cookie 壳侧托管（兑换/注入/剥离全在主进程），替代侧车时代的稳定端口记忆——随机端口 + 壳托管同样保证凭证生命周期，且缩小 renderer 可见面。
- **裁剪**：Welcome/Platform/mandatory-policy/office 首版不做；登录初始化走 web client 自有页面，与浏览器用户同流程。
- **宿主入口物化**：宿主代码随运行树物化（非产品仓依赖），与内置终端插件同一模式，保持仓库零 npm 依赖约束。

## 13. 实施期发现（2026-10-07，M0–M2 联调实证）

M0–M2 已实施并真机验证（锁 3.1.1 → 补丁重生成 → dev 全链路 → 登录文档渲染）。以下为联调中实证、并已落入实现的修订：

1. **账号门是产品面既有形态**：3.1.x 产品面启用账号会话门——`/api` 与 index 文档需要账号会话，设备 cookie（token 兑换）只证明"本进程启动者"。因此壳实现 **cookie 罐**：认证兑换的设备 cookie + 反代响应捕获的账号会话 cookie（登录流 set-cookie 不丢弃而是进主进程罐），全部不进 renderer（`document.cookie` 恒空已实测）。未登录时壳按 `/api/auth/status` 探针结果进登录文档（`/login` = auth.html），登录成功后 client 自行进入 `/workspace`。
2. **文档路由镜像宿主**：公开文档是独立文件——`/` = landing.html、`/login` = auth.html、`/workspace` = index.html（壳注入未决 boot 闸）。壳若把 `/` 当 SPA 入口服务 index.html 会跳过宿主的登录语义。
3. **Electron 必须钉死精确版本**：引擎的原生加载器（node-addon-require-builtin）按 Electron 精确指纹校验（当前支持 43.0.0 / 44.0.0 / 45.0.0-alpha.6）——`^44` 装到 44.6.0 会在宿主 boot 时被拒。dev 流程钉 `electron@44.0.0`（`OPENKYLIN_ELECTRON_SPEC` 可覆盖）。
4. **`runProfile` 的 environment 入参是分层环境快照**（`loadLayeredEnv('qilin')`，apps/cli/src/bin.ts:47 同款）：裸 `process.env` 没有 `.get`，宿主 boot 在代理解析处即炸。
5. **splash → shell 窗口切换顺序**：必须先建 shell 窗口（隐藏态）再关 splash——反过来的 await 空窗期会落进 `window-all-closed` 使整壳静默退出。
6. **M3 新增事项**：cookie 罐现不落盘、宿主端口随机 → 每次启动需重新登录。恢复"稳定记忆端口 + 罐持久化（userData 内 0600）"组合可让账号会话跨启动存活（旧设计的端口稳定性论证在此依然成立，只是 cookie 的托管方从 renderer 换成了主进程）。quit-inspection / update-tasks 目前为如实空桩，待接 ctx 服务做真实任务检查。

## 14. M3 实施记录（2026-10-07）

M3 三项已全部实施，产品层测试 64 项全绿；真实任务场景（登录会话跨启动、任务运行中退出询问、坏插件恢复）由用户真机验证。

### 14.1 稳定端口 + cookie 罐持久化（登录跨启动存活）

- **端口决策**（index.mjs `pickHostPort`）：记忆端口空闲 → 沿用；被占（上次异常残留监听）→ 向系统要新随机端口并重写记忆。记忆文件 `QILIN_HOME/desktop-host-port.json`（0600，qilin-contract `readPersistedHostPort`/`persistHostPort`，1024–65535 校验 + 损坏容错）。
- **端口透传**：`hostArgs(entry, runtime, port)` → 宿主 argv `--port <n>`（host/main.mjs 解析后透传 `runProfile` args；0 = 随机）。崩溃自动重启沿用同一 options（同端口），cookie 失配面最小。
- **罐持久化**（index.mjs `loadJar`/`scheduleJarSave`）：`userData/host-cookies.json`（0600，500ms 去抖），`{ port, cookies }` 键控——**端口一致才回灌**（cookie 名绑定 `127.0.0.1:<port>` authority，端口换了旧名全部失配，回灌只是噪声）。splash:retry 不再清罐（端口没换则罐仍有效）。

### 14.2 quit-inspection / update-tasks 接真实引擎面

宿主 `inspectTasks(ctx)` 读三个服务（逐一实证上游 API）：
- **Agent 回合**：`ctx.agents.list()` 的 `status === 'running'`（AgentStatus = 'idle' | 'running'，core/agent/src/runtime-types.ts:106；archive-admission 同款判定）。
- **后台任务**：`ctx.jobs.list()` 的 `status: 'running' | 'stopping'`（JobStatus，jobs/jobs/src/view.ts:19）。
- **定时提醒**：`ctx.schedule.catalog()` 的 `status === 'active'`（ScheduleCatalogEntry，schedule/schedule/src/types.ts:213；`list()` 需 sessionId，catalog 才是全局面）。

任一服务面缺失/读取异常按"无"处理（profile 裁剪不阻塞退出判定）。update-tasks 的 `active` 取 `activeTasks` 同源。

### 14.3 崩溃报告 + 出厂插件面恢复

- **崩溃报告**（index.mjs `writeCrashReport`）：宿主进入 failed 态先落 `userData/crash-reports/host-<时间戳>.txt`（0600，滚动保留 10 份，内容 = 原因 + 诊断快照 + 宿主日志尾部），再报给启动页并附报告路径。
- **出厂插件面恢复**（recovery.mjs，纯 fs/JSON、Electron 无关、不 import 可能已损坏的运行树）：插件的启停在上游就是 profile manifest 的 bundles 列表增删（plugin-manager 读 / writeProfileManifest 写）——恢复 = 把 `qilin.profile.bundles`（dsh 旧 face 兜底，profileDeclarationOf 同次序）重写为出厂模板层 `['@qilin/base','@qilin/web-app','@qilin/web-brand']`。`dependencies`（安装记录）原样保留，只是不再装配；整份 manifest 先备份 `package.json.pre-recovery`（滚动覆盖）。manifest 缺失/无 bundles 面 → 幂等不动；损坏 → 如实报错不覆盖。
- **启动页恢复入口**：failed 态新增「禁用插件并重启」按钮（`splash:recover-disable-plugins` → restoreShippedBundles → stop+launchHost），与「重试启动」「复制诊断信息」并排。

### 14.4 测试更新

- 标题栏基线对齐断言替换（`align-items:baseline` + `align-self:baseline`，删除 translateY 半像素补偿断言）——混排面包屑 latin/CJK 同基线的修复已由 Electron DOM 探针实证（三段文字同盒同基线、图标 center 居中）。
- 新增：宿主参数端口透传、端口记忆读写/范围/损坏容错、出厂插件面恢复（摘除/保留/备份/幂等/dsh face/损坏报错）、恢复 IPC 与崩溃报告接线断言。

### 14.5 上游重锚定（2026-10-07，fdca446 → b2d1861）

- **插件页「开发者工具」（@qilin/experimental-inspector-profile）并非未对齐**：它是上游 `OPTIONAL_BUNDLES` 的出厂可选 bundle（app-boot/src/profile.ts:289 起，"ships for a person to switch on… offered switched off"）——插件页显示"内置 / 3.1.1 / Beta / 已关闭"正是上游语义：安装清单（apps/cli dependencies）自带、默认不进 qilin profile 启用面。上游在我们锚定点与 origin/main 上都保有它，从未删除（被退役的是 dsh-animations，归一化时从模板层摘除）。
- **重锚定**：锁 commit fdca446 → origin/main @ b2d18618（3.1.1 线 +6 提交：编码右栏落点展开、turn 尾文件点击弹出接管、新会话按钮样式回归、测试与文档偿清）。6 个提交未触及两个品牌补丁的目标文件（ui-primitives/QilinSeal.tsx、ui-theme-brand/tokens.ts、landing.css、SettingsRoot.module.css），补丁原样应用，无需重生成；运行树按新 commit 重克隆 + 重构建。

### 14.6 内置终端退役 + 标题栏右栏转发修复（2026-10-07，重锚定后真机反馈）

- **内置终端插件退役**（用户决策"这个不需要了"）：删除 vendor/dsh-terminal、scripts/lib/terminal-builtin.mjs 与 dev 流程的物化步骤；titlebar 移除 `__dsh_desktop_titlebar` 挂载哨兵与终端按钮配色规则。已同步清理用户 QILIN_HOME：profile manifest 的 `@kkutysllb/dsh-terminal` bundle 条目与两处物化副本（profile 私有锚 + 旧共享锚）。插件页当时无删除按钮的原因：该插件由壳在 profile manifest 直接注册（非插件通道安装，无 dependencies 记录），插件页对这类条目不提供删除动作——现随退役一并清除。
- **编码模式右栏开关无反应（桌面壳独有，web 正常）**：标题栏转发顺序原为 toggle 优先；编码模式下面板内折叠钮（`data-sidebar-right-toggle` → `setExpanded(false)`，显式收起非翻转）在面板收起后仍在 DOM（面板只是滑出边缘），导致收起态点击命中它 = no-op。修复：转发先展开钮（`data-sidebar-right-expand`，会话头角落，仅收起态挂载，`setExpanded(true)`）后折叠钮——收起态必然命中展开钮，展开态展开钮不渲染自然落到折叠钮。通用模式此前正常是因为其折叠钮调 `toggleExpanded()`（真翻转）。
- **右侧按钮自适应重排（同反馈追加）**：右侧窗口级按钮从固定 `right` 偏移（panel 10px / app 76px，44px 槽位预留给终端插件）改为 `#ok-actions` 动作簇流式排布（右缘 10px、簇内 flex + 2px 间距）；插件挂载点（`__dsh_desktop_titlebar`）夹在簇内应用按钮与右栏开关之间——插件增减只重排簇内流，不留固定槽位空隙。

### 14.7 上游重锚定（2026-10-08，b2d1861 → d9dc36d）

3.1.1 线 +2 提交（tag `v3.1.1` 第四次重发，均不触及品牌补丁目标文件）：对话尾部文件行补类型徽章与名称高亮（ui-deliverables / ui-sidebar-coding）、agent 执行文件操作行补类型徽章（ui-tool）。锁更新 → 重克隆 → 补丁净应用 → 构建 + 产品测试全绿 → 真机 smoke（稳定端口复用、auth 探针、插件 API 200）。

### 14.8 品牌面落位（2026-10-08：图标 / 托盘 / 菜单）

- **图标生成管线**（scripts/gen-icons.mjs）：SVG 源 → dev Electron offscreen 窗口按目标像素栅格化 → PNG 尺寸族 → iconutil 合成 .icns。产物全部生成物：branding/icons/{qilin.icns, qilin-512.png, tray-Template.png(@2x), qilin.iconset/}。坑位记录：Electron 主进程 argv[1] 是应用路径（参数从 [2] 起）；offscreen 窗口 destroy 后同进程新建窗口加载 data: URL 会 ERR_FAILED——每任务独立进程绕开。
- **APP 图标** = 麒麟印章：直接复用上游 QilinSeal 的几何与嵌线字形（seal-geometry/seal-glyphs 提取，脚 本一次性生成 branding/logo/qilin.svg，之后自持），1024 画布 Big Sur 规范（832 底板、圆角 186、轻投影）。dev 期 app.dock.setIcon(512 PNG)，打包期注入 .icns。
- **托盘图标** = 大写艺术字 QL（用户指定：镂空 · 三维 · 斜体）。设计经三轮迭代（并排 wireframe → 分离 3D outline → **v3 交叠式 monogram**——参考专业 QL monogram 排布：L 竖笔嵌入 Q 环、底横穿环而出，整体一个环宽，笔画加粗一倍）；环孔透底 = 镂空、组合实心右下偏移经 mask 只余月牙 = 三维、skewX(-10°) = 斜体、左下 45° 刀锋尾。内容占比 76%（菜单栏呼吸边，修正首版"偏大"）。Template 规格（纯黑+alpha）系统自动明暗着色。
- **系统托盘**：Tray 挂 template 图（点击聚焦 shell 窗口/无窗口时回启动页）；**非保活**——window-all-closed 退出语义不变。
- **系统菜单**：desktop/main/menu.mjs 接管 Electron 默认英文菜单——App（关于/隐藏/退出，setAboutPanelOptions 中文 credits）、编辑（role 剪贴板组）、显示（缩放/全屏；**重新加载与开发者工具仅 dev（!isPackaged）**——打包后不存在，防 boot 闸被用户误重载破坏）、窗口。Windows frameless 无菜单栏不设置。

## 15. M4 发版管线（2026-10-08 实施，KStock 四层架构适配）

参考 KStock 发布机制（plans/2026-09-28-release-pipeline-refit.md：本地入口 → CI tag 矩阵 → 打包契约 + 产物门 → electron-updater 消费）落地我们自己的形态：

- **运行时闭包封盘**（scripts/build-runtime-bundle.sh）：锁定 commit → 品牌补丁 → 全量 install → build:qilin → **pnpm install --prod 收闭包**（2.4GB node_modules → 511 个生产包）→ tar（排除源码/测试/文档）→ `staging/qilin-runtime.tar.gz`（449MB）+ `desktop-runtime.json`（commit/版本/sha256/入口锚）。坑位记录：prod 模式下 root 的 lefthook postinstall 必炸（devDep 缺失）——重装前临时摘除。
- **桌面打包**（scripts/build-desktop.sh + desktop/package/electron-builder.yml）：壳源组装进打包域（app/ 目录）→ electron-builder 26（装 .tmp/dev/builder-tool，零依赖约束）→ dmg/zip arm64 + blockmap + latest-mac.yml。关键决策与坑：electron devDep 版本锚（44.0.0 精确，SKIP_BINARY 下载）；Electron dist 下载走 ELECTRON_MIRROR；**artifactName 显式无空格**（builder 把 productName 空格 sanitize 进 latest-mac.yml 的 url，文件名若留空格则两者错位 → 更新器 404）；**asarUnpack host+main**（ELECTRON_RUN_AS_NODE 是纯 Node fs 不识别 asar，宿主入口与其依赖必须落真实文件系统 app.asar.unpacked/）。
- **打包态运行时**（desktop/main/runtime-install.mjs）：首启校验清单 sha256 → 解压到 userData/runtime/<commit>/（commit 目录名 = 换版自然重装）；RUN_ROOT 解析兼容 dev（OPENKYLIN_QILIN_RUN / .tmp checkout）与打包两形态。
- **自动更新**（desktop/main/updater.mjs）：electron-updater（打包域 dependencies 进 asar；dev 态动态 import 缺失即跳过）读 GitHub Releases latest-mac.yml；静默后台下载 → 完成通知 → 确认后**先 hostProcess.stop 再 quitAndInstall**（KStock 时序纪律：引擎占用会让替换失败）；GitHub 无 Release 时报错被 error handler 吞掉，不扰主流程。
- **产物门 V1–V7**（scripts/verify-desktop-artifacts.sh）：安装包/更新元数据/交叉引用/闭包 sha256/dmg hdiutil 校验/三处版本一致/闭包解压冒烟。本地与 CI 同源。
- **发版入口**（scripts/release.sh）：版本单一事实源（根 + 打包域 package.json）→ npm test → build-desktop → 产物门 → annotated tag → atomic push。release/<tag>.md 为 Release 正文。
- **CI**（.github/workflows/release.yml，取代 sidecar 旧版）：仅 tag 触发（日常 push 零 Actions 消耗——配额策略），单平台 macos-latest（arm64 对齐 lock.target），build → 产物门 → publish（gh release create，正文取 release/<tag>.md）。
- **签名公证**（v0.1.0 起实装，KStock 同款专用钥匙串路线）：CI secrets 注 `MAC_CERTIFICATE`（base64 .p12）/`MAC_CERTIFICATE_PWD`/公证三件套 → `scripts/ensure-macos-keychain.sh` 建专用钥匙串导出 `CSC_KEYCHAIN`+`CSC_NAME`（身份自动发现，仓库无需额外 secret）→ builder 签 .app（hardened runtime + entitlements jit/unsigned-executable-memory/disable-library-validation）+ notarytool 公证。fail-closed 凭据门在 release.yml 前置步骤（缺凭据即拒，不靠 builder 静默跳过）。**闭包预签**在封盘脚本内（tar 前对全量 Mach-O `codesign --force --options runtime --timestamp`）——公证服务会拆嵌套归档逐个验二进制，见 §15.1 第五轮。
- **打包态首启冒烟实证**（本地 dist-exe 真跑）：闭包解压 ✓ → 宿主自 app.asar.unpacked 启动 ✓ → 稳定端口记忆复用（60795）✓ → 引擎 API/插件 API 200 ✓ → updater 无源报错正确吞掉 ✓。坑位：whenReady 回调内单点异常（setIcon 路径缺失）会静默吞掉 splash/launchHost 全链——图标设置 try/catch + launchHost/whenReady 双层 catch 兜底。
- 体积现状：dmg 594MB（闭包 449MB 为大头）——后续可做闭包瘦身（source map 剔除、重复平台二进制清理）。

### 15.1 v0.1.0 首发实录（2026-10-08，六轮 CI）

首发连续六轮才绿，每轮都是独立的实坑，全记入脚本头注防复发：

| 轮 | 死因 | 修复 |
|---|---|---|
| 1 | 凭据门误报：step 级 env 不跨步骤，门检查看不到凭据 | 凭据提升 job 级 env |
| 2 | `CSC_LINK` 临时钥匙串分支上游缺陷：创建即 `SecKeychainUnlock` 密码错（electron-builder 已知坑，KStock 坑 3 同款实踩） | 弃 CSC_LINK，专用钥匙串路线（ensure-macos-keychain.sh） |
| 3 | 变量名错配：workflow 把 p12 注成 `CSC_LINK`，脚本认 `MAC_CERTIFICATE`——专用钥匙串分支没被触发，遗留 CSC_LINK 又把 builder 拖回缺陷分支（同一崩法白跑） | workflow env 改名注入 + 门禁同步改检；CSC_LINK/CSC_KEY_PASSWORD 彻底不进环境 |
| 4 | ①`find-identity` 行首两空格没被 `^[0-9]+` 吃掉，CSC_NAME 导出成整行垃圾 → builder 找不到身份**静默跳过签名**；②builder 见 git tag + publish:github 触发隐式发布，构建步无 GH_TOKEN → GitHubPublisher ×4 → Cannot cleanup | 正则改 `[[:space:]]*` 起头（按 CI 真实行格式本地回归）；`--publish never` 收口，上传归还发布 job |
| 5 | 公证被 notarytool 驳回：它拆嵌套归档（app → extraResources tar → node_modules）逐个验 Mach-O，闭包 23 个原生二进制（node-pty 双架构/sharp/esbuild/ripgrep/koffi/sherpa-onnx…）无 Developer ID 签名/无安全时间戳/未开 hardened runtime | 封盘脚本步骤 4.5 闭包预签（tar 前全量 Mach-O 签名）；连带修幂等分支——CI 同 job 二次 source 时须遍历搜索列表定位持身份的钥匙串，不能取默认（空） |
| 6 | **成功** | — |

经验三条：①签名链路任何一环静默降级（跳过签名/跳过公证）都不报错，fail-closed 门与产物验签必须前置；②公证不只验 .app 本体，深入一切嵌套归档——闭包预签是必需环节不是优化项；③workflow env 变量名即契约，改名时全链路（注入/门/脚本）同步。

发布瑕疵两处（已修或手补）：publish job 的 TAG 用 `github.ref`（带 `refs/tags/` 前缀）致标题错、notes 文件没匹配上回退自动 changelog——workflow 改 `github.ref_name`，本版标题/正文用 `gh release edit` 手补。

## 16. v0.1.0 后真机调整（2026-10-08）

三条真机反馈，逐条落地：

### 16.1 Dock 点击不重载 + 托盘右键菜单
- `focusShellWindow`（windows.mjs）：activate / second-instance 只 show+focus 不重载——`showShellWindow` 的语义是入口加载（boot 门要求整页重载），此前 Dock 点击每次都把用户从设置页拽回 workspace。窗口不在才按宿主状态回落重建。
- 托盘右键菜单：打开 QiLin（走 revealShell 同一条不重载路径）/ 引擎状态行（随 hostProcess.status 现算，运行态带端口）/ 检查更新…（接 initializeUpdater 预留的 checkNow，dev 态无 electron-updater 不出项）/ 关于 / 退出（走 before-quit 优雅关停）。左键聚焦语义保留。验证：CGEvent 合成右键真点托盘图标 + AX 树读菜单项。

### 16.2 无痕 UI（KStock 同款 darwin 自持形态）
核心认知：**引擎原生就有完整的 macOS 桌面形态**，全部挂在 `html[data-platform="darwin"]` 标记上（ui-primitives `isDarwinDesktop` + 各模块 `:global([data-platform='darwin'])` CSS）——壳此前从没落过这个标记，等于一直跑通用 web 布局。激活后的形态：折叠侧栏**整列归零**（collapsedWidth=0，不再留 56px 图标轨）、折叠态由会话头 leading 座位补回「侧栏开关 + 新会话」两钮（HeaderLeadingControls）、侧栏顶 52px topStrip 拖拽条、透明框 + 半透明侧栏。

改造内容（KStock 实机截图对齐）：
1. **preload 落标记**（shell.cjs）：`documentElement.dataset.platform = 'darwin'`。坑：沙箱 preload 执行极早，documentElement 可能为 null——实测直接写崩掉整个 preload（连 boot 桥一起没），兜底挂 DOMContentLoaded。
2. **qilinDesktop 桥（keyboard-bridge.mjs，KStock qilin-bridge 同款 mjs 移植）**：desktop 运行时的 shortcuts 服务要求 `window.qilinDesktop` 的 keyboard + shortcuts 双面俱在，缺任一 `client-shortcuts` 即 throw、整条插件图 pending（实测 33 项挂起）。桥 = 偏好存储（引擎 `ShortcutPersistence` + userData/keybindings.json 原子文件）+ 原生键盘输入（before-input-event → 渲染端注册表，生效组合键 preventDefault 转发、其余带修饰键手势只转发配对、壳自留键 F12/重载/缩放除外、recording 期放行）。**引擎协议实现直接从运行时闭包动态 import**（`packages/client/shortcuts/lib/protocol.js`，ESM 自包含，bare specifier 沿闭包 node_modules 解析）——零语义复刻。revision 一致性：偏好存储与键盘通道同进程（主进程），输入消息盖当前 accepted revision。
3. **撤注入式标题栏**（titlebar.mjs 退役，windows.mjs 不再调用）：KStock 形态里顶带全部引擎自持——topStrip（红绿灯行）+ 会话头（data-window-drag）。红绿灯对齐 `{x:13, y:20}`（top-left；中心 y=26 = 52px strip 中线）。注入条退役后 `--ok-tb-h` 永不定义，desktop-titlebar-inset.patch 的让位规则自然失效，无需回滚。
4. **侧栏分区**（patches/desktop-sidebar-sections.patch，registry 新条目）：引擎 3.1.1 原生支持 `sidebar.section.assignments` 槽位 + 连续同段行共享表头的分组渲染，只是无人注册——补丁在 ui-sidebar apply 内注册 `{plugins:'通用', schedules:'通用'}`（isDarwinDesktop 门控）。另加 **K19-lite 分区折叠**：表头渲染折叠箭头，点击收起该分区行，状态持久 localStorage `qilin.sidebar.folded-sections.v1`。
5. **一条光学线**（同补丁）：会话头 48px 中心 y=24 vs topStrip 52px 中心 y=26——收起态 leading 控件加 `margin-top: 4px`（align-items:center 居中 margin 盒）对到 26，与红绿灯、strip 开关三线合一。真机反馈的红框错位即此。
6. dev 快速迭代法：改 `.tmp/dev/qilin-src` 源 → `pnpm run build:lib:client && build:web` → 重启 dev 壳（titlebar/主进程改动须重启，preload 改动须刷新页面）；定稿后 `git diff` 生成补丁入 patches/。
