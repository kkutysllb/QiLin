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

## 10. 第 14–15 轮：裸地址的入口（先修错、后按产品口径重做）

- **第 14 轮的发现（用户真机验证撞到）**：多账户部署下，退出登录后浏览器没有办法换到另一个账户。hub 在登出应答上确实清掉了路由 cookie，但随后裸地址总是 302 到名册第一项，而那台运行时只准入它自己那一个账户，于是第二个账户的凭据在它那里被判为 invalid-credentials——用户看到「密码不对」，**凭据没错，是地址错了**。
- **第 14 轮的修法及其错误**：当时让部署自绘一个账户列表。用户否掉了它，理由与代码里那条既有注释一致：**部署不该自己画界面**（产品自己的 landing / 登录 / 注册都由运行时服务）。审计在这里记下这次返工的判据：那条注释就是设计口径，改实现之前要先读它。
- **第 15 轮按产品口径重做（两笔提交）**：
  1. **会话密钥归部署**：此前密钥经 credentials 服务加载，而它的根是**每个运行时自己的** harness home，于是各运行时各签各的；密钥文件现在与名册并排放在部署家目录（`auth/session-secret.json`，0600 于 0700 内、以 wx 独占创建），全部署共享。这是「landing 登录后进自己运行时」**技术上成立的前提**。
  2. **裸地址 = 产品 landing；登录后按会话路由；注册随部署策略**：部署不再自绘任何页面；浏览器在 landing 登录后仍无路由 cookie，hub 向**签发该会话的运行时**询问它属于哪个账户（部署自己不读会话），再把浏览器交给该账户的运行时；注册模式**只由部署策略决定**（`--registration`，非环回地址默认 closed），有账户不等于关门——第 15 轮修正：曾把「名册非空即 closed」当实现，结果是名册一非空、产品里再无注册入口，用户实测发现。
- **判据**：[tenant-entry.spec.ts](../apps/cli/tests/tenant-entry.spec.ts) 6 例——裸地址是产品 landing 且**不出现任何账户名**、登录后被交给自己账户的运行时（303 加路由 cookie，随后由该账户运行时应答）、会话不指向本部署任何账户时留在 landing、部署策略两种取值都被如实报出（open 时名册非空仍开放注册、closed 时名册为空也关门）、首启运行时不再被名册变动替换、登出清掉路由 cookie。加租户与账户面回归 **114 例**（含 accounts-local）。负向对照：把密钥路径改回跟随运行时家目录 → 跨运行时那条变红。
- **仍是边界（未变）**：路由 cookie 是**浏览器级**的，同一个浏览器同时只驱动一个账户；要并行登录两个账户请用 `--per-account-ports`，或开一个隐私窗口。
- **已验证到哪一层**：改的是 hub 与运行时**报出的事实**（registrationOpen=false、拒绝注册调用、会话可跨运行时验证）；产品页面本身对 registrationOpen 的条件渲染不是本轮改动，也未逐像素核对。

### 15. 修正：注册开关属于部署，不属于名册（第 15 轮）

- **错在哪**：第 14 轮把「名册非空」当成「关门」，于是名册一有账户，产品里的注册入口就永远消失——**部署再也加不了第二个账户，只剩 CLI**（`qilin tenants add`）。用户实测后指出。根因是把两个不同的东西合成一个开关：操作者的策略（`--registration`）与名册的当前状态。
- **现在**：注册模式只报部署策略（运行时 `registrationOpen = registration === 'open'`），名册内容不影响它；首启运行时因此**不再被名册变动替换**，那段替换逻辑随之删除（调用方只传常量、分支不可达——不留死代码）。
- **边界**：非环回地址的默认策略仍是 `closed`（要把自己的部署挂上公网，得显式 `--registration open`），这条守卫没动。
- **判据**：tenant-entry 6 例——open 且名册非空 → 仍 `open`（注册入口在）、closed 且名册为空 → 仍 `closed`（本就用 CLI 建号）、全程不出现 `stop:first-run`；租户与账户面 15 文件 **114 例**全过。

## 11. 第 16 轮：注册入口不出现的真因（部署自己的门）

