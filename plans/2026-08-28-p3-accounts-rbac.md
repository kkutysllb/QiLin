# P3 账户 BFF + RBAC 子计划(草案)

> **DRAFT—待用户决策**:本文档为草案。D 系列决策点(D1–D6)需用户逐项拍板后,
> 本计划才升级为可执行定稿;S 系列步骤的范围与顺序以 D 系列结论为前提。

**目标(一句话):** 为 QiLin 引擎(qilin-engine)补齐多用户账户体系(注册/登录/会话)
与服务端 RBAC 强制点,使 Web 表面从「单用户 loopback 信任」演进为「多用户、可鉴权、
可授权」,并为 P4 多服务商模型与 P5 品牌壳提供账户地基。

**架构取向(待 D1 拍板):** 推荐在引擎内以 cordis 插件包(
`packages/accounts/*`)扩展既有 `webServer` 路由注册表与 `/api` 传输层,
不新建独立进程;RBAC 语义移植自旧 Python 网关(deny-wins、fail-closed)。

**技术栈:** TypeScript / cordis 插件内核 / node:http(webServer)/ node:sqlite(候选,D6)/
vitest(测试与覆盖率门禁)/ scrypt 或 bcrypt(密码哈希,S1 定)。

---

## 1. 目标与非目标

### 1.1 目标

1. **多用户账户**:注册(D5 决定开放策略)、登录、登出、改密、会话保持与吊销。
2. **服务端强制 RBAC**:账户角色(admin/user 起步)+ 资源级策略,强制点在服务端
   API 面(/api),前端仅做展示性配合。
3. **BFF 边界确立**:明确账户/鉴权逻辑落在引擎哪个组合层(D1),不破坏引擎
   「webServer 只管路由注册、不知道 harness 概念」的分层纪律。
4. **凭证源收口(G1 联动)**:盘点并冻结凭证读取位点,给出统一凭证源的决策依据(D4),
   为 P4 多服务商铺路。
5. **语义沿用**:旧 Python 网关(JWT/CSRF/RBAC/注册开关)的产品行为契约移植为 TS 实现,
   代码不移植、语义移植。

### 1.2 非目标

- **不实现** P4 多服务商模型接入本身(P3 只预留凭证解析扩展点,见 D4)。
- **不实现** P5 商业品牌壳(P3 前端登录页使用现有 ui-primitives 中性皮肤)。
- **不迁移/不退役** P6 的 8 个 IM 渠道(`app/channels/`:dingtalk、discord、feishu、
  github、slack、telegram、wechat、wecom);其语义仅作借鉴。
- **不触碰** 两仓的 `vendor/` 与 QiLin 仓 `python/` 目录。
- **不做** 计费/配额/租户隔离(组织级多租户),仅做单实例多用户。
- **不修改** 引擎既有会话(session)持久化格式;用户↔会话的归属关系为 P3 新增映射,
  不改写历史会话数据。

---

## 2. 现状盘点摘要(实测取证)

### 2.1 引擎侧:认证/账户原语现状(qilin-engine @ 795b8dc, tag qilin-engine-v0)

**结论:引擎当前完全没有用户/账户/会话鉴权概念;Web 表面是「loopback + 受信主机名」
信任栅栏下的单用户模型。**

1. **apps/web 是纯 SPA,不是服务端**。入口仅挂载 `@qilin/client-web` 的 `AppWebEntry`
   (`apps/web/src/main.ts:1-9`);服务端能力全部在宿主包里。
