# 同一 web 入口的多租户隔离：审计与收口

日期：2026-10-11 · 触发：用户要求「同一个 web 入口下，会话、模型配置、插件、token 消耗各自隔离」· 基线：`main`（本节所有结论都在当前树上实跑）

## 1. 现在真的隔离到什么程度

隔离判据的车道是 `apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts`，本轮在当前树上重跑并**通过**：

```sh
npx vitest run --config vitest.expected.config.ts -t "keeps sessions, tasks, workspaces, plugins, and model settings with their tenant"
```

它逐条断言（双侧：本租户看得到、邻居看不到）：会话（`tenants/<id>/sessions` 与 `session/list`）、任务（schedule 存储域）、工作区、插件（各自 `tenants/<id>/profiles`）、模型设置（各自 `tenants/<id>/settings.yaml`）、转发事件不跨租户、外来会话身份被拒。部署根下只有名册与 `tenants/`。

按源码逐一核过的其它根（都落在租户 home 内，故天然隔离）：`.credentials.yaml`、MCP 用户补丁、附件与缓存（`cache/`）、`session-query-sqlite`、agent 文档、上传索引、shell 环境；首启运行时用 `tenants/.bootstrap` 作自己的 home，不写共享根。**token 消耗**现在有自己的账本（本轮新增）：每个运行时按**自己的令牌**把每个已结算 Turn 报给部署，账本按账户归属，记录带缓存桶（未命中输入/输出/缓存读写）。**唯一的跨账户读**是部署管理员席位读部署范围——只读数字，永远读不到别人的会话。

## 2. 本轮修掉的真实泄漏：用户技能 / agent 文档

**证据（产品代码 vs 测试夹具的差异）**：

| 位置 | QILIN_HOME | QILIN_AGENTS_HOME |
|---|---|---|
| 测试夹具 `tenant-web-process.ts` | 租户目录 | `<租户目录>/agents` |
| **产品** `apps/cli/src/tenant-runtime.ts`（修前） | 租户目录 | **未设置** |

`skill-filesystem` 的根解析是 `config.agentsHome ?? process.env.QILIN_AGENTS_HOME ?? ~/.agents`，而 base 组合挂载它时**不带 config**。因此产品里每个租户都落到同一个 `~/.agents`：A 的用户技能、agent 文档对 B 可见，也能互相覆盖——而隔离车道照样全绿，因为**它自己的夹具补上了这个变量**。

**修法**：把子进程环境抽成 `tenantChildEnvironment()`，像指定 QILIN_HOME 一样指定 `QILIN_AGENTS_HOME=<租户>/agents`；部署 home 仍只按名字交给名册层。

**验证**：`apps/cli/tests/tenant-environment.spec.ts` 7 例（根都在租户目录内、覆盖 hub 继承来的共享根、其余环境照旧继承）；**负向对照**：删掉那一行 → 2 例变红，恢复 → 全绿（该文件现有 7 例）。回归：`tenant-supervisor.expected.e2e.ts` **7/7** 通过。

## 3. 三处断点的现状（原「还没收口的三处」，逐项回填）

| # | 面 | 现状 | 证据 |
|---|---|---|---|
| 1 | **单源模式下的浏览器存储** | **已收口**（机制 A2）：租户运行时在它服务的文档里注入账户 id，账户界面状态按账户前缀；主题/语言/快捷键按决定 B 留作设备偏好 | 第 6 节；宿主 8 例 + 客户端 5 例 |
| 2 | **继承的环境凭据 与 `~/...` 环境凭据** | **环境一半已收口**：`tenantChildEnvironment` 按 `SENSITIVE_ENV_PATTERN` 剥掉继承来的 provider 键。`~/...` 一半**是边界而非缺陷**：所有租户同属一个 OS 用户，`~/` 指的是部署操作者自己的凭据文件，要禁只能上独立系统用户或容器（第 5 节） | tenant-environment.spec.ts |
| 3 | **按账户的 token 汇总 / 配额** | **账目已收口**（额度未做，按「只记不拦」）：逐轮、带缓存桶、按账户归属的账本；令牌绑定账户的 hub 端点；运行时的读路由；两个页面（本账户 / 管理员部署范围） | usage-ledger / tenant-usage / usage-report / ui-usage 四套用例 |

## 4. 复现命令

```sh
# 隔离判据（需要已构建的产物，本机已具备）
npx vitest run --config vitest.expected.config.ts -t "keeps sessions, tasks, workspaces, plugins, and model settings with their tenant"

# 真实 hub 的拓扑、上限、回收、首启（7 例）
npx vitest run --config vitest.expected.config.ts apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts

# 本轮新增的环境判据（3 例，秒级）
npx vitest run apps/cli/tests/tenant-environment.spec.ts
```

## 5. 边界（如实）

