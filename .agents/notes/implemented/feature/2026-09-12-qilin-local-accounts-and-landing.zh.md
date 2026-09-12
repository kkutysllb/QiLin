# Agent Note: QiLin 本地账户与公开落地表层

Status: implemented

[English](2026-09-12-qilin-local-accounts-and-landing.md) | 中文

## Problem

QiLin Web GUI 只有一个文档。站点根路径提供应用，唯一的浏览器凭据是启动器打印的 URL 中的进程启动令牌：它签发出绑定 authority 的 cookie，而每个 /api 请求都需要它。不带该令牌直接输入 loopback 地址的浏览器会得到 401 文本。这里没有产品门面，没有从链接进入控制台的方式，也完全没有账户概念——在一次启动内能到达该端口的人就是用户。

2.0.x 产品代次三者皆有：站点根路径的落地页、带账户切换的登录页、初始化管理员的首次运行页，以及每次 API 调用背后的会话 cookie。本次变更在 3.0.0 架构上恢复这一形态，但不采用 2.0.x 的多用户服务器：账户只为单个 harness home 的访问设置门禁。

## Decision

**应用文档移到 transport 入口路径 `/workspace`，站点根路径变成公开落地页。** `client-connection` 中的 `WEB_ENTRY_PATH` 是启动令牌交接唯一瞄准的路径，`ctx.connection.entryPath` 发布它，因此 dist 服务器可以在那里安置自己的 index，而无需第二份字面量副本。

**会话前的表层是静态文档，而不是客户端插件。** `apps/web/landing.html` 与 `apps/web/auth.html` 是 Vite 入口，各自带有纯 CSS 与原生 TypeScript 源码；它们共用已构建的资产流水线，不引入 React，也不依赖客户端插件树提供的任何东西。`frontend-static` 通过新增的 `documents` 配置提供它们：公开文档按自身字节提供，带站点根 `<base href="/">` 锚点，且绝不运行 index 转换器或 index 门禁。与之配套的 `indexPaths` 默认取 transport 的入口路径加 `/index.html`，因此部署交给浏览器的路径始终是服务器会应答的路径。

**账户位于 `@qilin/accounts-local`，一个拥有整个表层的宿主插件。** 它读取 `$QILIN_HOME/auth/accounts.json`（0600，原子替换），其中存放 scrypt 密码哈希；用凭据提供方持有的 HMAC 密钥签发绑定 authority 的 HttpOnly cookie；在 Connection 的 Fetch 注册表上注册 `/api/auth` 端点；并在启用时安置账户会话门禁。该插件不发布服务：没有别的东西读取账户。

**Connection 拥有执行点，认证能力拥有判定。** `ctx.connection.session.install(authority)` 安置唯一的 `ConnectionSessionAuthority`。authority 一旦安置，`requestRejection` 就要求除该 authority 声明为公开的请求之外的每个 `/api` 请求都携带会话；`authorizeIndex` 只为通过校验的会话提供受门禁 index，在没有账户时把匿名浏览器重定向到首次运行文档，之后重定向到 `/login?next=<路径>`。没有 authority 时 transport 保持此前的启动令牌行为，这正是 `enabled: false` 恢复的状态。

**门禁在服务端，位于提供资源的操作里。** 未认证的浏览器永远不会收到应用文档，因此任何客户端检查都无法通过直接导航绕过，客户端自身也不需要认证状态。

**注册默认开放，并把该警示写在操作者会读到的地方。** 随附部署绑定 loopback 且只有一个用户；该行的注释与包 README 都说明，绑定到 loopback 之外的部署要关闭注册，因为在那里创建的账户同样能到达相同的 Session、凭据与文件。

## Alternatives considered

**把登录页面渲染成客户端插件，并让站点根路径继续作为应用。** 这需要在 `ui-layout` 的 `AppFrame` 之上新增占位者（root 只有一个占位者），它会为一个无法使用它的访问者挂载整个外壳——连同其 RPC——或者需要一个遮罩去隐藏已经在运行的外壳。会话前页面还会为永不改变的文案继承客户端 locale 系统与主题呈现器。

**把登录路径 import 进组合，而不是逐行声明。** `web-app` 需要这两个路径来构建文档表，而 `accounts-local` 需要它们作为重定向目标。跨包 import 它们会给 `safeHostDependencyExports` 增加条目，而该策略禁止自动新增；通过 Cordis 配置传递它们又会让这些路径变成用户可调。组合声明自己的文档表，门禁拥有自己的重定向目标，因此这两个事实只在随附部署中相遇——那里的 e2e 通道证明被重定向的浏览器会落在服务器确实提供的文档上。

**同时要求启动令牌与账户会话。** 两种凭据都是由同一台服务器签发的绑定 authority 的 cookie，而账户会话严格更强：同时要求令牌会让收藏的 `/workspace` 在启动器打印新的 URL 之前一直失败。

**按用户隔离租户。** 那样账户就需要逐用户的 harness home、Session 根、凭据与文件。本次变更保留单个 home，并在包 README 中写明账户是访问门禁而不是边界。

**为这两份静态页面做服务端 locale 协商。** 它们携带中文文案，与它们复刻的 2.0.x 页面一致；客户端 locale 系统从会话开始，而这些文档在会话存在之前就已提供。

## Consequences

会话能跨进程重启存活，因为 cookie 是签名令牌且密钥持久；密码或邮箱变更会递增账户的凭据代数，因此此前签发的所有会话都不再通过校验。丢失 `auth/accounts.json` 就丢失了账户（操作者删除它以重新开始），而丢失凭据记录会轮换签名密钥，从而在不动账户的情况下作废所有会话。

非 loopback 绑定上的开放注册等于把完整访问权授予任何能到达该端口的人；随附的行与 README 都写明要关闭它，而门禁本身是浏览器与 harness 之间唯一的东西。

落地页与登录页是 locale 系统之外、不带版本的中文产品文案，标签页图标是用与应用内品牌标记相同轮廓绘制的朱红印章，因此两者都不依赖机器上安装字体。

PWA manifest 现在从 `/workspace` 启动，因为安装该应用应当打开控制台，而不是营销页。
