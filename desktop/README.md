# OpenKylin

基于 QiLin 构建的中文桌面智能工作台（macOS Apple Silicon 首发）。
QiLin 商标及 Logo 归其权利人所有；本发行版由 OpenKylin 维护。

## 仓库边界

本仓库**不包含 QiLin 源码**。CI 按 `upstream/qilin.lock.json` 锁定的精确 commit
在临时目录拉取上游、注入共享 Web 品牌主题后构建；安装包发布到 GitHub Release，
仓库只保留清单与校验元数据。完整约束见
[设计文档](docs/superpowers/specs/2026-09-16-openkylin-desktop-design.md)。

## 上游基线（2026-10-07 摸牌）

QiLin 自 **3.1.0 起走独立版本线**（上游基线决策，见 QiLin 仓
`plans/2026-10-05-independent-version-line-baseline.md`）：3.0.11 是 dsh
升级 saga 的闭环点，此后版本号自主演进，原 dsh（deepseek-harness）上游降为
参考源——借鉴不 merge。对本仓库有直接影响的 3.1.x 事实：

- **DSH 兼容面收窄为兼容层**：`@qilin-agent/dsh-compat` 是长期兼容面（第三方 dsh
  插件可安装可加载），但 QiLin 自身契约一律以原生 `qilin.*` 键为准；命名
  空间已整体从 `@deepseek-ai/dsh-*` rescope 为 `@qilin-agent/*`（3.1.3 起；`@qilin` scope 被第三方持有）。
- **上游 `apps/desktop` 已移除**（3.1.x 只剩 `apps/cli` + `apps/web`）：
  上游不再提供 Electron 壳与 `package:desktop:mac:arm64` 打包链——升级锁
  后发布管线必须改为以本仓库自有 `desktop/` 壳为打包主体（见跟进项）。
- **web 与产品 profile 收敛**：3.1.0 起 `qilin web` 也组装 web-brand 品牌
  层，鲸鱼兜底去化；`--dsw-*` 主题 token 词汇表更名 `--qilin-*`（旧名经
  上游 dsw-compat.css 垫片兼容）。
- 当前锁仍锚 3.0.0（aff05948），`desktop/` 壳与补丁按该形态工作；升级到
  3.1.1 的工作清单见文末跟进项。
- **桌面端原生产品重设计已立项**：基于 3.1.1 的接入缝（`qilinDesktopBoot`
  桌面启动门、`__QILIN_TRANSPORT__` 钩子、`runProfile` 程序化 boot），把
  桌面端从"web 套壳"升级为真正的桌面端产品（自有壳 + 引擎宿主子进程 +
  `qilin-app://` 私有协议承载 + 完整产品链），参考 dsh `apps/desktop` +
  `apps/desktop-host` 已验证形态。设计见
  [桌面端原生产品设计](docs/superpowers/specs/2026-10-07-openkylin-desktop-native-design.md)。

## 常用命令

```sh
npm test                          # 全部产品层测试（Node 原生 runner）
npm run dev                       # 启动品牌化桌面开发环境（见下节）
npm run verify:upstream           # 校验上游锁
npm run verify:branding           # 校验品牌清单与对比度
npm run fetch:upstream -- <repo> <commit> <version> <out>
npm run apply:branding -- <productRoot> <upstreamRoot> <registry.json>
npm run verify:sync -- <webDist> <desktopDist> [report.json]
npm run verify:artifact -- <desktop-runtime.json> <lock> <artifactDir> [checksumsOut]
npm run release:manifest -- <lock> <sync> <checksums> [manifestOut]
```

## 桌面开发环境（KCoder host & sidecar 机制）

`npm run dev` 参考 KCoder（DSH Desktop）的实现机制，把桌面端做成 qilin web
侧车的**宿主**，而不是另一套工作区实现：

