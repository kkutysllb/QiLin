# QiLin 3.0.0：landing 页 + 本地账户登录（参考 2.0.x）

状态：已实施（实施记录见文末）
日期：2026-09-12

## 背景

2.0.x（`2.0.0` 分支 `web-demo/`）有完整产品前台：`/` landing 页（玄金麒麟 VI：暖玄黑底 + 鎏金 + 朱砂「麒麟」双字印）、`/login`（登录 / 注册切换）、`/setup`（首次初始化管理员），后端 `/api/v1/auth/*`（setup-status / initialize / login/local / register / change-password + HttpOnly cookie 会话）。新任务页是 `Welcome`：背景淡「QiLin」字标 + 时段问候 + 标语。

3.0.0 的 Web GUI 是单页 harness：`/` 直接进控制台，浏览器侧只有进程启动 token（`?token=` → authority 绑定的设备 cookie，见 `client-connection` 的 `BrowserAuth`），没有账户概念，没有产品前台，logo 仍是官方鱼形标。

## 目标

1. `/` 提供静态 landing 页（无 React、无 npm 依赖），`/login` 与 `/setup` 提供静态认证页；控制台入口改为 `/workspace`。
2. 本地账户：`$QILIN_HOME/auth/accounts.json`（scrypt 口令散列）+ HMAC 签名 HttpOnly 会话 cookie；默认强制登录，`enabled: false` 关闭门禁（回到设备 token 语义）。
3. 门禁在服务端生效：索引文档未登录 302 `/login?next=<path>`；`/api` 未登录 401（`/api/auth/*` 除外）。客户端只渲染已被授权加载的文档，不做前端鉴权判断。
4. 品牌统一：favicon 与 GUI 品牌印章换成 2.0.x 的朱砂「麒麟」印；装配行由 `ui-brand-official`（鱼）切到 `ui-brand`（印章重做）。
5. 新任务页 hero 改成 2.0.x `Welcome` 样式：背景淡「QiLin」字标 + 时段问候 + 标语；去掉「预览版」徽章。

## 契约

### HTTP（`/api/auth/*`，全部受 Host/Origin 信任栅栏保护）