2. **Web 服务端 = node:http + 极简路由注册表**。`@qilin/host-webserver`
   (`packages/host/webserver/src/index.ts:1-9`)提供:
   - exact/prefix 两种路由注册(`register`,index.ts:108-115);
   - exact 路径 WebSocket upgrade 注册(`registerUpgrade`,index.ts:123-129);
   - **唯一 fallback 席位**(SPA dist 静态服务,由 frontend-static 占用,
     `packages/host/frontend-static/src/index.ts:1-8`);
   - index.html 注入表与 raw transform(`webserver/index-inject`,index.ts:26-36)。
   - 监听配置只有 host(`'127.0.0.1'` 或 `'0.0.0.0'`)与 port(index.ts:59-64),
     默认 127.0.0.1:3080(`packages/bundle/web-app/cordis.patch.yml` webserver 行)。
   - **没有中间件链、没有 cookie、没有鉴权原语**;全仓 `packages/host|api|client`
     中 grep cookie/authorization/bearer 无一处 HTTP 鉴权语义命中(实测,
     命中均为会话/附件/UI 槽位作用域词)。
3. **组合层**:`packages/bundle/web-app/cordis.patch.yml` 是 Web 表面的 cordis patch:
   - `webserver` 行(host/port 来自 `webStartup` 服务,回退 127.0.0.1:3080);
   - `connection`(`@qilin/client-connection`)注释原文:Owns both ends of the web
     transport: node half binds the gateway to the webserver under **/api**; browser
     half is the fetch/SSE client(同文件 connection 行);
   - `web-runtime` 行提供 `trustedHosts`(LAN 受信主机字面量);
   - `storage-json` 行:`root: dshHomePath('storages')`(按 home 目录而非用户隔离)。
4. **传输信任栅栏(现有唯一「鉴权」)**:ws 升级前做不可信拒绝
   (`packages/client/connection/src/websocket-downlink.ts:141` — Reject an untrusted
   upgrade before protocol negotiation),信任来源是 loopback 主机名与 `trustedHosts`
   字面量(`api-request-trust.ts`、`loopback-hostname.ts`)。
   ⚠️ 引擎配置允许 bind 0.0.0.0,一旦有人开 LAN 部署,现有栅栏只挡主机名不认人——
   P3 必须在此收口。
5. **宿主 API 面**:`@qilin/host-apiproxy` 实现全部宿主侧 RPC
   (`packages/host/apiproxy/src/api-proxy.ts:1-3`,单文件 3642 行,unary +
   rpcId 回显);`@qilin/api-gateway` 是 Typert Remote 分发
   (`packages/api/gateway/src/index.ts:1-8`)。**所有 /api RPC 默认无用户身份。**
6. **身份原语只有一个匿名 ID**:`@qilin/anonymous-user-id` —— per-home 随机 UUID,
   删文件即换新身份(`packages/identity/anonymous-user-id/src/index.ts:1-12`)。
   与「用户账户」无任何关联。
7. **profile 是配置组合,不是用户**:`qilin <profile>` 经 profile-boot 叠加
   patch 层(`apps/cli/src/profile-boot.ts:1-12`);`~/.dsh/profiles/web` 是 Web
   表面的 profile。**profile 与多用户无关,不能复用为账户。**
8. **可复用的既有缝**(P3 的落点资产):
   - **凭证缝**:`ctx.credentials`(records)+ `ctx.authorization`(交互式取凭据流)
     是引擎的两大认证类缝(`packages/llm/llm-pi-ai/src/auth.ts:5-9`);
   - **settings 缝**:`settings.yaml` 单文档、写锁、热发布
     (`packages/settings/settings-file/src/index.ts:1-8`);
   - **存储先例**:session 持久化已有 jsonl 与 **sqlite(node:sqlite)** 两个实现
     (`packages/session/session-persistence-sqlite`),D6 选 SQLite 有先例可依;
   - **测试基建**:vitest 全仓统一,含 e2e 配置与分区覆盖率
     (`vitest.e2e.config.ts`、`scripts/run-coverage-partitions.ts`)。

### 2.2 旧 Python 网关语义盘点(QiLin 仓 qilin/ 与 app/,只读)

**结论:旧网关有一套完整、自洽的账户行为契约,值得整体沿用其语义。**

#### 2.2.1 值得沿用的产品语义清单(行为契约,非代码)

