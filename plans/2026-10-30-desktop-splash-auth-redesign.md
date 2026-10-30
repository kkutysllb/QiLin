---
description: "桌面端 3.1.8-rc.3 首批：新增原生启动 Splash 窗口 + 重设计欢迎页注册登录 UI（品牌印玺方向），红线、契约保持项、验证矩阵与批次状态。"
kind: "plan"
---

# 桌面端启动 Splash 与注册登录 UI 重设计（3.1.8-rc.3 首批）

- 日期：2026-10-30 · 前置：3.1.8-rc.2 已发布（plans/2026-10-28-upstream-0.2.2-alpha.2-alignment.md §6/§7.3）。
- 范围：`apps/desktop` 两个表现面——(1) 新增启动 Splash；(2) 重设计欢迎页（注册/登录/API Key/平台授权状态）视觉层。
- 不做：账号/后端契约变更（`WelcomeApi`、`local-auth.ts`、`welcome-backend.ts` 不动）；Web 客户端 `ui-account` 面（/api/auth 门）不动。

## 1. 现状（已核实）

- 桌面壳无任何 Splash：旧 OpenKyLin `desktop/`（有 splash.html）已随对齐移除；上游 `apps/desktop` 也没有。冷启动期间（宿主 boot）无视觉反馈。
- 欢迎页为 QiLin 自有 React 面：`src/client/WelcomePage.tsx`（entry/login/register/key/account 五页）+ `renderer/welcome.css`（393 行覆盖层）+ 窗口 `src/welcome-window.ts`（600×700，macOS vibrancy / Win acrylic）。
- 品牌体系：印章红 app mark（`renderer/assets/qilin-mark.svg`，朱红渐变 + 金描边）、金铜调别名（`welcome-palette.generated.css`：亮 #8f6f2e / 暗 #c9a24a，暖米白/暖墨色）、Montserrat 品牌字（`lib/welcome/brand-font.css`）。
- 契约与测试锚点：`WELCOME_IPC` 通道、`window.dshWelcome` preload、元素 id（#sign-in/#login-form/#register-*/#key-*/#auth-*）、`tests/welcome-renderer.client.spec.tsx`（含 expected 快照）、`tests/welcome-window.spec.ts`（钉住窗口 options）、`tests/welcome-flow.e2e.ts`。

## 2. 设计方向：「麒麟印玺」refined-luxury

- 色彩：印章朱红（mark 原色）点睛 + 帝王金（palette 别名）主线 + 暖墨/暖米白中性面；亮暗双 scheme 走既有 `--dsw-alias-*`，不新增色板文件。
- 字体：Montserrat（品牌字，已随包分发）做 display；正文走系统栈。品牌名「QiLin Desktop」为专有名词，不涉 locale。
- 质感：细金发丝线（1px `--dsw-alias-border-l2`）、低透明度印章水印、暖色纸感颗粒（CSS 噪点，克制）。
- 动效：进场一次性编排（mark → 文字 → 表单 60ms 级联，200ms ease-in-out）；翻页淡入 + 8px 位移；`prefers-reduced-motion` 全量降级（沿 welcome.css 既有先例）。

## 3. 批次

### S1 Splash（新面，队友 splash 独占写）
- [x] `src/splash-window.ts`：360×360 无边框窗（darwin: vibrancy+透明；win32: acrylic；linux: 白底），resizable/maximizable/fullscreenable=false，skipTaskbar，居中，show:false → ready-to-show 再 show；参照 `mandatory-update-window.ts` 的模块形态。
- [x] `renderer/splash.html` + `renderer/splash.css`：零脚本纯 CSS（CSP `default-src 'none'; style-src 'self'; img-src 'self'`）；印章 mark 呼吸动效 + 金环 conic 进度环；无文本（规避 locale 与 i18n 门）。
- [x] `src/main.ts` 接线（本批只有 splash 队友可改 main.ts）：whenReady 即建（宿主 boot 前）；enterWorkspace / showWelcome / mandatory UI / fatal recovery / will-quit 关闭；不做超时强关。
- [x] `tests/splash-window.spec.ts`：窗口 options 确定性 + 生命周期（沿 welcome-window.spec 形态）。

