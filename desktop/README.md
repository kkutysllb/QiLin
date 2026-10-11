# QiLin Desktop（桌面端）

基于 QiLin 引擎的中文桌面智能工作台（macOS Apple Silicon 首发）。本目录是麒麟仓的
桌面端子系统：引擎即本仓，桌面与 Web 端消费同一份构建产物，随麒麟仓统一发版。

## 仓库边界

桌面壳与引擎同仓同版：运行时闭包从本仓 HEAD 的 git worktree 构建
（`scripts/build-runtime-bundle.sh`），版本单一事实源是麒麟仓根的
`package.json`，版本 tag 只发布源代码与网页版；桌面安装包由根上的
`desktop-release.yml` 手动 dispatch 构建，产物进该 tag 的 GitHub Release。
原 OpenKyLin 独立仓的锁定副本、品牌补丁层与
parity 门已退役（见
[合并笔记](../.agents/notes/implemented/architecture/2026-10-09-openkylin-desktop-merged-into-qilin.md)）。

## 常用命令

在麒麟仓根：

```sh
pnpm run build:desktop          # 闭包封盘 + electron-builder 打包（dmg/zip arm64）
pnpm run test:desktop           # 桌面端产品层测试（Node 原生 runner）
```

在 desktop/ 内（`npm test` 等）：

```sh
npm run dev                     # 启动桌面开发环境（本仓工作区 + 自备 Electron）
npm run verify:branding         # 校验品牌清单与对比度
npm run verify:sync -- <webDist> <desktopDist> [report.json]
npm run verify:artifact -- <desktop-runtime.json> <artifactDir> [checksumsOut]
npm run release:manifest -- <desktop-runtime.json> <sync> <checksums> [manifestOut]
```

## 桌面架构

```
QiLin Desktop（Electron 壳，desktop/，零 npm 依赖）
  ├─ 中文品牌启动页（splash，本地资源；失败态有重试/复制诊断）
  ├─ spawn 引擎宿主子进程（Electron-as-Node，程序化 boot 产品面 qilin profile）
  ├─ qilin-app:// 私有协议承载 web client（认证反代 + cookie 罐 + 桌面 boot 门）
  └─ shell 窗口加载该协议地址 —— 与浏览器访问 Web 端是同一份 Web Client 构建
```

引擎运行树来源：dev 态 `OPENKYLIN_QILIN_RUN`（dev 脚本传入本仓根）；打包态首启
从 `Resources/runtime/qilin-runtime.tar.gz` 解压（sha256 校验，按 commit 目录落
userData，换版自然重装）。上游契约（就绪行、flags、bin 路径、home）集中在
`main/qilin-contract.mjs`。

安全边界：导航只允许停留在当前 `qilin-app://` origin，外链转系统浏览器，权限请
求一律拒绝。进程纪律：宿主崩溃指数退避重启（上限 3 次），退出走 SIGTERM → 5s 宽
限 → SIGKILL，另有 detached watchdog 兜底，不留孤儿进程。

## 开发环境

`npm run dev` 直接用本仓工作区：运行物（`apps/cli/lib/profile-boot.js` 与
`apps/web/dist`）缺失时经本仓工具链补建（`pnpm install → build:qilin`，后者是绑
定客户端公共环境的产品构建，版本徽章、commit 与构建 profile 随产物烘焙）；Electron
自备（钉 44.0.0——原生加载器按精确指纹校验，装进 `.tmp/dev/electron-tool`，下载缺
失时自动执行 electron install.js 补装）。

受限执行环境（CI 容器、嵌套沙箱）可用的逃生口，普通终端无需设置：
`OPENKYLIN_USER_DATA`（重定向 Electron userData）、`QILIN_HOME`（重定向 harness
home）、`ELECTRON_DISABLE_SANDBOX`（绕过外层沙箱对 Chromium OS sandbox 的干
扰）、`OPENKYLIN_ELECTRON_NO_GPU=1`（无头/CPU-only runner 追加 `--disable-gpu`）、
`OPENKYLIN_ELECTRON_ARGS`（追加任意 Electron 开关，空白分隔）、
`OPENKYLIN_QILIN_RUN`（显式指定运行树）。

## 设计规范

- 中国文化主题为共享 Web Client 注入（`branding/brand-manifest.json` +
  `branding/theme/tokens.css`），Web 与 Desktop 同源；桌面壳层（启动页/错误恢
  复/菜单）只做平台适配。印章配色与侧栏分区等桌面适配以源码落在
  `packages/client` 与 `apps/web`，不是补丁。
- accent token（朱砂/玉青/鎏金）仅作点缀、大文本或状态图形用途；正文文本一律
  使用 ink/paper 对（对比度 ≥ 4.5，CI 强制）。

## 发布

本地入口 `scripts/release.sh <version>`（门禁 → 打包 → 产物门 V1–V7 → tag →
push）：推出去的 tag 走的是源代码与网页版发布，桌面安装包要在本机产出、或另跑
dispatch 才会上传。CI 走根上 `.github/workflows/desktop-release.yml`（**仅手动
dispatch**，单平台 mac-arm64）。签名公证凭据齐备时 fail-closed（缺一即拒），
本地无凭据出未签名包。自动更新走 electron-updater（`latest-mac.yml` + blockmap
增量，安装前先停引擎）。
