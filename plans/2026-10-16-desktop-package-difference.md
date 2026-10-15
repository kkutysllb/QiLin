# QiLin 桌面端包 vs 上游 dsh 桌面包（差异分析）

日期：2026-10-16 · 对账对象：QiLin `desktop/`（`openkylin`/`openkylin-desktop` 0.1.1）与上游 `apps/desktop`（`@deepseek-ai/dsh-desktop` 0.2.1-alpha.4）+ `apps/desktop-host`（`@deepseek-ai/dsh-desktop-host`）。

## 结论先说：架构同源，工程面分道

两侧都是「Electron 壳 + 宿主子进程在 loopback 上程序化 boot 一个 web profile，把 URL 回传给壳，壳用特权自定义 scheme 承载共享 Web 客户端」：

- **QiLin**：`desktop/main/qilin-contract.mjs` 明写——壳 spawn 宿主子进程（Electron-as-Node），宿主 `runProfile` 起 **`qilin`** profile（base + web-app + web-brand，cordis 同进程，不经 CLI 子进程），loopback `127.0.0.1:0` + launch token，壳经 Node IPC 收 `ready{url, injections}`，窗口加载 `qilin-app://app/workspace`；静态资源壳直读 `apps/web/dist`，动态请求由壳**认证反代**到宿主，认证 cookie 只存在于主进程。`desktop/main/protocol.mjs` 强制 `Origin: qilin-app://app` 并剥离/改写越权头。
- **上游**：`apps/desktop-host/src/index.ts` 首行即 "Launch the Desktop profile through the Web application and report its URL to Electron"，用 `loadProfileDirectory('dsh', …)` + `runProfile({ profile: 'desktop', … })`；`apps/desktop/src/main.ts` 用 `protocol.handle('dsh-app', …)` + `window.loadURL(url)`，并校验 `senderFrame.url.startsWith('dsh-app://app/')`。

## 逐项差异（含证据）

| 维度 | QiLin `desktop/` | 上游 `apps/desktop` + `apps/desktop-host` |
|---|---|---|
| 来源 | OpenKyLin 子仓 **git subtree 并入**本仓，历史保留；引擎依赖反转（[并入说明](.agents/notes/implemented/architecture/2026-10-09-openkylin-desktop-merged-into-qilin.md)） | 上游自研，随工作区版本 0.2.1-alpha.4 |
| 规模 | 约 90 文件（main 12 / package 27 / branding 22 / scripts 16 / tests 10 / docs 8） | `apps/desktop` **848 文件** + `apps/desktop-host` 50 文件 |
| 包的 profile | 起 **`qilin`**；`desktop` 名**保留且被 CLI 拒绝**（并入说明明写） | 起 **`desktop`** profile |
| 自定义 scheme | `qilin-app://app/…` | `dsh-app://app/…` |
| renderer 角色 | 只有 `about.html`/`splash.html`——**主界面是共享 Web UI** | `welcome` / `update-dialog` / `mandatory-update` / `policy-login-loading`——**同样只承载外围页**，主界面也是共享 Web UI |
| 引擎交付 | 打包**预构建闭包**：`scripts/build-runtime-bundle.sh` 从 **本仓 HEAD 的 git worktree** 构建 → `staging/qilin-runtime.tar.gz` + `desktop-runtime.json`（commit/版本/sha256/入口锚）；首次启动校验 sha256 后解压到 `userData/runtime/<commit>/`（换版自然重装、旧树留存） | 运行期 `loadProfileDirectory` + `installAnchor` 从**安装目录**解析 profile，不打包闭包 |
| 宿主额外能力 | `keyboard-bridge`、`titlebar`、`menu`、`recovery`（bundle 恢复/迁移）、`updater`（electron-updater）、`workspace` | `office`/`office-engine`（`koffi` + `libreoffice-kit`）、`update-tasks`（计划更新）、`quit-inspection`、`platform-session`、`crash-report`、`device-info`、`browser-guests`、`directory-picker`、`command-*` —— 面明显更大 |
| 打包/发布 | `desktop/package/`（electron-builder，`electron` **固定 44.0.0**、`electron-updater` 为唯一 runtime dep）+ `branding/` + 自检 `verify:branding`/`verify:sync`/`verify:artifact`/`check:leakage`/`sbom`/`release:manifest`；发布由 `.github/workflows/desktop-release.yml` **手动派发**、把桌面包挂到**同一个 `v*` Release**（V1–V7 产物门禁） | `installer/` + `packaging/` + `publishing/` + `electron-builder.config.mjs`，含 `@electron/notarize` 公证与 COS 上传（`cos-nodejs-sdk-v5`） |
| 版本来源 | **两条线并存**：`desktop/package/package.json` = `openkylin-desktop` 0.1.1（打包域版本，`generate-release-manifest.mjs` 读它），而 `generate-sbom.mjs` 读**工作区根**版本；并入说明称打包时由根同步 | 单一 0.2.1-alpha.4，跟随工作区 |
| 命名 | `openkylin` / `openkylin-desktop`（未带 `@qilin-agent` 作用域） | `@deepseek-ai/dsh-desktop` / `@deepseek-ai/dsh-desktop-host` |

## 需要留意/待确认

1. **桌面版本双源**：`generate-release-manifest.mjs` 用打包域版本（0.1.1），`generate-sbom.mjs` 用工作区根版本（3.1.6-rc.1）。并入说明声称"打包时由根同步"，但**本次未在会话内找到执行该同步的脚本**——建议核对 `desktop/scripts/build-desktop.sh` 与 `release:manifest` 链路，确认发布产物里的版本字段一致。
2. **桌面与 `v*` Release 的耦合**：QiLin 把桌面包挂到同一个 `v*` Release 且需手动派发；上游是独立发布流水线（含公证）。若未来为 3.1.6 正式版附桌面产物，需按 `desktop-release.yml` 手动 dispatch。
3. **未做的事**：本次只做静态差异分析（结构、清单、入口、脚本、发布配置），**没有**实机运行任一侧安装包，也没有逐文件 diff 848 个上游文件。

## 复现命令

```sh
# QiLin 侧
ls desktop; sed -n '1,30p' desktop/main/index.mjs; sed -n '1,14p' desktop/main/qilin-contract.mjs
sed -n '1,32p' desktop/scripts/build-runtime-bundle.sh
# 上游侧
node -e "console.log(require('apps/desktop/package.json'))"   # 在 deepseek-harness 内
sed -n '1,30p' apps/desktop-host/src/index.ts
grep -n "protocol.handle\|loadURL" apps/desktop/src/main.ts
```
