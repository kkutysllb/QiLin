# 内置 coding-sidebar 插件并替换右侧栏 — 集成计划

- 状态：已完成（2026-09-15；构建/启动/浏览器/升级模拟验收通过；详见 Agent Note 2026-09-15-builtin-coding-sidebar-vendor-channel）
- 追加（同日）：设置页替换补齐——插件以 `sidebar-right` 节 id、priority -1 注册（槽位遮蔽），原生「侧边栏」设置页删除、仅保留「侧边卡片」；QiLin 设置外壳导航改为按胜出单元格投影（Agent Note 2026-09-15-settings-nav-winner-projection）；文件地址 scheme 重写为 `qilin-resource://file/`，聊天区文件打开真正落入工作台
- 日期：2026-09-15
- 上游：`dsh-coding-sidebar@1.0.14`（commit `f4992d8`，DSH 0.1.5-rc.2 通道保持不变）

## 目标

1. `dsh-coding-sidebar` 以 **`@qilin/coding-sidebar`** 身份 vendor 进 QiLin（`vendor/coding-sidebar`，private），成为内置全局插件。
2. **替换**现有右侧栏：插件自带 bundle patch 禁用 `ui-sidebar-right` / `ui-sidebar-documentpreview` / `ui-sidebar-files` / `ui-sidebar-tasks` / `ui-sidebar-plans` 五行（禁用而非删除，符合仓库惯例；替换逻辑随插件版本在线升级）。
3. **内置**：`web` 与 `qilin` profile 模板 bundles 追加 `@qilin/coding-sidebar`；存量未改动 profile 通过 `INSTALLATION_OWNED_PROFILE_TUPLES` 归一化自动获得。
4. **在线升级**：`qilin plugin --profile web add <spec>` 装新版本到 `$QILIN_HOME/profiles/web`（双锚点解析优先生效、单一 bundle 行、无双重挂载）；插件仓维护 qilin 通道发布。

## 关键事实（勘定）

- QiLin 未在 npm 发布 `@qilin/*`（404）→ 内置副本必须 vendor；升级通道用 git/npm 皆可（`qilin plugin` 是 pnpm 转发器）。
- 双锚点解析：profile `node_modules` 优先于安装闭包 → 同名包 profile 副本自然覆盖内置副本。
- 客户端机制同源：`window.__ModuleLoader__.load({id, factory})` + CJS 闭包；静态表 `PLATFORM_MODULES` 含 react/`@qilin/kylin`/`@qilin/client-ui-slots`/`@qilin/client-ui-primitives`/`@qilin/client-ui-dockkit` 等，与插件 externals 一一对应（改名即可）。
- 服务面：host `webServer`/`sessions`/`webRuntime`/`tools`、client `slots`/`sessions`/`connection`/`locale`/`modules`/`remote`(+`remote.session`) 均存活；漂移点：client `workspaces`→`uiWorkspace`、DOM 锚点 `[data-slot="conversation"]`、node-pty 版本（QiLin 打补丁的 `1.2.0-beta.15`）。
- `ctx.remote.session.openWorkspacePath` 在 QiLin 仍存在（api/session-controller）。

## 工作分解

### A. 插件仓（dsh-coding-sidebar）— qilin 通道
- A1 构建通道：tsdown 增加 qilin flavor（别名 `@deepseek-ai/dsh-*`→`@qilin/*`、externals 改 `@qilin/client-ui-*`、双命名空间纯度门）
- A2 兼容层：client 服务名/DOM 锚点探测适配；host node-pty 版本对齐
- A3 `cordis.qilin.patch.yml`：插入自挂行（双名守卫）+ 禁用五行原生右侧栏
- A4 `scripts/sync-to-qilin.mjs`：产出 vendor 形态（改名 `@qilin/coding-sidebar`、private、`qilin.*` manifest）
- A5 README：QiLin 安装/升级/卸载章节（命令、目录、approve-builds）

### B. QiLin 仓 — 集成
- B1 `vendor/coding-sidebar` + `vendor/README.md` manifest + 构建/类型接线
- B2 `@qilin/web-app` 依赖（安装闭包可解析）
- B3 `PROFILE_TEMPLATES` web/qilin 追加；`INSTALLATION_OWNED_PROFILE_TUPLES` 登记 retired 元组；app-boot 测试
- B4 profile pnpm 模板 `allowBuilds: node-pty`（新 profile 开箱可用终端）
- B5 文档：architecture.md、AGENTS 布局表、web-app README（双语）
- B6 Agent Note（本 PR 非平凡变更必须附注）

### C. 验收
- C1 `pnpm install` + 双面 `build` 通过
- C2 临时 `QILIN_HOME` 启动 `qilin --profile web`：插件行挂载、五行原生右侧栏禁用、无重复路由
- C3 Playwright 打开页面：coding-sidebar 可见、原生右侧栏消失
- C4 升级模拟：向 profile `add` 更新版本 spec → 单行挂载新副本
- C5 定向检查：typecheck、app-boot/cli 相关测试、doc-sync

## 决策记录

- vendor 而非 `packages/`：vendoring 政策（rescope+private+manifest）、逃离 per-file 100% 覆盖率门、根构建 glob `vendor/*` 自动纳入。
- 禁用而非删除原生五行：可回退（用户 patch 可重开），替换逻辑随插件升级。
- 插件自 patch 禁用（而非 web-app patch）：升级独立性——新版插件可自行调整禁用集合。
