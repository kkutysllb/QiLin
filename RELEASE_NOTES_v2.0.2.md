# QiLin v2.0.2 · DSH 插件生态兼容宿主 / Plugin-Host & Ports Release

> 发布时间 / Released: **2026-09-02**
> Tag: `v2.0.2`
> 基于 / Based on: **v2.0.1**（75 个提交 / 75 commits）

---

## ✨ 概览 / Overview

v2.0.2 是一次大版本增量：QiLin web-demo 正式兼容 **DSH 插件生态**——完整落地 T1/T2/T3 三类插件协议（tab 面板 / sidebar 服务 / 会话内文件评审），真实第三方插件（git-panel、terminal、language、skills 等）端到端跑通；同期建立「**一切皆 port**」架构（终端 PTY、fs/git 能力桥、surface 查看器），并配套插件生命周期 CLI、npm 安装链路与前端管理页面。另含网关鉴权兼容修复、品牌视觉更新（麒麟双字方印）与一轮全仓代码审计清理。后端 pytest 999+、前端 vitest 391 全绿。

---

## 🚀 新增 / What's New

### 插件宿主（dsh-plugin-host 里程碑 / DSH plugin-host milestone）

- **插件协议 shim 内核 / Plugin protocol shim** — 兼容 DSH 插件协议：`window.__ModuleLoader__.load({id,factory})` 加载协议（factory 首参即宿主 require）、T1 tab 面板、T2 sidebar 服务（`qiLin.sidebar` 服务桥）、T3 会话内文件评审（uiConversation 事件 registry + undo/redo 全环）。
- **真实第三方插件端到端 / Real third-party plugins E2E** — kcoder-git-panel、kcoder-terminal、kcoder-language（中文回复验收）、kcoder-skills（37 技能物化验收）依次跑通；tools/post-execute 事件面全链打通。
- **能力桥 / Capability bridge** — 围栏化 fs/git 服务注入插件宿主；pty→ports 桥以 node-pty shim 让 kcoder-terminal 引擎摆脱 native 限制。
- **插件生命周期 CLI / Lifecycle CLI** — `dsh plugin add/remove/upgrade/list`（脚本化封装，与共享 runtime `installPluginDir` 单一来源）。
- **npm 安装链路 / npm install chain** — `npm pack` → 暂存解包 → 分发（client.js→public，entry.js+vendor→plugins/）→ 清单 upsert（`source: "npm:<name>@<version>"`）；双通道回退（用户 npm 配置 → 官方 registry + 隔离缓存）。
- **前端插件管理 / Frontend plugin management** — `/workspace/plugins` 安装入口 + 设置页「插件管理」菜单节（npm 安装卡片、插件表格含来源列、启停/卸载）；loopback 管理 API（list / setDisabled / remove / install）。
- **宿主挂点 / Host slots** — slots 服务 + 聊天 turnTail 挂点 + typert 传输双端；自研侧边栏下线，插件面板改宿主极简 dock 挂点。

### ports 架构 / Everything-is-a-port

- **终端端口 / Terminal port** — DSH 兼容终端协议规范层 + POSIX PTY 后端 + Windows ConPTY 后端；gateway terminal REST/WS 路由 + 8 个 DSH 兼容 LangChain 工具；前端 xterm.js 终端面板与 workspace 终端页（Playwright E2E 脚本化）。
- **Surface 端口 / Surface port** — `SurfacePort` + `sidebar_open` 工具（DSH 契约镜像）；surface REST 路由 + 查看器渲染文件/目录/URL。
- **文档 / Docs** — ports 模块文档：安装、环境变量、启用、E2E 完整清单。

### 前端体验 / Frontend UX

- **侧边栏 DSH 对齐 / Sidebar DSH alignment** — 新任务大按钮（icon+文字居中）、折叠轨图标按钮组一致性、recent 列表折叠态快捷栈。
- **品牌更新 / Rebrand** — 商标 logo 由「麟」字方印改为**麒麟双字方印**（QilinSeal + QiLinLogo 同族），favicon 同步；设置页版本徽章自动读取 package.json（本版本起显示 v2.0.2）。
- **功能入口调整 / Entry adjustments** — 定时任务（自动化）前端 UI 下线（后续以插件方式回归）；设置页「数据源」菜单移除（后端接口保留）；MCP 空状态去除右上角重复的「添加服务器」按钮（保留居中入口）。
- **消息页脚 / Message footer** — 操作栏常驻显示并新增点赞/点踩。
- **工作区 / Workspace fixes** — 工作区组头移除折叠箭头（以文件夹开合表达）、修复新建会话工作区预设并支持全局新任务未选择态。

### 网关与修复 / Gateway & Fixes

- **ports 面鉴权兼容 / Auth-compatible ports** — AuthMiddleware 接受裸共享 secret（与铸造 token 同信任级）、CSRFMiddleware 豁免 `/api/ports/` 前缀——修复 auth 开启部署下 ports 面全量 403/401（含 6 例回归测试）。
- **titlebar 锚点修复 / Titlebar anchor fix** — T1 titlebar 锚点条对齐真实头栏 + 子元素定位归一化，修复插件 0.5.x 布局错乱。
- **审计 P0 / Audit P0** — 限流路径失准与三处前后端端点漂移修复。

### 工程质量 / Engineering Quality

- **代码审计清理 / Audit cleanup** — 确定死代码清理（净删 1071 行、移除 11 项无引用依赖）、低/中风险冗余收敛（settings 三层收敛、双路由聊天页归一）、i18n 死词条与 CSS 死令牌清理。
- **Lint 存量清零** — 全仓 ruff 告警清零。
- **测试资产** — pytest 999+（新增 ports 中间件、skills port 等），vitest 391；settings-view 源码断言改为格式无关正则。

---

## 🔄 兼容性 / Compatibility

- **插件安装语义 / Plugin install semantics** — 与 DSH 同构：安装 = 文件 + 清单 + 重启（无热插拔）；卸载与启停经管理页或 CLI。
- **定时任务 / Scheduled tasks** — 前端 UI 已下线，后端能力保留；回归将以插件形式提供。
- **数据源设置 / Data sources** — 设置页菜单移除仅为前端入口变化，`/api/datasources` 后端接口与 .env 凭证读取不受影响。
- **网关鉴权 / Gateway auth** — 既有 JWT 会话与铸造 token 行为不变；裸共享 secret 仅用于 ports 内部面，不新增特权。

---

## 🐛 已知限制 / Known Limitations

- 插件安装/卸载需重启 web-demo 生效（无热插拔）。
- 多智能体 multi 模式切换需重启进程（图结构变更，startup-only）。
- pty 引擎受本机 node-pty 环境限制（Windows ConPTY 后端已具备）。
- `next build` 在静态导出内部 `/_global-error` 路由时报 `useContext` 空值错误（Next.js 16 上游问题，参见 vercel/next.js#87719）；不影响 `next dev` 与运行时。
