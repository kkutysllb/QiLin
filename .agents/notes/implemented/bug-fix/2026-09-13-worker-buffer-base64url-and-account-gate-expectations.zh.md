# Agent Note: worker Buffer 的 base64url 拼写与账号界面的门禁

Status: implemented

[English](2026-09-13-worker-buffer-base64url-and-account-gate-expectations.md) | 中文

## Problem

纯浏览器 worker 部署会从打包镜像里启动随产品发布的 `web` profile，而该 profile 包含 `@qilin/accounts-local`（见[本地账号与落地页](../feature/2026-09-12-qilin-local-accounts-and-landing.zh.md)）。该插件用 Node 的 `base64url` 编码存放会话签名密钥、并以此命名每个会话 cookie——`randomBytes(...).toString('base64url')`、`Buffer.from(value, 'base64url')`、`createHash(...).digest('base64url')`——`@qilin/context-session-reference` 也用同样方式构造 Session 引用 URI。worker 的 `node:buffer` shim 是 npm 的 `buffer` 包（feross 6），它只实现 `base64`，于是激活抛出 `Unknown encoding: base64url`，隧道拒绝整个启动负载：`web-preview tunnel: boot payload failed with HTTP 503: qilin-webworker: plugin tree failed to load: failed to apply loader entry accounts (@qilin/accounts-local)`。验收场景（[preview-boot.e2e.ts](../../../../apps/web/tests/preview-boot.e2e.ts)）随后为了一棵从未激活的树等满了 240 秒的里程碑。

账号门禁默认开启，而有三处期望早于它。真机 smoke 把打印出的地址断言为 `http://127.0.0.1:<port>/?token=…`，而启动器打印的是其传输自己拥有的入口路径——`authenticatedUrl` 用的是 `WEB_ENTRY_PATH`，站点根现在服务落地页。同一场景在 Node 侧的探测只带了启动令牌换来的设备 cookie，而门禁拒绝一切非 auth 的 `/api` 路由：三个用例以 `session/create failed over HTTP 401: unauthorized` 失败。同一交接的 CLI 装配快照（[web-browser-open.expected.e2e.ts](../../../../apps/cli/tests/web-browser-open.expected.e2e.ts)）在三处 inline 快照里钉住根路径地址，而它的 opener 夹具——默认浏览器的替身——同样只出示设备 cookie，于是它记录到的文档变成首次运行文档，其 `bootManifest: true` 证据读作 false。

另有两处场景步骤已经落后于它们所指的界面。preview 场景点击的 `Continue` 按钮属于[设置重写](2026-09-13-qilin-brand-surfaces-and-settings-entry-point.zh.md)移除的预发布版本提示；该定位器仍然命中，因为它按子串匹配到了 provider onboarding 对话框里的 `Save and continue`，而密钥框为空时那个按钮是禁用的。此外，bundle 的 browser-open 夹具把 connection 桩成了根路径地址、且不带 `entryPath`，于是它打开的规范地址落到公开文档表上，返回 404。

## Decision

**Node 的 `base64url` 由 worker 的 Buffer 提供。** [base64url.ts](../../../../packages/experimental/webworker-runtime/src/polyfill/buffer/base64url.ts) 在该包自己的 `base64` codec 之上互换两种字母表，并补上 Node 定义的字符串边界：`from`、`prototype.toString`、`prototype.write`、`byteLength` 与 `isEncoding`。`fill` 与 `alloc` 经 `from` 走到同一条路，这正是补边界而不是补各个 codec 的原因。[buffer.ts](../../../../packages/experimental/webworker-runtime/src/node/builtin_modules/implemented/buffer.ts) 在安装全局之前应用它，`node:crypto` shim 的 `digest` 也接受该拼写。[buffer-base64url.spec.ts](../../../../packages/experimental/webworker-runtime/tests/node/buffer-base64url.spec.ts) 是差分检查：它给 Node 的 Buffer 打补丁，把每个语料数组的编码、解码、字节数与写入与 Node 自身的编码逐一对比，并在结束后还原原生实现。真正证明「同一套互换在浏览器实际打包的那个包上成立」的是打包 worker 的验收运行，而它现在两个 preview 半场都能启动。