| # | 语义 | 旧实现证据 | P3 沿用方式 |
|---|------|-----------|------------|
| A | **JWT 签发**:HS256,claims `sub`(user UUID)/`exp`/`iat`/`ver`(token_version),默认 7 天 | `app/gateway/auth/jwt.py:12-39` | 会话令牌语义(是否沿用 JWT 形态见 D2) |
| B | **token_version 吊销**:改密即 token_version 递增,旧令牌全灭 | `jwt.py:18`、`auth/models.py:36-38` | 会话/令牌吊销模型 |
| C | **typed 令牌错误**:EXPIRED / INVALID_SIGNATURE / MALFORMED 三分类 | `jwt.py:42-57` | 前端可据此区分「重新登录」与「重试」 |
| D | **HttpOnly cookie 优先 + Bearer 兜底**:桌面跨端口 dev 模式从响应体取 token 走 Bearer;仅会话创建端点(login/register/initialize)回传 access_token | `auth_middleware.py:119-139`、`auth/models.py:52-61` | 双轨鉴权(D2) |
| E | **cookie 安全策略**:HttpOnly access_token + qilin_session_persistent(记住我);secure 按 https 判定、loopback 豁免 + 显式环境开关逃生 | `session_cookie.py:18-53`(:20 为逃生开关) | 本地 dev 与部署两态 |
| F | **CSRF 双提交**:state-changing 方法(POST/PUT/DELETE/PATCH)校验 csrf_token cookie + X-CSRF-Token 头;豁免 /auth/me 与 webhook(供应商签名自证);RFC-001 契约 | `csrf_middleware.py:1-5`、`:26-28`、`:41-60` | 引擎 /api 写路径 |
| G | **auth-disabled 逃生阀**:QILIN_AUTH_DISABLED,显式生产环境禁止禁用 | `auth_disabled.py:8-20` | 本地/E2E 模式 |
| H | **垃圾 cookie 防绕过**:拒绝把任意 cookie 形状字符串当会话 | `auth_middleware.py:137-139` | 安全面细节 |
| I | **用户模型**:UUID、唯一 email、bcrypt 哈希(OAuth 用户可空)、`system_role: admin|user`、oauth_provider/oauth_id 联结、needs_setup(重置账户补全流程) | `app/gateway/auth/models.py:15-38` | 账户实体(D6 存储) |
| J | **注册开关**:POST /auth/register 是否开放由配置即时读取决定(改配置即生效);首用户 initialize 流 + setup-status 探测 | `routers/auth.py:355-408`、`:540`、`:614` | D5 注册策略 |
| K | **端点族**:`/api/v1/auth/` 前缀下 login/local、register、logout、change-password、me、setup-status、initialize、providers、oauth/{provider}、callback/{provider} | `routers/auth.py:53、318、380、424、439、516、540、614、734、761、853` | 路由面形状 |
| L | **双层 RBAC**:(1) 账户级 system_role(admin|user);(2) 配置驱动资源策略:role × resource(tools/models/skills/sandbox/mcp_servers/routes)的 allow/deny,支持通配;**deny 恒胜**;未知/缺失角色抛错→fail_closed 默认真;默认 enabled:false 保留全通过行为 | `qilin/authz/rbac.py:1-10、26-33、82-91`;`qilin/config/authorization_config.py:1-9、29-32` | D3 RBAC 模型 |
| M | **RBAC 双强制层**:装配期能力过滤(工具根本不可见)+ 运行期执行拒绝(guardrails 适配);Principal 由单一 builder 构造保证一致 | `authorization_config.py:4-7`;`qilin/authz/principal.py:1-6` | 强制点设计(D3) |
| N | **路由级权限串**:`resource:action`(threads:read/write/delete、runs:create/read/cancel)+ require_auth / require_permission(owner_check 属主校验) | `app/gateway/authz.py:1-28、56-67` | /api 方法级强制 |
| O | **users 持久化**:SQLAlchemy + alembic;users 表 + oauth 身份部分唯一索引(sqlite/postgresql 双方言) | `qilin/persistence/migrations/versions/0001_baseline.py:185-199` | D6 选型参照 |