- **症状**：8790 端口的部署里，登录页底部**没有「注册账号」**；用户按上一轮的说法重启后依旧没有。
- **真因（两层，第一层是设计缺口）**：登录/首启文档与它们背后的账户面（/api/auth/*）此前会被路由到**浏览器已选中的那个账户的运行时**；而租户的层里写死 registration: closed（且这是硬约束），于是它报 registrationOpen: false，页面据此隐藏注册入口。**这与「bob 登录提示密码不对」是同一条根因**：在别人的运行时里，你不是一个被准入的账户。
- **第一版修法（错，被真进程探针当场打回）**：给 tenantPatchYaml 加了 registration 形参，把部署策略写进租户层。探针立刻显示租户运行时**整条没激活**：accounts-local 报 admittedAccounts requires registration: closed——账户插件明确拒绝「收窄准入 + 开放注册」的组合（理由写在源码里：名单外的人永远进不来，开放注册等于发出用不了的账户）。已整体回退。
- **正确修法**：登录与首启文档、以及账户面（/api/auth/*）是**部署自己的门**，一律交给承载部署策略的**首启运行时**应答；门的每次应答都**丢掉路由 cookie**（在门前的浏览器正在重新选账户），之后它拿到的会话会把 cookie 重新设上。其余路径照旧分派给该账户自己的运行时。
- **判据**：tenant-entry.spec.ts 新增一例——带着 alice 的路由 cookie 请求 /login，由首启运行时应答且**不启动 alice 的运行时**，应答里带清 cookie 的 Set-Cookie；同一 cookie 请求 /workspace 仍由 alice 的运行时应答。tenant-runtime.spec.ts 把那条例外用例改为**记录这条硬约束**。租户面与账户面回归 **143 例全过**。
- **真进程探针（本轮新增纪律：改路由必须真起一次服务）**：真 home + 真运行时，带 alice 路由 cookie 的 /api/auth/status 从上一版的 unauthorized 变为 registrationOpen: true；/login 得 200 且开关元素在场、应答清 cookie；alice 的层仍是 closed；日志里 did not activate 计数为 **0**。
- **教训**：上一轮验的是「hub 传了什么」，而决定页面行为的是「**运行时层里写了什么** + 谁应答这个请求」——每层都要验；路由类改动**必须真起一次服务**，夹具里的假运行时看不到层激活失败。用户指南的登录段落同批改准。

## 16. 本轮增量（第 16 轮）：会话的听众是部署，不是运行时

**用户报的现象**：注册成功后又被退回落地页，点「进入工作台」反复刷新落地页，永远进不去。

**真因（真进程探针定位）**：hub 代理给运行时时，把 `host` 改写成**该运行时自己的 `host:port`**（传输围栏要看租户地址，这是对的）。而账户插件把请求权威**当会话听众**：

- 会话 cookie 的名字是 `qilin-session-<sha256(权威)>`，载荷里也记着权威；
- 于是在**门**（首启运行时）注册出来的会话，听众是**首启运行时那个随机端口**（探针实测 payload `"authority":"127.0.0.1:55397"`）；
- 浏览器随后被交给**自己账户的运行时**（另一个端口）→ 它按**自己的**权威算 cookie 名 → **根本读不到那个 cookie** → 未登录 → 跳登录页 → 登录页是门 → 又清路由 cookie → 循环。第 13 轮「部署级签名密钥」只解决了**签名**，没解决**听众**，所以那一版仍然进不去。

**修法**：hub 在代理时**并排**带上浏览器用的权威（`x-qilin-deployment-authority`），传输围栏继续用租户权威；账户插件**优先**用转发来的权威算会话听众。浏览器自己带的值一律丢弃（只有这一跳能命名它）；没有 hub（`--per-account-ports` 或直连）时退回原语义——权威=该运行时，每账户各自一个 origin，本就自洽。

**判据**：`session.spec.ts` 新增「转发权威优先、坏值退回 Host」（Headers 与普通对象两种形态都断言）；`tenant-proxy.spec.ts` 新增「并排携带、浏览器伪造被覆盖、没有 hub 时不留痕」。**两条负向对照实跑**：hub 不转发 → 该用例红；运行时忽略转发 → 该用例红。租户与账户面回归 **118 例全过**。

**真进程探针（本次纪律的第二次执行）**：全新 home + `--registration open` 起真实部署，curl 走完整链——注册出的会话听众 = **部署权威 `127.0.0.1:8795`**；`/workspace` 一次 303 设路由 cookie；再请求 `/workspace` **200**（由新账户自己的运行时应答），不再循环。修复前同一探针实测为循环。

## 17. 本轮增量（第 38 轮）：mux 升级握手的一跳

**症状**：浏览器登入 workspace 后永远停在「重新连接中」，控制台反复报
`WebSocket connection to 'ws://127.0.0.1:8790/api/remote.mux' failed` 与 `connection lost, retry #N`。

**真进程探针（决定性）**：全新 home、真部署、curl 走完登录 → 浏览器形态导航 → 原始 WebSocket 握手：

| 探测 | 修复前 | 修复后 |
|---|---|---|
| `GET /workspace`（带会话、无路由 cookie，`Accept: text/html`） | 303 + `qilin_tenant` | 同（这跳本来就对） |
| 带路由 cookie 的 `/api/remote.mux` 升级 | **401 unauthorized** | **101 Switching Protocols** |

**根因**：hub 的**升级转发**只传了两个实参给 `forwardedHeaders(headers, tenantAuthority, deploymentAuthority)`——
`relayUpgrade(request, socket, head, target, forwardedHeaders(request.headers, new URL(target).host))`。
第三个实参正是第 37 轮引入的「浏览器用的部署权威」：运行时按它给会话命名（`qilin-session-<hash(权威)>`）。
少了它，运行时按**自己那个随机端口**算 cookie 名，于是浏览器手里那份会话它根本不认 → 401。
HTTP 那两条转发路径都传了第三个实参，所以只有升级这一跳坏——表现成「页面登录正常、唯独 mux 连不上」。

**修法（两层）**：
1. 升级转发补上部署权威（`request.headers.host`），与请求转发同一规则；
2. 把 `deploymentAuthority` 从**可选**改成**必填**——这一跳永远知道它，缺了就编译不过。

**证据（实跑）**：
- **负向对照**：把第三个实参删掉 → `apps/cli/src/tenants.ts(870,53): error TS2554: Expected 3 arguments, but got 2`（缺陷从此不可能静默复现）；
- 真进程探针：401 → **101**；
- 租户面 **35 例全过**（入口、代理、TLS、隔离、用量、名册），`tsc -b apps/cli` 0。

**一处走过的弯路（如实登记）**：我先想在部署夹具的「运行时替身」里加一个真升级口，用 socket 级用例钉住这一跳。它测得出问题，但**收尾挂死**——升级后的 socket 活得比请求久，服务端 `close()` 因此不返回（正是第 8 轮 webserver 那条「升级/TLS socket 必须自己跟踪」的同一类坑）。我给它补了 socket 跟踪仍未在预算内收敛，于是**撤回夹具改动**，改由「真进程探针 + 类型必填」两条承担判据：前者证明这一跳现在通，后者保证以后不会再漏。

## 18. 本轮增量（第 39 轮）：构建红把前端钉死在旧产物上；--patch 从未生效；写路径仍会落进首启运行时

**用户报的现象**：配置模型后输入框无法选择模型、会话标题不对且报错、工作区选了也选不中——「就这还敢发版」。

**先说修掉的两处（真进程 + 真浏览器验证）**：

| 缺陷 | 根因 | 修复与判据 |
|---|---|---|
| \`pnpm run build\` 全红，前端 bundle 停在 21:19 的旧产物 | 两处遗留测试类型错误：\`tenant-proxy.spec.ts\` 还有一个两参 \`forwardedHeaders\` 调用（第 38 轮把第三参改必填时漏改测试）；\`ui-usage\` 的 spec stub 缺 \`GlobalStandardProps\` 新成员 | 补齐两处调用/桩；构建恢复绿（419 个 client 产物重建）。运行时是 tsx 源码启动而浏览器吃的是 bundle，构建一红就是两端版本错配——模型选择/会话/工作区异常全发生在旧 bundle 上 |
| \`qilin web --patch <overlay>\` 的 overlay 静默丢弃 | commander 的 passThroughOptions 把 --patch 留在透传 args 里，deploymentOptions 的 splitArguments 又只收进 values 而从不读取；帮助文本与 pin-browse-picker smoke 都宣传/依赖它 | splitArguments 增加 repeatable lists，deploymentOptions 返回 patches，runWebEntry 合并两层；web-entry.spec 补断言（原用例喂了 --patch 却从不断言）9/9 过。修复后运行时子进程 argv 携带 overlay，boot 图装配 client-ui-directory-picker-browse |

**新复现、未修的高危缺陷（下一轮的主目标）**：single-origin 部署里，workspace/session 的写路径存在落进首启运行时的窗口。真进程探针（隔离 home、真部署、真浏览器）：路由 cookie 缺失期间（登录导航完成前/门清 cookie 后）的调用全部落到 .bootstrap——工作区与会话在 bootstrap 盘落盘；之后换成正确路由 cookie 的浏览器又会话出现 Failed to load history: session not found (session/not-found)、侧边栏与主面板各说各话。admin 租户目录 sessions/ 从未产生，workspace.json 始终为空。两个运行时数据分裂后，「会话标题不对」「工作区选不中」「报错」是同一根因的三个侧面。mux 转发本身路由正确（cookie=admin 时 hub 的连接全部指向 admin 端口，lsof 实证），所以缺口在无路由 cookie 请求的 fallback 归属与登录后路由 cookie 的重建时机，不在转发。

**另一处如实登记**：tsx 源码启动下首个 POST /api/auth/login 观测到 10s 级延迟（冷启动），浏览器侧表现为提交后长时间无进展，用户重试即见错误文案。curl 同端点 0.05s，属冷启动而非验证成本；但这解释了「还报错」的一部分体感。

## 19. 本轮增量（第 40 轮）：无路由 cookie 的请求按会话就地路由——数据分裂的根因修掉

**用户重启后仍见** `历史加载失败: session "…" not found (session/not-found)`。真机盘面实证：会话与工作区全部写在 \`tenants/.bootstrap/sessions\`（含用户点名的 session-1c1a3ebc「个股分析」），五个账户目录的 sessions 为零、workspace.json 恒空——**数据没丢，但全在错误的运行时**。

**根因（hub 路由）**：无路由 cookie 的请求里，只有 GET+text/html 按会话重建路由（303+设 cookie）；**其余——composer 的 POST、mux 升级、资源——全部 fallback 到首启运行时**。门每次应答都清路由 cookie，于是登录导航完成前的整段窗口里，浏览器的一切写都进了 bootstrap；带正确 cookie 的读又走真账户运行时，not-found 与标题错乱由此而来。

**修复（tenants.ts 两处）**：
1. HTTP 路由：无路由 cookie 但会话有效的浏览器，其余请求（API/资产/媒体）**按会话所属账户就地 forward**，应答附上路由 cookie——后续请求自行命名账户；
2. mux 升级：cookie 缺失时按会话解析账户再转发（此前直接 destroy socket，正是用户日志里的 reconnect 风暴）。

**判据**：
- tenant-entry.spec 新增用例「无路由 cookie 的非文档请求按会话路由」：POST 应答 \`served <account>\` 且带路由 cookie，未登录浏览器仍得 first-run——**负向对照实跑**：恢复修复前代码该用例红（落 first-run），修复后 8/8 绿；
- 真进程探针：仅会话、无路由 cookie 的 mux 升级握手 **401/destroy → 101**；
- 真浏览器（多账户部署）：工作区/会话创建落在 **alice 租户目录** \`sessions/--…--/session-a0db…\`，不再出现于 .bootstrap；
- 用户数据确认完好：session-1c1a3ebc（个股分析）等全部在 .bootstrap 盘，迁移待用户指认目标账户后进行。

## 20. 本轮增量（第 40 轮续）：用量读搬回账本的主人——hub

**用户报的现象**：设置 → 用量显示「无法联系部署，页面暂无内容可显示」。

**读路径的三层拆解（真进程逐层探）**：浏览器 fetch \`/api/usage/me\` → （mux 网关）→ 运行时的 connection.fetch 注册项 → 运行时**再**带着 Bearer token 回 hub 的账本端点。三处任一失败，页面即显示「无法联系部署」：
1. 上一节的窗口期里，请求落到首启运行时——它的账本里没有这个账户；
2. 运行时上 \`/api/usage/me\` 的注册本身是时序性的：usage-report 声明 \`inject: []\`，apply 时 \`ctx.get('connection')\` 若早于 client-connection 就绪则为 undefined，注册被静默跳过——浏览器得到的就是 404（探针实测：修好的路由下登录后直读仍是 404）；
3. 注册成功时，读取还要经历「浏览器→hub→运行时→hub」的绕圈，账本本来就是 hub 的文件。

**修复（读路径收回账本的主人）**：
- hub 新增浏览器面读路由：\`/api/usage/me\`（GET）在 singleOrigin 段直接应答——账户取路由 cookie，缺失时按会话解析；匿名/名册外一律 401（浏览器 API，不是门文档，不落首启运行时）；管理员席位的部署范围读、窗口参数、封顶与应答形状原样保留（抽为 \`answerUsageRead\`，账本通道与浏览器通道共用）；
- usage-report 回归纯上报：删除读注册、\`readOwnUsage\` 与 \`USAGE_READ_PATH\`（常量移入 usage-ledger），模块文档同步；
- 前端不变（同路径同应答形状）。

**判据**：
- tenant-usage.spec 新增浏览器面用例：会话命名账户、匿名 401（并修 fixture：空 cookie 头按无会话，与真门一致）；
- usage-report.spec 删除两条读用例（读已不属于运行时）；
- 真进程：登录后 \`/api/usage/me\` → **200**（\`{accountId, total, records: []}\`，空账本的正确应答，前端渲染零值图表而非「无法联系部署」）；匿名 → 401；
- 上一节的路由修复保证窗口期的读也按会话命中 hub 的这条新路由。
