---
description: "Web 表层的本地浏览器账户：harness home 下的账户文件、scrypt 密码哈希、签名的 HttpOnly 会话 cookie、/api/auth 端点，以及覆盖应用文档与其他所有 /api 请求的账户会话门禁。"
kind: "package-reference"
---

# @qilin/accounts-local

[English](README.md) | 中文

## 概述

在 Web 部署中挂载本包，浏览器必须先登录才能到达 harness。首位访问者初始化管理员账户；此后每个浏览器都用邮箱地址与密码登录，账户会话门禁只把应用文档与 `/api` 交给本部署签发的会话。账户针对的是一个 harness home 的访问，因此第二个账户同样能到达相同的 Session、凭据与文件。注册默认开放，绑定了 loopback 之外的部署会关闭它。禁用门禁即恢复 transport 的启动令牌交接。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件与 [`qilin-client-connection`](../../client/connection/README.zh.md) 及一个 dist 服务器组合在一起，Web 表层就会在交出应用之前要求账户。它注入 `connection` 与 `credentials` 服务。

### 最小配置

```yaml
- name: '@qilin/accounts-local'
  config:
    registration: closed
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | 要求受门禁的 index 路径与每个非公开 `/api` 请求都携带账户会话 |
| `registration` | `'open'` | 匿名访问者是否可以创建额外账户 |
| `sessionMaxAgeDays` | `30` | 浏览器会话的绝对有效期，单位为天 |
| `qilinHome` | `$QILIN_HOME`，其次 `~/.qilin` | 存放 `auth/accounts.json` 的 harness home |

生成的[配置目录](../../../docs/config-catalog.zh.md#qilinaccounts-local)是每个受支持字段及其 JSDoc 的穷尽式真源。

### 登录流程

请求受门禁 index 路径的匿名浏览器会被重定向到能够建立会话的文档：账户文件里还没有账户时是 `/setup`，否则是 `/login?next=<请求路径>`。登录文档读取 `GET /api/auth/status`，渲染登录或首次运行表单并提交凭据；成功响应本身已经携带会话 cookie，因此浏览器随后导航到经过校验的 `next` 目标或应用入口路径。因为门禁位于提供该文档的操作里，直接导航无法绕过任何客户端检查。

### 端点

每个端点都以 `cache-control: no-store` 返回 JSON，每个拒绝都是 `{ "error": { "code", "message" } }`。

| 端点 | 应答 |
|---|---|
| `GET /api/auth/status` | 200 `{ enabled, needsSetup, registrationOpen, authenticated, user }`；`user` 是 `{ id, email, createdAt }` 或 `null` |
| `POST /api/auth/setup` | 200 `{ user }` 加会话 cookie；已存在账户时 409 `already-initialized` |
| `POST /api/auth/register` | 200 `{ user }` 加会话 cookie；403 `registration-closed`；409 `email-taken` |
| `POST /api/auth/login` | 200 `{ user }` 加会话 cookie；地址未知或密码错误时 401 `invalid-credentials` |
| `POST /api/auth/logout` | 204，并清除该 authority 的 cookie |
| `POST /api/auth/change-password` | 200 `{ user }` 加新的会话 cookie；没有会话时 401 `unauthorized`，当前密码错误时 401 `invalid-credentials`；409 `email-taken` |

`setup`、`register` 与 `login` 读取 `{ email, password }`；`change-password` 读取 `{ currentPassword, newPassword, email? }`，并在其中给出另一个地址时一并更换邮箱。地址在存储与查找前会被去除空白并转为小写，密码至少 8 个字符。不是 JSON 对象的请求体、缺失的凭据字段、形式不合法的地址，以及没有指明 authority 的请求，会分别以 400 `invalid-body`、`invalid-email`、`password-too-short` 或 `invalid-authority` 拒绝。

### 账户会话门禁

`enabled` 为 true 时，插件在 `ctx.connection.session` 安置唯一的 `ConnectionSessionAuthority`，两个执行点都由 Connection 拥有。index 请求经 authority 的 `authorizeIndex`：会话有效时提供文档，其他任何请求都得到上面的 302。在共享 `/api` 路由上，`isPublicApiRequest` 放行 `/api/auth/` 前缀，使浏览器能够登录；`verify` 要求其他所有请求都携带账户会话——缺少会话的请求在通过 connection 包的 Host 与 Origin 校验后得到 401。`enabled: false` 会保留全部六个端点，在状态读取中报告 `enabled: false`，并让启动令牌 cookie 继续掌管 index 路径与 `/api` 路由。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明插件拥有什么，并指出实现它们的文件；可观察行为已在[使用本包](#use-this-package)中说明。

### 设计理念

本包是一个函数插件。`apply` 打开解析后 harness home 的账户文件，通过 `ctx.credentials` 以 `accounts-local/session-secret` 为键加载或创建该部署的会话签名密钥，构建 cookie 所有者，在 `ctx.connection.fetch` 上注册六个路由，并在门禁启用时把会话 authority 安置到 `ctx.connection.session`——该席位只接受一个所有者，第二次安置会让安装方插件加载失败。它不提供任何 Kylin 服务：没有别的东西读取账户，组合通过端点与门禁到达这个表层。

### 账户文件

`$QILIN_HOME/auth/accounts.json` 是一份带版本的文档，为每个账户保存一条记录：不透明的 id、规范化地址、编码后的 scrypt 哈希、创建时间与凭据代数。每次变更都经 `@qilin/atomic-write` 以 0600 模式写入完整后继内容，然后才在内存中发布，因此写入失败时运行中的服务器仍停留在上一份账户集合。文件缺失即空账户集合——首次注册初始化的就是这个状态；而本构建未曾写入的文件会让加载失败，而不是被迁移。

### 密码与会话

存储的哈希是自描述字符串（`scrypt$N$r$p$salt$key`），带逐账户 salt、代价 2^15、块大小 8、并行度 1 与 32 字节密钥；校验按存储的参数重新派生并以恒定时间比较。会话 cookie 是 HMAC-SHA256 签名，按其签发时的请求 authority 命名，并携带该 authority、账户 id、凭据代数，以及不超过 `sessionMaxAgeDays` 的绝对签发与过期区间。它是 host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`。密码或邮箱变更会递增账户的凭据代数，因此此前签发的所有 cookie 即使签名仍能验证，也不再指向任何账户。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `Config`、账户文件与会话密钥加载、路由注册、门禁安置 |
| [`src/routes.ts`](src/routes.ts) | 六个 `/api/auth` 端点、输入校验与错误信封 |
| [`src/gate.ts`](src/gate.ts) | authority 的判定：index 重定向、公开 API 前缀、会话校验 |
| [`src/accounts.ts`](src/accounts.ts) | 持久账户文件：解析、原子替换、凭据代数更新 |
| [`src/password.ts`](src/password.ts) | scrypt 哈希与恒定时间校验 |
| [`src/session.ts`](src/session.ts) | 签名的会话 cookie：签发、清除、authority 绑定、有效期 |
| [`src/paths.ts`](src/paths.ts) | `AUTH_API_PREFIX`、`LOGIN_PATH` 与 `SETUP_PATH` |
| [`src/validation.ts`](src/validation.ts) | 邮箱规范化与密码最小长度 |
| — | 不发布运行时不变式伴生入口；本包拥有一个账户文件与一个会话席位，真实组合的测试经 Loader 启动整棵树并观察实际提供的 HTTP 表层。 |
| [`tests/auth-surface.spec.ts`](tests/auth-surface.spec.ts) | 真实组合：公开文档、受门禁入口、端点、`/api` 门禁、启动令牌交接 |
| [`tests/accounts.spec.ts`](tests/accounts.spec.ts) | 账户文件解析、变更，以及写入失败后留下的状态 |
| [`tests/password.spec.ts`](tests/password.spec.ts) | 哈希编码、校验，以及对外来存储值的拒绝 |
| [`tests/session.spec.ts`](tests/session.spec.ts) | cookie 属性、签名、authority 绑定与有效期 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下内容：先看拥有门禁的 transport，再看挂载本行的组合。