```
OpenKylin Desktop（Electron 壳，desktop/ 目录，零 npm 依赖）
  ├─ 中文品牌启动页（splash，本地资源，不依赖侧车；失败态有重试/复制诊断）
  ├─ spawn  node apps/cli/lib/bin.js --port 0 --no-open   （品牌化侧车，产品面）
  ├─ stdout 就绪行 qilin: http://127.0.0.1:<port>/workspace?token=…
  └─ shell 窗口 loadURL 上述地址 —— 与浏览器访问 web 端是同一个 server、
     同一份 Web Client 构建物、同一套主题与数据（$QILIN_HOME）
```

侧车启动的是上游**产品面**（裸 `qilin`，shipped profile `qilin` = base +
web-app + web-brand）：web-brand 层把麒麟印章品牌位与宣纸/墨色主题层
（`ui-brand` + `ui-theme-brand`）插入浏览器模块清单——这是上游原生的产品
视觉，`shared-web-branding.patch` 再把印章渐变与印章色 token 统一到
OpenKylin 朱砂（`#B7352C`/`#C94A40`）。桌面工作区与上游 QiLin 的 web 端
因此**按构造完全一致**：shell 窗口是侧车的纯浏览器载体（sandbox、无
preload、无任何注入），QiLin 升级自动跟随。安全
边界：导航只允许停留在当前侧车 origin，外链转系统浏览器，权限请求一律
拒绝；进程纪律：侧车崩溃指数退避重启（上限 3 次），退出走 SIGTERM → 5s
宽限 → SIGKILL，另有 detached watchdog 兜底——即使主进程被 `kill -9`
也不留孤儿侧车。

dev 脚本按 stamp 复用 `.tmp/dev/qilin-src`（锁 commit + 品牌输入指纹匹
配时不重建，保住 node_modules 与构建产物）；侧车构建物（CLI bin 与 Web
dist）缺失时自动经上游工具链补建（`CI=true pnpm install → build:qilin`，
后者是绑定客户端公共环境的上游产品构建：版本徽章、commit 与构建 profile
随产物烘焙）；Electron 二进制取自品牌化 checkout（与上游同版本，下载缺
失时自动执行 electron install.js 补装）。上游
契约（就绪行、flags、bin 路径、home）集中在
`desktop/main/qilin-contract.mjs`，升级上游只改这一个文件。

受限执行环境（CI 容器、嵌套沙箱）可用的逃生口，普通终端无需设置：
`OPENKYLIN_USER_DATA`（重定向 Electron userData）、`QILIN_HOME`（重定向
harness home）、`ELECTRON_DISABLE_SANDBOX`（绕过外层沙箱对 Chromium OS
sandbox 的干扰）、`OPENKYLIN_ELECTRON_NO_GPU=1`（无头/CPU-only runner 追加
`--disable-gpu`）、`OPENKYLIN_ELECTRON_ARGS`（追加任意 Electron 开关，空白
分隔）、`OPENKYLIN_QILIN_RUN`（显式指定品牌化运行树）。

## 首次发布前置（人工）

1. 将授权 Logo 放入 `branding/logo/qilin.svg`。
2. 用真实上游 40 位 commit 替换锁文件全零占位。
3. 针对锁定 commit 依次生成三个品牌补丁，并确认与 `patches/registry.json` 登记一致：
   - `patches/shared-web-branding.patch`（共享 Web Client 的中国文化主题/品牌文案，scope `packages/client`）；
   - `patches/desktop-locale.patch`（桌面壳中文文案，scope `apps/desktop`）；
   - `patches/desktop-branding.patch`（桌面壳品牌化：窗口标题/关于页/启动页视觉，scope `apps/desktop`）。
   任一补丁缺失时 CI 在 Apply branding 步骤失败（设计上的 loud fail，不生成半品牌化产物）。
4. 配置 `release` environment：
   - vars：`QILIN_DESKTOP_APP_ID`、`QILIN_DESKTOP_MACOS_SIGNING_IDENTITY`、`QILIN_DESKTOP_MACOS_TEAM_ID`、`OPENKYLIN_UPDATE_ORIGIN`（`https://github.com/<owner>/<repo>/releases/latest/download`）；
   - secrets：`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`、`APPLE_API_KEY_PEM`（App Store Connect API 私钥，打包步写入临时 .p8）。

## 更新通道说明