#### 2.2.2 仅记录、不沿用的旧语义

- **OIDC/Keycloak SSO 与 GitHub OAuth 登录**(`app/gateway/auth/oidc.py`、
  `github/app_auth.py`):P3 不做第三方登录;引擎侧第三方 OAuth 的正确位置是
  凭证缝(`ctx.authorization` 流),留待 P4 与需求出现再议。
- **webhook 签名通道**(`routers/github_webhooks.py`):属 P6 渠道域,P3 不涉及。
- **langgraph_auth**(跨 SDK Bearer 注入):P3 的 Bearer 兜底语义已含其价值(契约 D)。

### 2.3 G1 凭证现状

**事实(实测):**

1. QiLin 仓 `.env` 仅一枚键:`MINIMAX_API_KEY`(值脱敏)。
2. 引擎实际凭证文档 `~/.dsh/.credentials.yaml` 的 refs(仅列键名):
   `DEEPSEEK_API_KEY`、`MINIMAX_CN_API_KEY`、`ZAI_CODING_CN_API_KEY`、
   `QWEN_TOKEN_PLAN_CN_API_KEY`、`OPENAI_CODEX_API_KEY`。
   即:真实 DEEPSEEK key 在 home 凭证文档,与用户陈述一致;且**远不止两枚键,
   多服务商存货已现雏形(P4 前瞻输入)**。
3. **命名不一致疑点**:`.env` 的 `MINIMAX_API_KEY` 与 refs 中 `MINIMAX_CN_API_KEY`
   键名不匹配;凭证分层解析按 ref 名取值,`cwd/.env` 只是只读回退层
   (`packages/credentials/credentials-local/src/index.ts:3-15`),若产品配置引用的是
   `MINIMAX_CN_API_KEY`,`.env` 里那枚键永远不会被读到。**列为 P3-S0 联调核验项。**
4. **引擎全部凭证读取位点清单**(统一凭证源 D4 的事实基础):
   - 唯一管理面:`LocalCredentialProvider`,默认 `$QILIN_HOME/.credentials.yaml`
     (即 `~/.dsh/.credentials.yaml`,watch 热发布,跨进程写锁,注释保留的叶子级补丁)
     (`packages/credentials/credentials-local/src/index.ts:43-78`);
   - 信任分层:进程 env > 凭证文档 > `cwd/.env` > `$QILIN_HOME/.env`
     (同文件 :3-15 文档注释);
   - 消费方:LLM 适配族按 **scope 化 record** 读写(credentialKey(llm-pi-ai, providerId),
     `packages/llm/llm-pi-ai/src/auth.ts:27-44`);OAuth grant 以不透明 JSON 原样入库
     (同文件 :41-45)——**引擎凭证缝天然支持多服务商与 OAuth 形态凭据**;
   - 交互式取凭据:`ctx.authorization` 流缝,按 CredentialKey 注册,UI 无关
     (`packages/credentials/authorization/src/index.ts:1-40`);
   - 旁路读取:`apps/cli` 的分层 env 加载(loadLayeredEnv(qilin),`apps/cli/src/bin.ts:31`);
     除此以外无其他凭证读取位点(实测 grep)。

---

## 3. 待用户决策清单(D 系列)

> 每项给出候选项 + 推荐 + 理由。**定稿前需逐项拍板**;拍板结果回填本节,
> S 计划随之解冻。

### D1 账户体系落点

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. **引擎内扩展(推荐)** | 新增 `packages/accounts/*` cordis 插件族 + 扩展 `web-app` bundle patch;账户路由注册到既有 `webServer`,中间件语义实现为 /api 路由包装层 | 需要在 apiproxy/connection 附近加身份传递缝,动引擎面较深 |
| B. 新建 BFF app(`apps/bff`) | 独立进程,前置反代引擎 webserver,自带账户路由,其余转发 /api | 双进程部署/端口/会话共享复杂;引擎单进程组合哲学被打破 |
| C. 独立服务(延续旧网关形态) | FastAPI/Node 独立服务,引擎整体后置 | 与「引擎移植完成、Python 退役」方向相逆;P6 之外的第二个服务面 |