- 一个浏览器在单源模式下同时只驱动一个租户（路由 cookie 是浏览器级的），第 3 节第 1 条正是这个口径下的后果。
- 所有运行时同属一个 OS 用户：A 的 agent 用 shell 仍能读到 B 的 home。真隔离需要独立系统用户或容器，不在本审计范围。
- **跨账户读的唯一例外**：部署管理员席位可以读**全部署的用量数字**（不是会话）。它在读取时按名册判定，席位随账户走；普通账户拿不到部署作用域。
- `--max-tenants N`（N>0）下，被上限挤掉的那一侧并发交接可能收到 **503**——这是上限语义的正确后果，不是故障（第 7 节有实测记录）；默认 0 不受影响。
- 第 3 节的第 2、3 条我没有擅自实现：它们改的是「部署给不给共享凭据」与「要不要做额度」这类产品口径。

## 6. 浏览器存储：键级清单与已选修法

单源模式把两个账户放在同一个 origin，而 localStorage 按 origin 隔离，所以只有**不依赖会话 id 的键**才会串账户。按源码逐个键分类：

| 键 | 归属 | 同 origin 下是否串账户 |
|---|---|---|
| `qilin.conversation.<sessionId>`、`qilin.sidebar-right.v1.<sessionId>`、`qilin.schedule.task-tab.<sessionId>` | 会话 | 否——会话 id 每租户唯一 |
| `ql-theme`、`qilin.locale` | 设备偏好 | 是 |
| `qilin.keybindings.v1` | 设备偏好 | 是 |
| `qilin.sidebar.folded-sections.v1` | 账户界面状态 | 是 |
| `qilin.schedule.recent-time-zones.v1` | 账户界面状态 | 是 |
| `qilin.trajectory.duration`、`client/store` 的 persist 名 | 账户界面状态 | 是 |

**选项 A（推荐）——按账户 id 给键加前缀。** 账户 id 需要在客户端**早于任何读取**可知：hub 已经按账户下发 `qilin_tenant` 路由 cookie，但它是 `HttpOnly`（有意如此）。两条取法：
  - A1：hub 额外下发一个**可被脚本读取**的同名值（非 HttpOnly）。该值就是账户 id，页面本来也能通过 `/api/auth/status` 拿到，因此不新增暴露面；但它确实把「路由选择器」变成脚本可读，需要你点这个头。
  - A2：租户运行时在它服务的文档里注入账户 id（`<meta>` 或 `window` 全局），客户端同步读取。改动面在 host 侧，不动 cookie 语义。
  取到 id 后：加前缀的键与旧键**不迁移**（迁移会把 A 的偏好送给 B，正是要修的病）；单次登录前的落地页仍用无前缀键，登录后的应用用带前缀键。

**选项 B——单源模式只服务一个账户的浏览器。** 即承认「同一浏览器多账户」需要按账户端口（`--per-account-ports`），把偏好串账户记为已知让步。改动量 0，但不满足「同一个 web 入口」的要求。

**已定并落地**：机制取 **A2**——租户运行时在子进程环境里报出它服务的账户（`QILIN_ACCOUNT_ID`，首启运行时不报），`frontend-static` 在它本来就要改写的 `<head>` 里写回 `<meta name="qilin-account" content="…">`（值做属性转义）；客户端 `accountScopedName()` 以此为**前缀**拼存储键，作用域因此不打扰任何按后缀解析会话的地方（侧栏布局启动扫描即其一）。

**按 B 的语义分工**：主题、语言、快捷键**留作设备偏好**（登录页由首启运行时服务，那时没有账户，按账户分会把刚选的观感重置），只把**账户界面状态**按账户分——折叠分区、最近时区、会话草稿/视图偏好，以及所有走 store 引擎的持久键（引擎在 `attachPersistence` 里统一加前缀，无需逐站点改）。

用例：宿主 8 例（`withSiteBase` 的四种情形含转义、两种子进程环境）；客户端 5 例（无账户时原名、有账户时前缀、空/缺 content、store 引擎按账户名写、`clearPersisted` 保留会话后缀），负向对照实跑（去掉引擎里的作用域 → 2 例变红）。**未经迁移**：旧的无前缀键被忽略，符合「迁移会把 A 的偏好送给 B」的判断。

## 7. 本轮增量（第 6 轮）

- 上限与并发：新增 [tenant-handoff.spec.ts](../../apps/cli/tests/tenant-handoff.spec.ts) 用真 hub + 真 HTTP 驱动两个账户同时交接。**发现并登记**：`--max-tenants 1` 下两个账户同时交接时，回收可能把另一个请求正在用的运行时停掉，于是那一侧收到 **503**——这是上限语义的正确后果（默认 `0` 不受影响），需要在部署文档里说清，别当成故障。
- 该 spec 是「交接队列是否真的互斥」的第一条**端到端**判据：把队列改成立即执行，回收日志变空、用例变红；恢复后 5/5 通过。
- 环境面：`TenantHandle` / `createRuntime` / `home` / `signal` 四个缝让 supervisor 可被嵌入与停止，测试不再需要改 `process.env` 或发信号给自己。