自动更新走 electron-updater generic provider，指向本仓库 GitHub Release 的
`releases/latest/download` 动态路径。上游 `production` 更新环境指向其官方域名，
本项目**不得使用**；发布统一走 `QILIN_DESKTOP_AUTO_UPDATE_ENV=test` +
`DOWNLOAD_TEST_ORIGIN` 机制（仅指打包期写入的更新 URL 选择，不代表质量环境）。

## 设计规范

- 中国文化主题为共享 Web Client 注入（`branding/brand-manifest.json` + `branding/theme/tokens.css`），Web 与 Desktop 同源；Desktop 壳层（启动页/错误恢复/菜单）只做平台适配。
- accent token（朱砂/玉青/鎏金）仅作点缀、大文本或状态图形用途；正文文本一律使用 ink/paper 对（对比度 ≥ 4.5，CI 强制）。

## 跟进项

- **原生桌面端（2026-10-07 设计，按 [桌面端原生产品设计](docs/superpowers/specs/2026-10-07-openkylin-desktop-native-design.md) 实施）**：
  - 已完成：M0 锁升级 3.1.1（`upstream/qilin.lock.json` 指 kkutysllb/QiLin @ `d9dc36d499…`——2026-10-08 对齐到 3.1.1 线最新提交（tag 第四次重发），含文件行类型徽章两连修；历史锚 fdca446ccd…→b2d18618fc…）；M1 引擎宿主子进程（`desktop/host/main.mjs`，`runProfile` 程序化 boot 产品面）；M2 `qilin-app://` 协议承载 + 认证反代 + cookie 罐 + 桌面 boot 门；dev 流程 Electron 自备（钉 44.0.0，原生加载器指纹要求）；M3 产品链（稳定记忆端口 + cookie 罐持久化 0600 → 账号会话跨启动存活；quit-inspection / update-tasks 接 `ctx.agents` / `ctx.jobs` / `ctx.schedule` 真实任务检查；崩溃报告落盘 + 出厂插件面恢复，详见设计文档 §14）。真实任务场景（登录跨启动、任务运行中退出询问、坏插件恢复）待真机验证。
  - 已完成 M4 发版管线（2026-10-08，借鉴 KStock 四层架构）：运行时闭包封盘（`scripts/build-runtime-bundle.sh`——锁定 commit 构建后 `pnpm install --prod` 收闭包，tar + desktop-runtime.json 清单含 sha256）；桌面打包（`scripts/build-desktop.sh`——electron-builder 组装壳 + extraResources 闭包，dmg/zip arm64，首版 unsigned `identity: null`）；自动更新（electron-updater 读 GitHub Releases `latest-mac.yml` + blockmap 增量，安装前先停引擎，`desktop/main/updater.mjs`）；产物门 V1–V7（`scripts/verify-desktop-artifacts.sh`）；本地入口 `scripts/release.sh`（门禁→打包→产物门→tag→push）+ CI `.github/workflows/release.yml`（仅 tag 触发，单平台 arm64——配额策略）。打包态首启解压闭包到 userData/runtime/<commit>/（sha256 校验，`desktop/main/runtime-install.mjs`）。签名公证已接 GitHub secrets（MAC_CERTIFICATE/.p12 + 公证三件套），CI fail-closed 门校验缺凭据即拒。
- **双端同场景 e2e**：设计 §9.2 要求 Web 浏览器端与 Desktop 端跑同一组功能场景（新建会话、发送消息、流式响应、Session 切换、设置、错误提示与恢复重试）及文案/主题 Token 一致性检查；当前由构建物摘要门禁（webBundleSha256 全等）保证同源，场景级 e2e 需在首次真实构建可产出后补齐（拟复用上游 `apps/web/tests` fixture 形态）。
- `verify-upstream` 默认路径改为模块相对定位；CLI 入口守卫改用 `pathToFileURL` 精确比较（累积审查 Nice-to-have）。
- 标题栏配色探针改读 `--qilin-specific-sidebar-fill`（3.1.0 起的主词汇表；旧名 `--dsw-*` 由上游 dsw-compat.css 垫片兼容，当前双版本均可工作）。