- [qilin-client-connection](../../client/connection/README.zh.md)——会话席位、入口路径与 `/api` 请求策略。
- [frontend-static](../../host/frontend-static/README.zh.md)——提供应用文档与公开文档的 dist 服务器。
- [qilin-web-app](../../bundle/web-app/README.zh.md)——挂载本行并声明其文档表的随附组合。
- [qilin-credentials](../../credentials/credentials/README.zh.md)——持有会话签名密钥的提供方。
- [qilin-home-paths](../../util/home-paths/README.zh.md)——`$QILIN_HOME` 与 `~/.qilin` 的解析。
- [本地账户决策](../../../.agents/notes/implemented/feature/2026-09-12-qilin-local-accounts-and-landing.zh.md)——为什么门禁在服务端，以及为什么注册默认开放。
- [生成配置目录](../../../docs/config-catalog.zh.md#qilinaccounts-local)——每个受支持配置字段及其源声明。

-----

<a id="model-experience"></a>
## 模型体验

无，因为账户只为浏览器表层设置门禁，本包不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明一个账户保护什么、不保护什么。它们是当前包约束，不是任务积压。

- **账户集合属于单个 harness home**——每个账户都能到达与首个账户相同的 Session、凭据与文件，因此第二个账户只是同一套 harness 的另一把钥匙，而不是独立租户；不同的人需要各自的 `QILIN_HOME` 与端口。
- **注册默认开放**——在账户集合仍有空位时，任何能到达该端口的人都可以创建拥有完整 harness 访问权限的账户；绑定到 loopback 之外的部署要设置 `registration: closed`。随附的 `qilin web` 命令绑定 loopback 并拒绝 `--host 0.0.0.0`。
- **登录没有限流或锁定**——端点以 scrypt 比较所允许的最快速度应答，该代价是反复猜测的唯一刹车。
- **没有账户删除或密码找回**——没有任何端点会删除账户或找回遗忘的密码；操作者需要编辑或删除 `$QILIN_HOME/auth/accounts.json`，删除该文件会让部署回到首次运行状态。
- **会话 cookie 是明文 HTTP 上的 bearer 凭据**——与 transport 自身的 cookie 一样，它不带 `Secure` 属性，因为随附服务器提供的是 loopback HTTP。
- **会话密钥丢失或被替换会终结所有会话**——凭据记录 `accounts-local/session-secret` 是唯一的签名密钥；替换它会作废所有已签发的 cookie，而账户本身保留。
- **账户文件没有降级或迁移路径**——本构建未曾写入的文档会让插件加载失败，因此格式变更只能通过一次刻意的迁移触达既有文件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。该插件拥有一个账户文件与一个会话席位，且只有它的写入会读取它所发布的状态；真实组合测试经 Loader 启动账户表层并观察实际提供的 HTTP 表层，而不是探测内部关系。