**推荐:A。** 理由:引擎已有干净的路由注册表与 /api 传输,账户是最典型的
「组合级横切面」,cordis patch 层正是为此设计;单进程组合避免了 B/C 的双服务运维、
会话共享与 CORS 问题。风险(A 的身份传递缝)在 S3 以显式 seam 解决。

### D2 认证机制

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. **服务端会话 + HttpOnly cookie 为主(推荐)** | 会话存服务端(SQLite,可即时吊销),cookie 只存不透明会话 id;Bearer token 作为脚本/API 兜底(契约 D) | 每请求一次会话查表(可内存缓存);需按旧语义做 CSRF |
| B. 无状态 JWT(cookie + Bearer 双轨,完全照搬旧实现) | 服务端无会话表 | 吊销依赖 token_version 全量比对,仍需服务端状态;7 天窗口内改密前的旧令牌风险窗口大 |
| C. 延伸引擎既有机制(仅 loopback/trustedHosts 栅栏强化) | 不引入账户令牌,只加强主机信任 | 无法满足多用户(不认人只认机器),与产品需求直接冲突 |

**推荐:A(cookie 会话为主 + Bearer 兜底)。** 理由:浏览器是唯一主表面,HttpOnly cookie
最安全;服务端会话表让「登出/改密/管理员踢人」成为 O(1) 吊销,语义上等价覆盖旧
token_version 契约(B 项的 ver 语义映射为会话版本字段保留);Bearer 兜底沿用旧
「仅会话创建端点回传 token」的窄口径,服务 P6 渠道与脚本调用。旧 JWT 的 typed 错误
分类(契约 C)原样保留在会话校验的错误面。

### D3 RBAC 模型

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. 仅 admin/user 双角色 + 属主校验(owner_check) | 最小可用 | 无法表达「某角色禁用某工具/模型」的资源粒度 |
| B. **双层:系统角色 + 配置驱动资源策略(推荐)** | 账户表存 system_role(admin|user|…);策略文件定义 role × resource(以引擎实际资源为准:tool/model/skill/mcp_server/route)allow/deny;通配;**deny 恒胜**;未解析身份/未知角色 → fail_closed;默认关闭、开关开启即生效 | 策略配置面需要校验器(旧实现已给出全部语义,直接移植) |
| C. 完整 RBAC/ABAC(角色/权限/继承表) | 企业级 | P3 规模失控,无当前需求拉动 |

**推荐:B,并分两小步落地**:B1 先做系统角色 + 路由级 resource:action 权限串 +
owner_check(契约 N),B2 再上配置驱动资源策略(契约 L/M)。
**强制点结论(随 B 定):服务端 /api 网关层为唯一强制点**(路由包装层统一校验);
装配期能力过滤(工具从目录摘除)作为 B2 的增强;**前端角色判断仅用于 UI 呈现,
永不作为安全边界**。

### D4 凭证统一源

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. 维持全局凭证(home 文档 = 管理员供给)(P3 推荐) | `~/.dsh/.credentials.yaml` 继续作为唯一管理面;账户与凭证解耦:任何登录用户可用服务端已配置的模型键 | 用户间无凭证隔离(单租户下可接受);需在文档/权限上显式声明 |
| B. 用户级凭证库 | CredentialProvider 新增 per-user 实现(如 `~/.dsh/users/<id>/credentials.yaml` 或账户库内加密表);RBAC 决定谁能写 | P3 范围显著膨胀;加密钥匙链(主密钥)是新课题 |
| C. 全部入 .env | 放弃管理面 | 与引擎分层信任语义冲突(该层不可写、热发布丢失),倒退 |