**smoke 按部署期望的方式建立账号。** [smoke-real.e2e.ts](../../../../apps/web/tests/smoke-real.e2e.ts) 用 `WEB_ENTRY_PATH` 断言打印地址，并由一个 `authenticatedWeb` 助手完成交接的两半：先兑换打印出的令牌，再经 `/api/auth/setup` 初始化首个账号并保留它返回的会话 cookie。Node 侧探测带上该 cookie，浏览器上下文在打开打印地址之前也接纳它，于是页面到达应用文档而不是首次运行界面。real-key 块用同样方式准备它的页面。

**CLI 交接夹具会建立它所在部署缺的那个账号。** [open.mjs](../../../../apps/cli/tests/fixtures/web-browser-open/open.mjs) 先用设备 cookie 经随产品发布的端点初始化首个账号，再用它换来的会话请求入口路径——这正是浏览器面对首次运行部署时走的旅程。因此它记录的 `bootManifest: true` 依然意味着到达了应用文档，而 inline 快照记录的是入口路径。

**worker 部署的账号入口渲染为未登录，这一点被记录而不是改道。** 页面半从自身 origin 读 `/api/auth/status`，静态宿主在那里回答 404；客户端把不可达的门禁与「没有账号界面」视为同一答案。把这次读改走隧道会从一棵不持有浏览器会话的树回答 `enabled: true, authenticated: false`，菜单随后会给出一个通往本部署并不提供的 `/login` 文档的登出行。该原因现在既是 preview 期望里第三条被接受的静态宿主 miss，也是 worker 包的一条限制。

**bundle 夹具镜像应用真正读取的 connection。** [browser-open.spec.ts](../../../../packages/bundle/web-app/tests/browser-open.spec.ts) 给它的桩加上 `entryPath`，并用 `WEB_ENTRY_PATH` 构造打印地址，于是被服务的索引就是入口路径所指的文档。

## Alternatives considered

**让使用 `base64url` 的包改用别的编码。** 否决：shim 的职责就是与 Node 对齐，任何生成 URL-safe base64 的依赖都会撞上同一堵墙。它产生的故障是凭据锁内部迟到的 `TypeError`，最终表现为 503 启动负载和 240 秒超时，而不是一条「编码缺口」的提示。

**把页面半的 `/api/auth` 读取改走隧道传输。** 同上否决：worker 部署没有会话 cookie、没有 `/login` 与 `/setup` 文档，其 handler 也从不查询已安装的权限，因此改道后的答案会给出根本用不了的行。

**在 smoke 的浏览器半场走一遍首次运行文档。** 否决：落地页、初始化、登录与门禁的旅程由 `accounts-auth.e2e.ts` 拥有，而那些静态文档自带 locale，会把 smoke 的英文页面耦合到它并不拥有的文案上。

**在 worker 组合里关掉 accounts 行。** 否决：该部署有意原样启动随产品发布的 `web` profile，它的启动补丁只覆盖浏览器做不到的部分。该插件的门禁在隧道路径上是惰性的，所以把它留在原处只多一次启动写入，换来镜像是该 profile 的诚实副本。

## Consequences

worker 部署可以启动，其验收运行覆盖整个带数据的 preview：会话、技能、设置、凭证、子代理与历史分页。对会按编码表分支的镜像包来说，`Buffer.isEncoding('base64url')` 现在回答 true，而 `Buffer.byteLength`、`write`、`fill` 在该包过去给出 UTF-8 长度或直接抛错的地方接受它。

账号界面仍是服务端部署的功能：worker 部署的账号入口按设计处于未登录状态，`/login`、`/setup` 与 `/api/auth` 路由从其页面 origin 依旧不可达。若将来有部署把 worker 放在真正提供这些文档的宿主之后，需要重新审视这个决定。

装配的 browser-open 快照保留了它的 `bootManifest: true` 证据：夹具现在到达的是应用文档而不是首次运行文档。

smoke 的四个无密钥用例在车道里运行；real-key 块准备同样的会话，但没有 `DEEPSEEK_API_KEY` 时会自跳过，因此它的断言在此处尚未验证。