### S2 注册登录重设计（队友 welcome-auth 独占写）
- [x] `src/welcome-window.ts`：窗口改 880×560 横向分栏卡片（contract 保持：sandbox/preload/locale 参数不动），trafficLightPosition 随布局调整；同步 `tests/welcome-window.spec.ts` 断言。
- [x] `src/client/WelcomePage.tsx`：结构改「左品牌栏（约 320px：墨色实底、印章水印、mark+词标+tagline+描述+金发丝线）/ 右表单栏」；entry 页新增「注册」次按钮（后端拒绝理由 welcomeAccountExists 已有兜底）；所有元素 id、禁用逻辑、错误语义、analytics 调用、passwordField、StateDot/Toast 全部保持。
- [x] `renderer/welcome.css`：按 §2 方向重写视觉层（保留 window-material 引用与调色板变量口径）。
- [x] 测试：`welcome-renderer.client.spec.tsx` 增 entry 注册按钮断言；expected 快照按新可见按钮集重录（zh-CN/en 两份）；desktop vitest 全绿。
- [x] 文案零新增：所有可见文案继续走 `locale.ts` 既有键；如需新键（zh/en 双语同步）须在报告中列出。

### S3 收尾（lead）
- [x] 复核两队友 diff；`pnpm --dir apps/desktop run test`；双 face `tsc -b`（host/client 聚合）绿。
- [x] 真机冒烟：`pnpm --dir apps/desktop run dev` 观察 splash → welcome → workspace 时序。
- [x] 本计划回填执行状态；如需 Agent Note（splash 生命周期契约）再落。

## 4. 红线

1. `WelcomeApi`/`WELCOME_IPC`/`local-auth.ts` 契约不变；凭据不过 renderer。
2. renderer HTML 零可见文案（welcome.html 既有 i18n 测试口径延续到 splash.html）。
3. 不动 `SESSION_FORMAT_VERSION`、不新增持久化记录。
4. CSP 保持最严：welcome 与 splash 均 `default-src 'none'`，splash 零脚本。
5. main.ts 只有 splash 队友可改；welcome-window.ts 只有 welcome-auth 队友可改。

## 5. 批次执行状态

- 2026-10-30：**S1 完成（队友 splash）**：splash-window.ts / splash.html / splash.css / splash-window.spec.ts（8 例）新增；main.ts +8 行接好五处关闭点（enterWorkspace / showWelcome / mandatory blocking 翻转 / fatal recovery / before-quit）。验证：desktop vitest 914 例绿；双 face tsc exit 0。偏离：关闭统一 destroy()；reportFatal 仅非 shuttingDown 分支关闭；mandatory 挂 blocking 翻转回调。
- 2026-10-30：**S2 完成（队友 welcome-auth）**：窗口 880×560、交通灯 {x:341,y:21}；WelcomePage 改左右分栏（320px 暖墨品牌栏：印章水印/纸纹颗粒/金发丝线 + 右表单栏 340px）；entry 增 #entry-register 次按钮（复用 welcomeRegisterSubmit 文案）；welcome.css 全量重写（393→532 行，级联进场 + reduced-motion 全停）；welcome-window.spec 断言同步、renderer spec 增 2 例、expected 双语各 +1 行。验证：desktop vitest 916 例绿；双 face tsc exit 0。偏离：入口注册按钮不挂 analytics（纯导航，不放宽 IPC 白名单）；水印走 CSS background（保住首个 img 测试锚点 + CSP）；.titlebar 改全宽 42px drag 层。
- 2026-10-30：**S3（lead）**：合并复核通过；focused 复跑 splash-window 8 + welcome-window 11 + welcome-backend 2 + welcome-renderer 14 = 35 例绿；`tsc -b apps/desktop/tsconfig.json` exit 0。真机冒烟（splash→welcome→workspace 时序）待用户执行；工作树未 commit，待设计复核后落盘。
- 2026-10-30：**真机冒烟完成（用户反馈两处视觉调整一并落盘）**。时序验证：冷启动 splash 显示（宿主 boot 期间）→ welcome 显示时 splash 已关闭（CDP targets：splash_listed=0）→ 有登录态路径直达 workspace 且 splash 关闭；welcome 分栏新 UI 亮暗双 scheme 渲染正确。视觉调整：① 品牌栏印章水印 260px 右下出血 → 148px 完整可见（左下与词标对齐，opacity 0.07）；② mark svg 顶部光晕带（#fff5eb 椭圆）在深色/透明底上呈白色残影，三个使用点（splash-mark / .brand img / 印章水印 ::after）以 clip-path inset(9.4% round 18.2%) 裁到 seal 方块本体。截图：`apps/desktop/.desktop-build/smoke/smoke-{splash,welcome-light,welcome-dark}.png`。环境注意：宿主 shell 的 `ELECTRON_RUN_AS_NODE=1` 泄漏会让 Electron 以 Node 模式启动（须 `env -u`）；宿主 GUI 占用 9222 后 dev 调试口用 `QILIN_DESKTOP_RENDERER_DEBUG_PORT=9333`；node_modules/.pnpm 曾残留 client-ui-forge 悬空符号链接（已清）。工作树仍未 commit。