| 方法 | 路径 | 请求体 | 成功 | 失败 |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/status` | — | 200 `{ enabled, needsSetup, authenticated, registrationOpen, user }` | — |
| POST | `/api/auth/setup` | `{ email, password }` | 200 `{ user }` + Set-Cookie | 409 `already-initialized` |
| POST | `/api/auth/register` | `{ email, password }` | 200 `{ user }` + Set-Cookie | 403 `registration-closed` / 409 `email-taken` |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ user }` + Set-Cookie | 401 `invalid-credentials` |
| POST | `/api/auth/logout` | — | 204 + 清 cookie | — |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword, email? }` | 200 `{ user }` + Set-Cookie | 401 `invalid-credentials` |

失败体统一 `{ error: { code, message } }`。口令最短 8 位；邮箱去空白并小写。

### 服务与配置

- `packages/client/connection`：新增常量 `WEB_ENTRY_PATH = '/workspace'`（`authenticatedUrl` 与 token 交换的路径）；新增 `ctx.connection.session.install(authority)` 席位（唯一所有者），`ConnectionSessionAuthority` 携带 `authorizeIndex(request, response)`（公开路径判定 + 未登录 302）、`isPublicApiRequest(request)`、`verify(request)`。未安装权威时保持今天的设备 cookie 语义。
- `packages/host/frontend-static`：Config 增 `indexPaths`（默认 `['/', '/index.html']`，受 `connection.authorizeIndex` 门禁）与 `documents`（`{ path, file }` 公开文档表，先于索引匹配，注入 `<base href="/">`）。
- 新包 `packages/identity/accounts-local`（`@qilin/accounts-local`，host 单面插件）：账户仓储 + `/api/auth/*` + 索引/API 门禁权威；Config `{ enabled=true, registration='open', sessionMaxAgeDays=30, qilinHome? }`；会话密钥经 `ctx.credentials`（`accounts-local/session-secret`）持久化。
- `packages/bundle/web-app`：装配 `accounts` 行（浏览器名册之外）与 frontend-static 的文档表 `[`/`→landing.html，`/login`、`/setup`→auth.html]`、`indexPaths: ['/workspace', '/index.html']`。

### 文档（apps/web）

- `landing.html` + `src/landing/*`：静态 landing（玄金麒麟 VI，文案在 HTML 里，TS 只做词轮播等行为；`verify-client-ui-i18n` 扫描 `apps/web/src/**/*.{ts,tsx}`，故文案不进 TS）。
- `auth.html` + `src/auth/*`：静态认证页（登录 / 注册 / 初始化管理员三态，按 `location.pathname` 与 `status` 决定；成功后跳 `?next=` 或 `/workspace`）。
- `vite.config.ts` 增 `landing` / `auth` 两个 HTML 入口；`manifest.webmanifest` 的 `start_url` 改 `/workspace`。

## 验收

- 单测：`accounts-local`（散列、状态机、门禁、端点）、`connection`（席位 + 门禁分支）、`frontend-static`（文档表 + 索引路径）。
- `test:gui`、`QILIN_SNAPSHOT=replay pnpm run test:web`：e2e 脚手架补 `accounts.enabled=false` 补丁并沿用 `authenticatedUrl`（303 落在 `/workspace`）；新增认证 lane。
- 真机：`pnpm qilin --port 3090` → 首次进 `/setup` 建管理员 → 登录 → 控制台；`/api` 未登录 401；登出后 `/workspace` 302 到 `/login?next=%2Fworkspace`。
- 视觉：landing / 登录 / 新任务页截图核对 2.0.x。

## 非目标

- 多用户数据隔离（账户只是访问门禁，控制台数据仍是单一 harness home）。
- OIDC / JWT / 用户管理页。
- landing 与认证页接入客户端 locale 系统（它们是会话前的静态文档，文案照 2.0.x 用中文；会话内的文案仍走 typed locale 字典）。

## 实施记录（2026-09-12）

### 与计划的偏差

| 计划 | 实际实现 | 原因 |
| --- | --- | --- |
| 入口路径写死为 `/workspace` 常量 | 常量 `WEB_ENTRY_PATH` + 服务成员 `ctx.connection.entryPath` | 依赖策略禁止新增跨包值导入（`safeHostDependencyExports` 需人工评审），dist 服务器改从服务读取入口路径 |
| `frontend-static` 的 `indexPaths` 有 schema 默认值 | schema 不给默认，`apply` 内解析（省略或空数组 → 入口路径 + `/index.html`） | schemastery 会把省略的数组字段物化成 `[]`，默认值必须在代码里、且以「空即默认」表达 |
| 登录/初始化页由客户端插件渲染 | `apps/web/auth.html` 静态文档（无 React） | `/login`、`/setup` 是会话前文档；客户端插件方案需要在 `ui-layout` 之上再插入 root 占用者 |
| 只用 `authorizeIndex` 判定 | 新增 `ctx.connection.session` 席位（`ConnectionSessionAuthority`） | 门禁由服务端两处执行：索引文档与 `/api`；未安装权威时保留设备 cookie 语义 |
| —— | 认证页把服务端错误码映射为页面自己的中文文案 | 服务端 message 为英文，页面文案归页面所有（`data-copy="error.<code>"`） |
| —— | 认证页在 `/setup` 与 `/login` 之间按 `needsSetup` 自我重定向 | 两个文档都是公开静态文件，入口门禁看不到它们 |

### 验收证据

- `packages/identity/accounts-local`：4 个 spec 文件 26 用例；`src/**` 语句/分支/函数/行 100%。
- `packages/client/connection`、`packages/host/frontend-static` 在被改动的源码上仍是 per-file 100%。
- `pnpm run test:gui`：379 文件 / 5390 用例通过。
- `QILIN_SNAPSHOT=replay pnpm run test:web`：新增 `apps/web/tests/accounts-auth.e2e.ts` 覆盖 landing → 首次初始化 → 控制台 → 重载 → 登出 → 登录 → 错误文案 → 会话门禁（单跑通过）。
- 真机：`QILIN_HOME=$PWD/.qilin-home/verify pnpm qilin --port 3091`，浏览器实测 `/`（landing）、`/setup`（初始化管理员）、`/workspace`（控制台新任务页）、`/login`（登录与错误文案）；`curl` 复核：匿名 `/api/anything` 401、匿名 `/workspace` 302 `/login?next=%2Fworkspace`、登录成功下发 30 天 HttpOnly SameSite=Strict 会话 cookie。
- `pnpm run typecheck`、`pnpm run lint`（0 error）、`pnpm run test:docs`（16 gates）、`verify-translation-pairing`、`verify-md-links`、`verify-cordis-config`、`verify-package-dependencies`、`verify-client-packages` 全绿。

### 已知限制

- 账户只做访问门禁：多个账户共享同一 harness home（Sessions、凭据、文件）。
- 注册默认开放；绑定非回环地址前应设 `registration: closed`（补丁行与 README 已写明）。
- 登录失败没有速率限制（scrypt 成本是唯一刹车）。
- landing 与认证页是中文静态文档，不接入客户端 locale 系统；`© 2026` 为字面量。
- 会话 cookie 无服务端注销表：登出清 cookie，改密靠凭据代际失效。
- 账户文件在激活时读取：运行中删除该文件不影响当前进程，重启后回到首次初始化。
## 追加记录（2026-09-12 晚）：版本徽章、账户菜单与设置项迁移

用户反馈（workspace 顶部 logo 徽章 + 底部用户菜单 + 设置页清理）：

1. **版本徽章**：从「QiLin」下方的小胶囊移到麒麟印章**右上角**（绝对定位、11px 字号、16px 高、描边胶囊），显示**产品版本号**，完整构建串（含提交号/dirty）挂在 title 上。产品版本按用户选择整体提升到 3.0.0：根 manifest 与 279 个 @qilin/* 清单同步（constraints 门禁要求家族版本一致，@deepseek-ai/* 保持不变）。
2. **底部用户菜单**（新包 @qilin/client-ui-account）：占 sidebar.footer.action，头像按钮打开 Menu：账户邮箱行（GET /api/auth/status）、设置、主题样式（浅色/深色/跟随系统子菜单）、语言（中文/English 子菜单）、退出登录（POST /api/auth/logout → /login；门禁关闭或未登录时不显示）。
3. **设置页迁移**：删除「通用」里的语言选择（ui-locale 的 LanguageRow）与外观选择（ui-theme 的 AppearanceRow）；偏好写入分别由 ctx.locale.setLocale() / ctx.theme.setTheme() 提供，菜单直接调用；字号行保留。
4. ui-settings-general 新增 ctx.settingsShell.open(sectionId?) 服务：菜单的「设置」项通过它展开面板（面板状态仍由 occupant 持有，服务只传请求）。
5. ui-primitives 新增 IconLogoutOutline16。