**推荐:P3 采 A,同时把「按用户解析凭证」定义为 P4 的扩展点**——引擎凭证缝
(`CredentialProvider` 可多实例、record 已 scope 化)天然支持后续叠加 per-user
provider,届时只需按会话归属解析,无需改动账户模型。多服务商前瞻:G1 实测 home
文档已有 5 枚键,凭证统一源在引擎侧已事实上完成,**P3 要做的是「不再新增旁路读取点」
+ 修掉 2.3-3 的命名不一致疑点**,而非新建存储。

### D5 注册方式

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. 首用户 initialize + 默认关闭自注册(推荐) | 第一个注册者成为 admin(needs_setup 流);`/register` 受配置开关即时控制(契约 J);admin 可改配置邀请他人 | 需要一个最小「用户管理」面(admin 查看/禁用/重置) |
| B. 开放注册 | 任何人可注册为 user | 引擎是全功能 agent(可执行代码、读盘),开放注册等于把 shell 交给陌生人,必须叠加强配额/沙箱,超出 P3 |
| C. 纯邀请制(邀请码表) | admin 生成一次性邀请码 | 比 A 多一张表与一个流;可作为 A 的后续增强(S6 顺延项) |

**推荐:A**(完全沿用旧网关语义,行为契约已有实测依据);邀请码(C)列为顺延项。

### D6 数据存储

| 选项 | 说明 | 代价/风险 |
|---|---|---|
| A. 复用引擎文件存储(storages JSON / settings.yaml / 自定义 yaml) | 零新依赖 | users 需要唯一性约束、原子并发写、部分索引(oauth 联结唯一),JSON 文档全部要手搓且易漂移 |
| B. **SQLite(node:sqlite,推荐)** | 单文件(如 `$QILIN_HOME/qilin-accounts/accounts.db`);users/sessions 两表起步;唯一索引原生支持 | node:sqlite 在 Node 22 需关注版本行为(引擎已有 session-persistence-sqlite 先例,风险已被踩平) |
| C. 完整 DB 服务(postgres 等) | 旧实现(sqlalchemy+alembic)延续 | 引入外部服务依赖,与引擎「单进程、home 自包含」哲学冲突 |

**推荐:B。** 理由:账户数据的形状(唯一 email、唯一 oauth 联结、并发登录写)
本质是关系型;引擎已有 node:sqlite 生产先例;旧实现的 users 表语义
(契约 O)可近乎直译为建表语句,alembic 迁移换成手写幂等 DDL。sqlite 文件
纳入既有 home 备份/隔离语义。

---

## 4. 分步实施计划(S 系列)

> 节奏:**每步 = 实现(spec 先行)→ spec 审(独立子代理对照本计划与引擎 AGENTS 纪律)
→ 质量审(测试/覆盖率/边界)→ commit**。规模:S ≤0.5 天、M ≈1 天、L ≈2 天(单人)。
> S0 完成前(D 系列拍板)后续步骤不得开工。

### S0 决策冻结与 G1 核验(规模:S)

- **范围**:用户对 D1–D6 逐项拍板,结论回填 §3;核验 `.env MINIMAX_API_KEY` vs
  `MINIMAX_CN_API_KEY` 命名疑点(§2.3-3),确认产品实际引用键名;确定密码哈希
  算法(node:crypto scrypt 为默认候选,免新依赖)。
- **验收门禁**:本文件去掉 DRAFT 标头;§3 每项有「已拍板」结论;核验项有书面结论。
- **审**:用户本人审阅即视为 spec 审。

### S1 账户核心域包 `packages/accounts/account-core`(规模:M)

- **范围**:用户与会话实体(TS 类型)、存储接口、SQLite 实现(users/sessions 表,
  含 `system_role`、`needs_setup`、会话版本字段(承接 token_version 语义)、oauth 联结列
  预留)、密码哈希(scrypt,参数固化)、幂等建表 DDL。**不含任何 HTTP。**