## 8. 本轮增量（第 12 轮）：租户名与部署自有目录

**发现（本轮实跑暴露）**：租户名由 `isTenantIdentity` 判定，原规则只拒绝 `.` 与 `..`，**允许前导点**；而 `tenants/` 同时住着部署自己的目录——`tenants/.usage`（token 账本）与 `tenants/.bootstrap`（首启运行时）。账户文件是**多进程共享文档**，其中的 id 会走到路径构造；一个由名册（手工编辑或迁移）带进来的 `.usage` 身份，会让某个运行时把**部署的账本目录**当成自己的 harness home，并在里面写下该租户的层。

**修法**：身份规则保留前导点（`RESERVED_IDENTITY_PREFIX = '.'`），即部署在 `tenants/` 下为自己保留的名字空间；`.usage`、`.bootstrap`、`.`、`..` 都不可作为租户名。产品自身的注册校验（`USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/`）本就不产生前导点，所以这是**收紧共享文档的信任面**，不改变正常注册路径；该提交以 `!` 标注这次收窄。

**用例**：[tenant-isolation.spec.ts](../apps/cli/tests/tenant-isolation.spec.ts) 5 例——每账户一个目录且互为兄弟、一个租户层只准入自己那一个账户（三账户交叉断言，含「不含其它账户名」）、agent 根在租户 home 内、经真 hub 每账户各自一个目录、首启运行时的目录是部署保留名。既有的身份用例补上 `.bootstrap`/`.usage`。**负向对照实跑**：去掉前导点规则 → 2 例变红。

**顺带的落点收敛**：目录派生从类里提为 `tenantDirectory(home, name)`，「租户住在哪里」只有一个落点，也让它可被断言。

## 9. 本轮增量（第 13 轮）：部署自己的 TLS 与 Secure cookie

- **此前只有一半判据**：「运行时在 `sessionCookieSecure: true` 时给会话 cookie 加 `Secure`」有用例（accounts-local 两套），但**部署自己终止 TLS 是否真的走到那个开关**没有判据。
- **新增判据**：[tenant-tls.spec.ts](../apps/cli/tests/tenant-tls.spec.ts) 3 例——(1) 部署以自签证书起 TLS，信任该证书的客户端完成握手、`/healthz` 得 200、按路由 cookie 的账户交接在 TLS 上可用，且 hub 创建的每个运行时都拿到 `sessionCookieSecure: true`；(2) 首启运行时同样拿到；(3) 明文部署是 `http://` 且每个运行时拿到 `false`（标志存在且为假，运行时不需猜测）。
- **一处落点收敛**：这个决定原先在两处内联重复，现在收敛为 `secureSessionCookies(options)` 一个函数、两处调用。
- **负向对照实跑**：把该函数写死为 `false` → 前两例变红、第三例仍绿，说明判据绑在规则上而不是绑在「服务起来了」上。
- 部署夹具因此获得 `tls` 选项；自签材料由 apps/cli 测试夹具生成，`selfsigned` 只进 apps/cli 的 devDependencies。

## 10. 本轮增量（第 14 轮）：裸地址的账户入口

- **发现（用户验证时撞到）**：多账户部署下，退出登录后浏览器**没有**任何办法换到另一个账户。hub 在 `/api/auth/logout` 的应答上确实清掉了路由 cookie（`clearedRoutingCookie()`），但随后裸地址**总是** 302 到名册第一项（`accounts[0]`），而那台运行时按设计只准入它自己那一个账户（`admittedAccounts` + `registration: closed`），于是第二个账户的凭据在它那里被判为 `invalid-credentials`（`routes.ts`）——用户看到「密码不对」，**凭据没错，是地址错了**。
- **修法**：裸地址在名册**多于一个**账户时改为应答一个**账户列表**（只有用户名与各自入口路径，不含邮箱），单账户保持原来的 302；浏览器带路由 cookie 时照旧直连该账户的运行时。
- **判据**：[tenant-entry.spec.ts](../apps/cli/tests/tenant-entry.spec.ts) 5 例——多账户列全两个入口、退出登录清掉路由 cookie（`Max-Age=0`）、单账户仍是 302、已选账户不再列他人、无名册交给首启运行时。**负向对照实跑**：关掉列表分支 → 多账户那条变红。
- **仍是边界（未变）**：路由 cookie 是**浏览器级**的，所以同一个浏览器同时只驱动一个账户；要并行登录两个账户请用 `--per-account-ports`（每账户各自 origin 与 cookie jar），或开一个隐私窗口。