- **验收门禁**:vitest 单测覆盖实体/存储/哈希(错误口令、并发建表幂等、唯一约束
  冲突分类);覆盖率不低于包所在分区门禁;spec 文档列出表结构与不变量。
- **审**:spec 审(对照 D5/D6 结论)+ 质量审(测试边界:时区/时钟回拨/损坏 DB 文件)。

### S2 会话与凭据服务包 `packages/accounts/account-auth`(规模:M)

- **范围**:会话签发/校验/吊销(登录、登出、改密全灭旧会话=契约 B 的 token_version 语义)、
  typed 会话错误(EXPIRED/INVALID/MALFORMED 对齐契约 C)、CSRF 令牌签发与双提交
  校验器(纯函数,不含 HTTP)、auth-disabled 逃生阀(显式生产禁用,契约 G)。
- **验收门禁**:vitest 全语义表驱动测试(对照 §2.2.1 契约 A/B/C/F/G/H 逐条);
  改密后旧会话必死的吊销测试;CSRF 方法矩阵测试。
- **审**:spec 审(逐条对照契约表)+ 质量审(时序攻击面:比较函数恒时;垃圾
  cookie 防绕过用例,契约 H)。

### S3 HTTP 面:`/api/v1/auth` 路由 + /api 强制点(规模:L)

- **范围**:新插件注册到 `webServer`:`/api/v1/auth/*` 路由族(契约 K 的 P3 子集:
  login/local、register(受 D5 开关)、logout、change-password、me、setup-status、
  initialize);**/api 其余前缀的统一鉴权包装**(cookie 优先、Bearer 兜底,契约 D);
  ws 升级路径的会话校验接入点(与既有 untrusted-upgrade 栅栏串联);cookie 安全
  策略(契约 E,含 loopback 豁免与逃生开关)。
- **验收门禁**:vitest + webserver 集成测试(真实 node:http 起服):未登录访问
  /api 业务路由 401;CSRF 缺头写请求 403;login→me→logout 全链路;register 开关
  两态;ws 无会话升级被拒;e2e(`vitest.e2e.config.ts`)一条冷启动登录流。
- **审**:spec 审(路由表与状态码契约)+ 质量审
  (安全专项:cookie 属性、错误信息不泄露账户存在性——注册重名响应沿用旧语义
  但评估枚举风险)。

### S4 RBAC 包 `packages/accounts/account-rbac`(规模:M,依赖 S1–S3)

- **范围**:B1 先行:`system_role` 校验 + `resource:action` 权限串 + owner_check
  等价物(函数式,包 route handler);策略配置 schema(校验失败拒启,fail_closed);
  apiproxy 侧身份传递缝(请求 → Principal 单一构造点,对齐契约 M)。
- **验收门禁**:deny-恒胜/未知角色 fail_closed/默认关闭全通过 的表驱动测试;
  一个真实 /api 方法被 admin 放行、user 拒绝的集成测试;覆盖率门禁。
- **审**:spec 审(对照旧契约 L/M/N 逐条)+ 质量审(Principal 构造唯一性、
  策略热加载语义:初期定义为「重启生效」,热加载列顺延)。

### S5 前端账户面(规模:M,依赖 S3)

- **范围**:`packages/client/ui-accounts`:登录页、会话态(client-runtime 侧会话
  store 与 401 拦截)、设置内「账户/用户管理」卡(admin 可见)、CSRF 头自动附带
  (connection 层 fetch 包装);401→登录页跳转。
- **验收门禁**:apps/web vitest 组件测试(登录表单校验、错误分类文案对齐契约 C);
  手动验收脚本写进 PR 描述(浏览器全流程);不破坏既有 client-plugin HMR。
- **审**:spec 审(UI 流对照契约 D/E)+ 质量审(a11y 与空态)。

### S6 组合、文档与收口(规模:S,依赖 S1–S5)

- **范围**:`web-app` bundle patch 增补账户行(默认 profile 行为不变、auth-disabled
  时全透明);README/AGENTS 增量;D4 声明的「凭证不再新增旁路读取点」复查
  (grep 复验);发布说明草稿。
- **验收门禁**:全仓 `pnpm test`、`test:coverage`、`test:e2e` 绿;默认
  profile 冷启动不登出可用(auth-disabled 模式);文档审。
- **审**:总体 spec 终审(对照本计划 §1 目标逐条勾稽)。

---

## 5. 测试与验收策略

1. **框架**:沿用引擎 vitest 体系(单测/集成/e2e/snapshot 分配置文件);新包纳入
   既有覆盖率分区(`scripts/run-coverage-partitions.ts`),**新增分区 accounts**,
   门禁线与相邻 host 包对齐(实施时以包内既有配置为准,不另立标准)。
2. **语义回归锚**:§2.2.1 契约表 A–O 每行至少一条可执行测试(S2/S3/S4 的
   表驱动用例直接以契约编号命名,如 contract-F-csrf-double-submit),
   使「语义移植自旧网关」成为可审计断言。
3. **集成面**:真实 node:http 起服的 webserver 集成测试(S3);一条
   built-bin/冷启动 e2e(S3/S6)。
4. **安全用例最低集**:恒时比较、垃圾 cookie、注册枚举、CSRF 方法矩阵、
   ws 未授权升级、auth-disabled 在显式生产环境被拒绝。
5. **验收定义(DoD)**:S6 门禁全绿 + 本文件 DRAFT 摘除 + 契约表全行有对应
   测试引用。

---

## 6. 风险与顺延项

**风险**

| 风险 | 影响 | 缓解 |
|---|---|---|
| 引擎 apiproxy 单文件 3642 行,身份缝插入点若草率会加剧腐化 | S3/S4 复杂度失控 | 身份以显式 seam(请求上下文字段)传入,不在 apiproxy 内散布检查;S4 spec 审专项 |
| 0.0.0.0 部署 + 弱口令 = 全功能 agent 暴露 | 高危安全 | S3 起 cookie secure 策略强制;文档声明 LAN 部署责任;admin 强制改初始口令(needs_setup) |
| node:sqlite 在目标 Node 版本的行为差异 | D6 选型返工 | 引擎已有先例包;S1 首日先跑通最小 DDL 冒烟再展开 |
| CSRF 与 SSE/ws 的边界(SSE 读不受 CSRF 管,ws 升级需独立校验) | 安全缝隙 | S3 验收门禁已含 ws 未授权升级用例 |
| auth-disabled 逃生阀被误用于生产 | 高危安全 | 沿用旧契约 G:显式生产环境变量探测时拒绝禁用(S2 测试覆盖) |
| 账户库与既有 home 数据(sessions/storages)的归属映射未定义 | 多用户体验割裂 | P3 只建 user↔session 归属表(非目标里已限定不改历史数据),完整数据面隔离归 P4/P6 顺延评审 |

**顺延项(不在 P3)**

1. 邀请码注册(D5-C)、用户级凭证库与加密(D4-B)、策略热加载(S4)、
   资源策略装配期过滤增强(D3-B2 深化)。
2. 第三方 OAuth 登录(引擎侧归 `ctx.authorization` 流缝,需求出现再立项)。
3. 8 IM 渠道的账户联结(P6 退役时统一评审渠道身份语义)。
4. 计费/配额/组织多租户。
5. 品牌壳(P5)对登录页的视觉接管。

---

## 7. 证据索引(快照)

- 引擎仓:`/Users/libing/kk_Projects/qilin-engine` @ main `795b8dc`(tag
  `qilin-engine-v0`,工作区干净)。
- QiLin 仓:`/Users/libing/kk_Projects/QiLin`;旧 Python 代码仅只读盘点
  (`qilin/`、`app/`),`vendor/`、`python/` 未触碰。
- 本文件引用的全部 文件:行 号以两仓上述提交为快照基准;后续提交若移动行号,
  以语义描述为准。
