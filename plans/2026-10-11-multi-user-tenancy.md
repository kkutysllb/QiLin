---
description: "多用户（多租户）改造计划：账号→租户映射、会话/任务/工作区隔离，插件与模型配置共享。含证据盘点、租户覆盖层样例、验收清单与阶段划分，未改动产品代码。"
kind: "plan"
---

# 多用户架构改造计划（会话与任务隔离，插件与模型配置共享）

- 日期：2026-10-11
- 状态：**计划**，未改动产品代码
- 决策记录：[多用户租户边界](../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.md)（已实现）
- 相关既有决策：[单 Harness 主目录解析器](../.agents/notes/implemented/architecture/2026-07-24-single-harness-home-resolver.md)、[本地账号与落地页](../.agents/notes/implemented/feature/2026-09-12-qilin-local-accounts-and-landing.md)、[预会话入口与用户名](../.agents/notes/implemented/feature/2026-09-16-pre-session-entry-and-usernames.md)

## 0. 需求

把当前的单租户框架改成多用户：**会话与任务按用户隔离；插件与模型配置等共享。** 拆成四类状态：

| 类别 | 期望 | 本文命名 |
|---|---|---|
| 会话 | 每个用户只看得到、只能操作自己的会话 | 租户隔离 |
| 任务 | 每个用户只看到自己的任务，任务只在自己的会话上执行 | 租户隔离 |
| 工作区 | 随会话走（工作区状态里夹着会话 id） | 租户隔离 |
| 插件、模型配置、凭据、技能、预设 | 全部署一份，任何用户装/改都对所有人生效 | 全局共享 |

## 1. 结论：今天的单租户是结构性设计，不是缺一个开关

三条一手证据：

1. [accounts-local 模块文档](../packages/identity/accounts-local/src/index.ts#L1-L9) 原文：账号门禁的是 "**one harness home**"；"they are **not a tenancy boundary**, and a second account reaches the same Sessions, credentials, and files as the first."
2. [accounts-local README](../packages/identity/accounts-local/README.md#L144) 把运维口径写死：分开的人需要**分开的 `QILIN_HOME` 与端口**。
3. [operator-peer.ts](../packages/client/connection/src/operator-peer.ts#L1-L6)：Connection 只拥有**一个** operator Peer，"the one party this Host answers to"，并把它作为`invocation.peer`交给每个 Remote 调用。

推论：**根本没有"请求属于谁"这条信息流到业务服务。** 账号身份止步于 HTTP 门禁（[rpc-host.ts:132-145](../packages/client/connection/src/rpc-host.ts#L132-L145)）：过了 Host/Origin 栅栏与鉴权之后，一切请求都说自己是同一个人（[gateway:724](../packages/api/gateway/src/index.ts#L724)）。

反过来，**要共享的那部分今天天然共享**——因为它们都由单一 Harness 主目录解析（[single-harness-home-resolver](../.agents/notes/implemented/architecture/2026-07-24-single-harness-home-resolver.md)）。所以这个需求不是"加一层租户"，而是**把少数几个根按用户拆开，其余原地不动**。

## 2. 状态面盘点

| 面 | 今天的落点 | 证据 |
|---|---|---|
| 账号 | `$QILIN_HOME/auth/accounts.json`（0600，scrypt 哈希）；HMAC 签发、绑定 authority 的 HttpOnly cookie | accounts-local/src/index.ts:1-9；README.md:144-149 |
| 传输身份 | Connection 恰有一个 operator Peer | operator-peer.ts:1-6 |
| 门禁与准入 | Host/Origin 栅栏 → 账号会话或设备 cookie；放行即 operator | rpc-host.ts:132-145 |
| RPC 面 | 单一 `/api`；direct 端点经网关自己的 `ctx.typert.local` 解析 | gateway/src/index.ts:235-243,327-331；会话控制器 agent.ts:148-163 |
| 会话磁盘 | `$QILIN_HOME/sessions/<cwd 段>/<id>/<generation 文件>`；`findLog` 跨全部 project 目录唯一化同一 id | bundle/base/cordis.patch.yml:117-120；session-persistence-jsonl/src/format.ts:254,267；src/index.ts:1516-1531 |
| 会话内存 | 单一 SessionStore；未给 id 时自增 `session-<n>` | core/session/src/index.ts:1146-1153 |
| 冷读与搜索 | session-query 可选注入 sessionPersistence；索引的 `path`/`openAt` 可配 | session-query/src/corpus.ts:43；session-query-sqlite/src/index.ts:92-106 |
| 投影缓存 | `storage-json` 根下的 `session_projcache` 域（per-record） | bundle/base/cordis.patch.yml:163-166；session-projection-cache/src/spec.ts:101-107；src/index.ts:105-120 |
| 任务（Automation） | **主机级** `schedule` 域；记录带原始 Session id 与全局唯一 task id；一个宿主运行时启动时扫描 | schedule/src/storage.ts:1,57-59；packages/schedule/AGENTS.md |
| 工作区 | 全局单例状态含 `archivedSessionIds`/`pinnedSessionIds` | workspace/src/spec.ts:62-63,76-83 |
| 事件面 | 一个全局事件源；`api-session/*` 与 `schedule/changed` 广播给每个客户端 | api/remotes/src/index.ts:40-45；remote-events.ts:22-26,43 |
| 插件与 profile | `$QILIN_HOME/profiles/<name>` 与同目录 `node_modules` | boot/app-boot/src/profile.ts:5,53,722-723 |
| 模型配置与凭据 | `settings.yaml` 与 `.credentials.yaml`，两者都带 `path`/`qilinHome` Config | settings-file/src/index.ts:23-24,57；credentials-local/src/index.ts:61-66,90 |
| 附件字节 | `attachment-local` 的 `qilinHome` Config | attachment-local/src/index.ts:61-63,148-150 |
| 上传索引 | 构造器默认 `QILIN_HOME/llm-deepseek/files-v3.json`，**无 Config** | llm-deepseek/src/upload-index.ts:117-119 |
| 客户端宿主事实 | `{ home: homedir() }` 硬编码 | api/remotes/src/index.ts:42 |

补一条常被忽略的：`$QILIN_HOME/cordis.patch.yml` 是**机器级用户层**，对所有 profile/租户生效（[profile-boot.ts:188-195](../apps/cli/src/profile-boot.ts#L188-L195)）。多租户下它是"全部署共享层"，正好符合"插件与模型配置共享"的需求。

## 3. 需求 → 隔离面

| 需求 | 必须按租户拆的根 | 保持共享 |
|---|---|---|
| 会话 | 会话根、SessionStore、query 索引、投影缓存、附件根、上传索引 | 会话格式、模型与工具定义 |
| 任务 | `storage-json` 根（schedule 域随之）、后台触发器 | 触发器代码、webhook 配置 |
| 工作区 | 同一个 `storage-json` 根（workspace 域连带 archived/pinned 会话 id） | 宿主文件系统本体 |
| 事件 | 转发集合按租户裁剪 | 事件协议与封装 |
| 隔离的例外 | —— | profiles、plugin-manager、MCP、skills、presets、settings.yaml、.credentials.yaml |

一个关键发现：**换一个 `storage-json` 根就同时隔离了 workspace、schedule、投影缓存三个域**，因为它们都经 `ctx.storageDomain` 打开（projection-cache/src/index.ts:105-120）。

## 4. 方案 A：租户守护进程 + 一户一个引擎运行时（推荐）

### 4.1 拓扑

```
浏览器 ── HTTP ──► qilin tenants serve（新增，hub）
                     ├─ 目录页：列出共享账号文件里的账户，逐个给 /t/<用户名>
                     ├─ 账号 → 租户：租户 id = 账号 id，目录 $QILIN_HOME/tenants/<账号 id>/
                     ├─ 按需拉起：<当前 qilin 入口> --profile web --host 127.0.0.1 --port 0 --no-open
                     │                              --patch <tenantDir>/cordis.patch.yml
                     │            QILIN_HOME=<共享 home>     ← 插件/模型配置共享
                     ├─ 解析就绪行取该租户带令牌的 URL，303 把浏览器送过去
                     ├─ 空闲回收：超过 --idle-ms 没有跳转就停掉该运行时（数据留在磁盘）
                     └─ 不认证：登录发生在各租户运行时（见 §4.4 与 §11.2）
```

V1 不反代：hub 只跳转，浏览器此后直接与租户运行时通信。反代、单源、WS 与媒体路由属 P3；上表 §4.1 的「认证/反代」是 P3 的形态，P2 把它落在各运行时里（理由与代价见 §11.2、§11.4）。

这不是新发明：桌面包已经把同一套做完了——spawn 引擎子进程 → 收 `ready{url, injections}` 消息（[host-process.mjs:261-276](../desktop/main/host-process.mjs#L261-L276)）→ 用只存在于主进程的认证 cookie 反代到宿主 loopback。而且引擎**主动把这条就绪信号定义成语义接口**：

> "The URL line and browser handoff are readiness signals: **supervisors RPC as soon as they observe the line**."
> —— [packages/bundle/web-app/src/index.ts:262-281](../packages/bundle/web-app/src/index.ts#L262-L281)

所以守护进程不必新增引擎 RPC；读 stdout 的就绪行即可（`--no-open` 关掉浏览器接手）。启动器已经支持 `--profile`、`--patch`（[cmdline/src/index.ts:5](../packages/boot/cmdline/src/index.ts#L5)；[app-boot/src/index.ts:348](../packages/boot/app-boot/src/index.ts#L348)），`--patch` 又是最外层（bundle 层 → 主目录用户层 → `--patch` 覆盖层，[profile-boot.ts:188-195](../apps/cli/src/profile-boot.ts#L188-L195)）。

### 4.2 租户覆盖层样例

`--patch` 按行 id 覆盖整份 config，且下面这些字段今天**全部**已是校验过的 Config——不需要给引擎加"多租户模式"：

```yaml
# <tenantDir>/cordis.patch.yml —— 由守护进程按租户生成（租户 id 直接内联，不依赖环境变量）
- id: session-persistence-jsonl
  config:
    root: !!js qilinHomePath('tenants', 'alice', 'sessions')      # 默认 qilinHomePath('sessions')
- id: storage-json
  config:
    root: !!js qilinHomePath('tenants', 'alice', 'storages')      # 默认 qilinHomePath('storages')
- id: session-query-sqlite
  config:
    path: !!js qilinHomePath('tenants', 'alice', 'session-query.sqlite')
    openAt: startup                                               # 默认 :memory: + never
- id: attachment-local
  config:
    qilinHome: !!js qilinHomePath('tenants', 'alice')
# 以下行一律不写入覆盖层，保持共享：
#   settings-file / credentials-local / profiles / MCP / presets / skills
```

`qilinHomePath(...segments)` 是可变参助手（[home-paths/src/index.ts:98](../packages/util/home-paths/src/index.ts#L98)），base bundle 正是这么用的。

### 4.3 引擎侧最小改动清单

| # | 事项 | 规模 | 说明 |
|---|---|---|---|
| A1 | `llm-deepseek` 上传索引补 Config（现为构造器默认值，无配置面） | 小 | upload-index.ts:117-119。不隔离不会跨租户"列举"，但会共享一份上传 id 映射，属该记的让步 |
| A2 | `RemoteHostFacts.home` 由硬编码 `homedir()` 改为可注入的部署事实 | 小 | api/remotes/src/index.ts:42。否则租户客户端显示的仍是同一台机器的 home，UI 无法区分身份 |
| A3 | 守护进程本体（账号→租户、拉起/回收、就绪解析、反代、审计） | 中 | 反代与 WS 逐跳透传可参照桌面 `protocol.mjs` |
| A4 | 租户注册表与生命周期（空闲回收、退避重启、端口池、并发上限） | 中 | 桌面 `host-process.mjs` 的重启/watchdog 是现成范式 |
| A5 | 运维面（`tenants` 子命令：建户/停户/改户/重置口令） | 小 | 今天删账与改密要手改 accounts.json（README.md:147） |
| A6 | `accounts-local` 增 `admittedAccounts`：一份部署只接纳列名账户，登录与已签发会话双向拒绝；空名单、未知 id、未关注册一律装载失败 | 小 | P2 已实现，见 §11.3 |

注意 A1、A2、A6 是**全部**与租户相关的引擎改动；其余都在新增的 hub 里。

### 4.4 鉴权：两个变体

| | V1 每租户独立端口（默认） | V2 单源反代（`--single-origin`，已交付） |
|---|---|---|
| 做法 | 守护进程把浏览器 303 到 `127.0.0.1:<tenantPort>` | 浏览器只见 hub 一个 origin；hub 按路由 cookie 归属租户，把 `Host`/`Origin` 改写成运行时自己的 authority 后转发 |
| 隔离依据 | 每个运行时的 `accounts-local` 只接纳自己的账号（`admittedAccounts`），cookie 名绑定 `host:port` 天然不互通 | 同左：运行时仍只接纳本租户账号；hub 只转发字节，不做访问判定 |
| 代价 | 每个租户要单独登录一次 | 一个浏览器同时只活跃一个租户（路由 cookie 是浏览器级）；hub 需维护反代与 WS 管道 |
| 适合 | 一个浏览器要同时开多个租户、内网原型 | 生产单租户入口、需按真实流量回收 |

### 4.5 已知让步（必须写清楚）

1. **文件系统不是隔离面。** 所有租户跑在同一个 OS 用户下，agent 的 shell 与文件工具能读到别人的目录，也能读到共享的 `.credentials.yaml`。这套架构里的租户是**协作方**，不是互不信任方。要对抗性隔离必须在守护进程之上再加 OS 级隔离（独立系统用户或容器）。
2. **模型 key 与计费共享。** 共享 settings/credentials 就意味着共享同一把 provider key；今天没有按用户计量的缝（会话遥测只带匿名安装 id）。
3. **插件安装是共享写。** 多个运行时同时操作 `profiles/` 需要单写者纪律（只在守护进程侧执行安装，或加锁 + 变更广播）。
4. **成本随租户数线性增长。** N 份运行时（内存、端口、profile 物化），需要空闲回收与上限。
5. **一次升级影响全部租户。** 这通常是优点，但要写进升级 SOP。

## 5. 方案 B：单进程租户平面（备选）

若"一个进程"是硬需求，仓库里已有可用原语，但改动面数倍于 A：

| # | 改造 | 锚点 |
|---|---|---|
| B1 | 账号 → Peer：每账号一个 PeerScope，替换无条件 operator 准入 | rpc-host.ts:142-145；operator-peer.ts:1-6 |
| B2 | direct 端点改为按 peer 解析服务平面（而不是网关自己的 `ctx.typert.local`） | gateway/src/index.ts:327-331 |
| B3 | 每租户平面：用 `ctx.isolate(name, tenantSymbol)` + `ctx.plugin(...)` 挂会话存储/持久化/json 存储/域/查询/投影缓存/jobs/workspace/schedule/附件/终端 | vendor/cordis/src/context.ts:115-121 |
| B4 | lookups 与 host context 解析器移入租户平面 | session-controller/src/agent.ts:148-163（今天 `resolveAgent` 只做子代理归属判定，与调用者无关） |
| B5 | 事件转发按 peer 裁剪（源工厂签名要拿到 peer） | api/remotes/src/index.ts:47-79；remote-events.ts:22-26,43 |
| B6 | 会话 id 必须全局唯一：按 store 隔离后 `session-<n>` 会撞号 | core/session/src/index.ts:1149 |
| B7 | 后台执行者携带租户：schedule 触发器、webhook、goal 轮次、子代理 | schedule/src/storage.ts:1,57-59；packages/schedule/AGENTS.md |

结论：B 是"把引擎本身变成多租户引擎"，每一处漏掉都是静默的跨租户泄漏；除非有"必须单进程"的硬约束，否则不建议一期做。

## 6. 方案 C：只加归属字段并逐端点校验（不推荐）

给会话头加 owner、再在可达入口逐个加归属校验。理由：会话头是不可变存储元数据，加字段要动格式版本与发布期迁移规则；可达 id 的入口有 20+ 个 Remote 端点加 schedule/webhook/子代理旁路，漏一处即越权；换来的是最弱的隔离（同进程、同缓存、同事件面）。改动面最大、保证最弱。

## 7. 验收标准

一条改造是否成立，用这八条可观测判据判定（阶段 P1/P2 逐条落脚本）：

1. **会话不互见**：A 建的会话不出现在 B 的会话列表与搜索里；
2. **任务不互见**：A 的定时任务不出现在 B 的任务面，B 的运行时也不扫描 A 的任务域；
3. **工作区不互见**：工作区列表与 archived/pinned 会话状态各归其主；
4. **配置与插件共享**：B 能直接用 A 装好的插件与同一份模型设置，无需重复配置；
5. **事件不串**：B 的客户端收不到 A 的 `api-session/*` 与 `schedule/changed`；
6. **越权拒绝**：以 B 的身份请求 A 的会话 id → 得到"不存在/拒绝"，而不是 A 的会话；
7. **共享写安全**：两个运行时同时触发插件安装不产生损坏；
8. **生命周期**：空闲回收后的租户再访问能恢复，数据不丢。

## 8. 阶段

| 阶段 | 内容 | 完成判据 |
|---|---|---|
| P0 | 本计划 + 决策记录落仓；同步修订 accounts-local 的边界表述 | 文档就位，边界口径唯一 |
| P1 | 一个 home + 两份租户覆盖层 + 两个运行时（已落成常备测试） | ✅ 第 1–6 条判据逐条通过，见 §10 |
| P2 | 守护进程 V1：`qilin tenants serve`（账号→租户、按需拉起、就绪解析、303 到租户端口、空闲回收），边界由各运行时的 `admittedAccounts` 承担 | ✅ 见 §11 |
| P3 | 守护进程 V2（单源反代 + WS + 媒体流，按真实流量回收） | ✅ 见 §12；真浏览器走查与录 GIF 仍待办 |
| P4 | 可选：按用户计量/配额；再评估是否需要 B | 计量数据可从请求侧归集 |

## 9. 开放决策

| # | 决策 | 本计划的默认口径 |
|---|---|---|
| D1 | 一期走 A 还是直接做 B | A（B 留作硬约束出现时的备选） |
| D2 | 鉴权 V1 还是 V2 | V1 起步、V2 作为产品形态 |
| D3 | 租户之间是协作还是互不信任 | 协作。同 OS 用户下这是技术事实，不是选择；对抗性隔离要另加一层 |
| D4 | 是否需要按用户配额/计费 | 一期不做，留 P4 |

## 10. P1 执行记录（2026-10-11）

P1 已落成常备测试：[tenant-isolation.expected.e2e.ts](../apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts)，共用的多运行时 harness 在 [tenant-web-process.ts](../apps/cli/tests/profiles/web/tests/tenant-web-process.ts)。它跑**构建产物的真进程**（`node apps/cli/lib/bin.js --profile web`）：两个租户各一个运行时、一个共享 `QILIN_HOME`、各自一份 `--patch` 覆盖层，全程约 2 秒，无模型调用。

### 10.1 覆盖层实测（P2 守护进程按这份生成即可）

```yaml
# <tenantDir>/<tenant>.patch.yml
# 每条表达式在装载期按共享 QILIN_HOME 求值。
- id: session-persistence-jsonl
  config:
    root: !!js qilinHomePath('tenants', '<tenant>', 'sessions')
- id: storage-json
  config:
    root: !!js qilinHomePath('tenants', '<tenant>', 'storages')
- id: session-query-sqlite
  config:
    path: !!js qilinHomePath('tenants', '<tenant>', 'session-query.sqlite')
    openAt: never
- id: attachment-local
  config:
    qilinHome: !!js qilinHomePath('tenants', '<tenant>')
```

部署级选择（账号门、要不要任务）落在共享 home 的机器层 `$QILIN_HOME/cordis.patch.yml`，两个租户自动继承；租户覆盖层只写上面四条根。

### 10.2 六条判据的实测与判据强度

| 判据 | 断言 | 强度 |
|---|---|---|
| 1 会话不互见 | 两个运行时**各建一个会话之后**互查列表（A 不含 B 的、B 不含 A 的），再加两侧磁盘会话根各归其主 | 强 |
| 2 任务不互见 | 只给 A 预置一条 schedule 记录：A 的 `schedule/catalog` 读到它，B 读到空数组 | 强 |
| 3 工作区不互见 | A 建工作区后：B 删除它失败、A 删除成功；两侧 `workspace.json` 只出现各自的工作区路径 | 中 |
| 4 配置与插件共享 | A 写 `ui-theme.fontSize`，B 未配置即读到 16；两个租户目录下不存在 settings/credentials/profiles | 强 |
| 5 事件不串 | 两条 `$events` 流各自 ready（增量投递已激活）后，B 收到自己的 `api-session/added`、从未收到 A 的 | 弱：进程分离本身即保证，价值在于守住"退回单进程方案"（§5 B5） |
| 6 越权拒绝 | B 用 A 的会话 id 调 `session/rename` 被拒，A 用同一 id 改名成功 | 弱：同 5 |

判据 5/6 在"一个运行时一个租户"下是进程边界的结果，不是覆盖层的功劳；它们真正的用处是在 §5 的单进程方案里当回归门。

### 10.3 负对照：这份测试确实会失败

把每租户覆盖层从命令行撤掉、让两个运行时落到同一个默认根后重跑：**测试在判据 1 的线上列表断言处失败**（B 的列表里出现了 A 的会话），磁盘断言也独立抓到（会话落在共享根，而不是 `tenants/<租户>/sessions`）。即它验证的是覆盖层本身，不是 harness 自带的分隔。

### 10.4 实测确认的三件事（P2 的前提）

1. `--patch` 覆盖层确实压在 bundle 层之后：四条根逐条生效（会话目录、storages、query 索引、附件根），未列出的行保持共享。
2. 换一个 `storage-json` 根确实同时搬走 schedule、workspace、投影缓存三个域——租户的 `storages/` 下同时出现预置的 `schedule.json` 与运行时新建的 `workspace.json`。
3. **任务面不是随附能力**：shipped Web 组合没有 schedule 行（`/api/schedule/catalog` 实测 404，bundle/preset 里也没有该行），任务来自可选 bundle [schedule-bundle](../packages/experimental/schedule-bundle/cordis.patch.yml)。所以"任务隔离"的前提是部署先决定要不要任务（两个租户挂同一份 bundle），隔离只决定"谁的任务"。

### 10.5 本次发现的两处既有红（与 P1 无关，未修）

`apps/cli/tests/profiles/web/tests/` 下的既有 expected 测试对不上当前产品：

| 现象 | 证据 | 影响 |
|---|---|---|
| 就绪行匹配写死 `qilin web: ` | 产品行文被 [web-brand 的 web-runtime 行](../packages/bundle/web-brand/cordis.patch.yml#L21) 改成 `label: qilin`；实跑输出 `qilin: http://127.0.0.1:<port>/workspace?token=…` | `withDefaultWeb` 的就绪轮询永远等不到，`schedule-timing` / `web-default-isolation` 等以 120 s 超时失败 |
| 把 schedule 当随附能力 | shipped Web 组合无 schedule 行；`fixtures/schedule.patch.yml` 的 `- id: schedule` 指向不存在的行 | `schedule-timing.expected.e2e.ts` 的 `/api/schedule/catalog` 得到 404 |

新测试不依赖这两处（自带按输出匹配就绪 URL，并显式挂上 schedule bundle），所以它们不影响 P1 的结论。两条已在同轮收掉，见 §11.6。

## 11. P2 执行记录（2026-10-11）

`qilin tenants serve` 已落地，常备验收在 [tenant-supervisor.expected.e2e.ts](../apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts)（真进程，约 6–8 秒，无模型调用）。

### 11.1 交付形态

| 件 | 内容 |
|---|---|
| [`apps/cli/src/tenants.ts`](../apps/cli/src/tenants.ts) | hub：目录页、`/t/<用户名>` 303、`/status`、`/healthz`、空闲回收、SIGTERM 收口 |
| [`apps/cli/src/tenant-runtime.ts`](../apps/cli/src/tenant-runtime.ts) | 每租户运行时：覆盖层生成、按需 spawn、就绪解析、SIGTERM→SIGKILL 收口、stderr 转发 |
| [`apps/cli/src/args.ts`](../apps/cli/src/args.ts) | `qilin tenants serve [--host --port --profile --idle-ms]` |
| [`accounts-local`](../packages/identity/accounts-local/README.md#the-admission-list) | `admittedAccounts` 接纳名单；包文档与 JSDoc 的边界表述同步改写 |

### 11.2 与 §4.1 的偏差（如实登记）

§4.1 写的是「hub 认证、反代、把 cookie 附到转发请求上」。P2 实际把边界放在**各租户运行时内部**：hub 不认证（P3 的单源模式让它还要转发字节，但同样不做访问判定）；登录由运行时的账号门完成，`admittedAccounts` 保证它只接纳本租户的账户。

理由是判定要落在做出决定的操作里：把接纳写进 `accounts-local` 的登录路由与 `currentAccount`，本地进程即使知道端口也必须过账号门；若改成 hub 自建 cookie + 租户关掉门禁，隔离就退化成"知道端口即可读全部数据"。§4.4 的 V1 口径（每租户独立端口、各自登录一次）因此保持不变。

### 11.3 验收（真进程，七个断言）

| # | 断言 | 实测 |
|---|---|---|
| 1 | 目录列出共享账号文件里的每个账户 | ✅ |
| 2 | 两个账户各得一个运行时，origin 互不相同，也都不是 hub | ✅ |
| 3 | **边界**：共享文件里同时有 alice 与 bob，alice 的运行时接纳 alice；用 bob 的口令登录得到 401 `invalid-credentials` | ✅ |
| 4 | 会话各归其主：alice 的会话不在 bob 的列表里，且只落在 `tenants/<alice id>/sessions` | ✅ |
| 5 | `/status` 报告 origin，且从不出带令牌的 URL | ✅ |
| 6 | 空闲回收后再次跳转得到新运行时，**alice 的会话仍在**（判据 8） | ✅ |
| 7 | hub 收到 SIGTERM 退出码 0，其租户运行时随之不再监听 | ✅ |

**负对照**：把租户覆盖层的 `admittedAccounts` 去掉（保留 `enabled: true` 与 `registration: closed`），测试在判据 3 上失败（`expected 200 to be 401`）——它证明的是接纳名单本身，不是 hub 的跳转。

包内的 `accounts-local` 用例覆盖另外三个方向：非列名账户的登录被拒、已签发的非列名会话不再命名账户（`/?next=` 重定向）、以及三种装载失败（空名单、未知 id、未关注册）。

### 11.4 已知让步（P2 版）

1. 租户 id = 账号 id，1:1 且无注册表，因此没有"两个账户共用一个租户"或改名这一层；账户侧的开户/改密/注销运维面见 §11.8。
2. 空闲窗口按**最后一次跳转**计：浏览器到达租户 origin 后直接与它通信，hub 看不到这份流量，所以长时间开着标签页的部署要把 `--idle-ms` 调大或设为 0。`--single-origin` 已按真实流量判定（§12）。
3. 账户由共享 home 的普通 Web 表面创建（hub 不提供开户），租户覆盖层把 `registration` 关掉，因此某个运行时不能顺手造号。
4. §4.5 的四条让步仍然成立：同一 OS 用户、共享模型 key、插件共享写、成本随租户数线性增长。

### 11.5 仍未做

- A1 / A2 经代码复核判定**不需要改**，依据见 §11.7。
- 租户运行时的日志等级与轮转未做。
- P3（单源反代 + WS + 媒体流）未开。

### 11.6 两条过期 expected 车道的修复（同轮收口）

§10.5 记录的两处在同一轮收掉，并把它们所在的 8 个车道（67 例）从 44 红跑到 **62 通过 / 5 红**：

| 修复 | 落点 |
|---|---|
| 就绪行按 URL 而非产品名匹配 | 新增 [startup-url.ts](../apps/cli/tests/startup-url.ts)：产品行是 `<label>: <url>`，而 label 是 `web-runtime.label` 这一可被部署替换的配置行。`default-web-process`、`web-failure-matrix`、`web-best-effort-startup`、`creator-plugin-manager`、`web-browser-open`、`web-auth`、`built-bin`、`lazy-search-startup`、`github-webhook-real`、`apps/web/tests/{support,hmr-live,smoke-real}` 与 `scripts/publish-npm-baseline.ts` 全部改用它或同一形态的表达式 |
| schedule 是可选组合而非随附能力 | `schedule-timing` 显式挂 [schedule-bundle](../packages/experimental/schedule-bundle/cordis.patch.yml)；`web-default-isolation` 改为断言 shipped 组合**不含** `time-context` / `schedule` / `ui-schedule` 三行；旧 fixture `fixtures/schedule.patch.yml` 删除 |

收口过程中又露出三处**同一类**的过期断言（产品演进而车道没跟上），一并改正：

| 过期断言 | 现产品 | 依据 |
|---|---|---|
| 用令牌换来 cookie 后直接取应用文档 | shipped Web 组合默认开账户门，令牌只到登录面 | [hmr-live.e2e.ts](../apps/web/tests/hmr-live.e2e.ts) 的既有先例；未测账户门的车道按 accounts 行自述的部署逃生口挂 `enabled: false` |
| 应用文档取 `/` | 站点根是落地页，应用文档在 `WEB_ENTRY_PATH`（`/workspace`） | 同目录 `web-default-isolation` 的既有写法 |
| `session/create` 返回 `agentPreset: 'standard'`、fixture 挂 `'cordis'` 预设、sidebar-browser 行「resolved but disabled」 | shipped 预设只有 `ptc`（[web-app 行](../packages/bundle/web-app/cordis.patch.yml#L579)）；`ui-sidebar-browser` 行无 `disabled` | 实跑输出与 bundle 行 |

**剩余红项的处置（2026-10-11 实跑复验；截至第 11 轮只剩 `web-failure-matrix` 2 例）**：

| 车道 | 现象（实跑） | 处置 |
|---|---|---|
| `web-best-effort-startup` ×2 | 保存的诊断报告不再出现 `module: '@qilin-agent/client-connection'`——`connection` 的 `inject` 已改为 `webStartup`，绑定失败不再牵动它，真正失败的是 HTTP 服务器本身 | **已修**：断言改为报告必须点名实际失败的模块 `module: '@qilin-agent/host-webserver'`（与同一用例第 306 行的摘要断言一致），该车道 **8/8 全绿** |
| `creator-plugin-manager` ×1 | 真正的漂移是**调用面**：本模式下只有 `run_code` 可直接调用，fixture 里对 `plugin_manager` 与 `mcp__demo__ping` 的直调都被拒（`unknown tool "…": only run_code is callable directly`），失败臂是 `ToolExecutionResult` 的 failure 形态（`isError: true`、有 `content`、**无 `value`**），于是 `JSON.parse(undefined)` 报错 | **已修**：fixture 改为经 `run_code` 程序分派每个工具（`dispatch(name, args)`），成功臂取 `(await …).value.result`（run_code 的 value 是 `{ logs, result }`，而 `result` 是被调工具自己的 JSON 文本值）再解析。该车道 **1/1 全绿**，且覆盖到真实 P3 分派路径（装 bundle → MCP 工具进入 schema → 重启后仍在 → 移除后消失）。**纠正上一轮的判断**：`ctx.tools.execute` 并没有改成直接返回 value，它返回的仍是 `{ isError, value, content }`；我上一轮把「被拒导致无 value」误读成了「契约变更」 |
| `web-failure-matrix` ×2 | 机制已定位在 [app-boot/src/index.ts:310-317](../../packages/boot/app-boot/src/index.ts#L310-L317)：`reconcileProfilePatches` **先** `entry.update(...)` 应用新补丁，**再**判「是否引入了新的未激活项」，若引入则抛出。于是这次 reload 在报文层是失败的、在树上却已经生效；随后修好配置的那次 reload 里 `client-hmr` 仍 pending 在 `clientModules`（另一条用例是 `modules` pending 在 fixture 自己删掉的依赖），恢复不到「服务中」状态 | **未修，也不改测试**：把期望改成「恢复不了」等于把未裁定的产品契约写进断言。需要先决定：被拒的 reload 是否应**回滚**上一份补丁（否则 pending 的依赖链会让应用卡死）。归属上与本工作无关（两个包都未被本工作触碰） |

另注：`test:expected` 整车道同期还有约 25 例既有红（headless / acp / qilin-badge / session-format-guard），与本次改动无关。

### 11.7 A1 / A2 的结论：都不需要改（带代码依据）

| 提案 | 依据 | 结论 |
|---|---|---|
| A1 `llm-deepseek` 上传索引补 Config | 索引记录的键是 `scope = sha256(baseURL + credentials)`（[upload-index.ts](../packages/llm/llm-deepseek/src/upload-index.ts#L45-L52)），即**按 provider 凭据分命名空间**；本部署按 §4.5 共享同一把 key | 共享一份索引是正确行为——同一凭据下同一个附件不该重复上传，而按租户拆路径只会重复上传、不增加隔离。不做 |
| A2 `RemoteHostFacts.home` 可注入 | 唯一消费者是引用补全的路径缩短（[ui-reference](../packages/client/ui-reference/src/client/index.ts#L62)），其值是**文件所在机器**的 home | 每台机器一个 home，与租户无关；租户身份由账号面回答（一个运行时只服务一个账号，客户端从 `/api/auth/status` 即知）。不做 |

### 11.8 P2 运维面：账户生命周期、并发上限、崩溃退避（同轮收口）

P2 的缺口是「没有运维面」：租户运行时只接纳它服务的那个账户且 `registration: closed`，所以**它的 Web 界面本身无法创建第二个账户**；而 `--idle-ms` 之外没有任何资源边界。本轮补齐三件。

**一、账户生命周期（建户 / 改户 / 停户）**——新增 [tenants-roster.ts](../apps/cli/src/tenants-roster.ts)，四条子命令：

| 命令 | 行为 | 落点 |
|---|---|---|
| `qilin tenants accounts` | 列出账户与各自拥有的租户目录（存在与否） | `rosterEntries()` |
| `qilin tenants add <用户名> [--email] [--password-stdin]` | 建户：规范化并校验名字/邮箱/密码长度，拒重复名字与重复邮箱，建出租户目录 | `addAccount()` + `ensureTenantDirectory()` |
| `qilin tenants passwd <用户名> [--password-stdin]` | 改户：换密码并递增 `tokenVersion`（已签发会话立即失效） | `AccountStore.setPassword()`（新增） |
| `qilin tenants remove <用户名> [--purge-data]` | 停户：从名册移除；默认**保留**租户目录，`--purge-data` 才删 | `AccountStore.remove()`（新增） |

密码默认在终端**不回显**地提示两次（提示写 stderr，readline 的 echo 写进丢弃流），`--password-stdin` 供无人值守使用；**不接受 `--password <值>`**，那会把密码留在进程表里。

`remove` 的语义按「文件即真相」设计：名册移除后，hub 的 `/t/<用户名>` 立刻 404，而**已经在跑的**运行时按 §11.4 的姿态继续服务到被回收或重启；重启时它会在装载期**明确失败**（`admittedAccounts` 列了一个文件里不存在的 id），而不是静默服务一个已注销账户。`--purge-data` 只删由本 home 从账户 id 推导出的那个目录（前缀与 resolve 双重校验），不信任账户文件里的任何路径。

**二、并发上限**：`--max-tenants <count>`（默认 0 = 不设限）。超过上限时回收**最久未被跳转**的运行时再启动新的（每个租户的 Session 都在磁盘上，回收代价是一次启动），日志逐条打印 reclaiming。跳转本身经一条串行队列（`serialize()`），所以两个并发跳转不会同时通过上限判定。`/status` 增加 `maxTenants` 与 `alive`（运行中 + 启动中）两个字段。

**三、崩溃退避**：`TenantRuntime` 记录连续失败数并在失败后拒绝早于 `retryAt` 的重试（`--restart-backoff-ms` 为基数、每次连续失败翻倍、上限 300 s，见 [tenant-runtime.ts](../apps/cli/src/tenant-runtime.ts)）。三类失败都计数：启动期退出、URL 截止期超时、**就绪之后崩溃退出**（`stop()` 主动停止标记为 intentional，不计为崩溃）；一次成功启动把计数与 `retryAt` 归零。失败态在 `stop()` 之后**不被降级**为 `stopped`，因此 `/status` 里 detail 与重试时间一直可见。

**验收（真进程，`tenant-supervisor.expected.e2e.ts` 第二个场景）**：

| # | 断言 | 结果 |
|---|---|---|
| 1 | `--max-tenants 1` 在 `/status` 报告 `maxTenants: 1`、`alive: 0` | ✅ |
| 2 | 再跳转一个账户 → hub 日志出现 reclaiming，`alive` 仍为 1，前一个变为 `stopped` 而后一个 `running` | ✅ |
| 3 | 反方向再跳转一次 → 上限依然成立（回收新的那个） | ✅ |
| 4 | `--profile no-such-tenant-profile --restart-backoff-ms 60000`：首次跳转 503，`/status` 报 `failed / starts=1 / consecutiveFailures=1` 且有未来的 `retryAt` | ✅ |
| 5 | 退避窗口内第二次跳转仍 503，且 `starts` 保持 1（**没有真的再拉起一个进程**） | ✅ |

另有 [tenants-roster.spec.ts](../apps/cli/tests/tenants-roster.spec.ts) 7 例（规范化与四类拒绝、改密递增代数、保留/清除目录、名册列表与退出码）与 [accounts.spec.ts](../packages/identity/accounts-local/tests/accounts.spec.ts) 新增 2 例（`setPassword` / `remove` 的持久化与兄弟记录不受影响）。真 CLI 手测：`add → passwd → accounts → remove → accounts` 五步输出与磁盘布局均符合预期。

## 12. P3 执行记录：单源反代（2026-10-11）

### 12.1 为什么必须是 cookie 路由，而不是路径前缀

先读了传输面才定的形态，三条实测事实决定了设计（都不是推测）：

| 事实 | 依据 | 后果 |
|---|---|---|
| 启动令牌交换只发生在 `GET <入口路径>?token=…` 上，换来的设备 cookie 载荷里带 **authority** | [browser-auth.ts:297-310](../packages/client/connection/src/browser-auth.ts#L297-L310) | 运行时必须看见**它自己的** authority，所以 hop 要把 `Host` 改写成租户的 `host:port` |
| `/api` 是绝对路径前缀，mux 升级是绝对路径 `/api/remote.mux` | [api-path.ts](../packages/client/connection/src/api-path.ts)、[webserver/src/index.ts:390](../packages/host/webserver/src/index.ts#L390)、e2e harness 的 WS 用法 | **路径前缀反代不成立**：前缀之外的绝对路径无法归属租户，只有 cookie 能 |
| `/api` 的围栏要求 `Origin` 与 `Host` 同 authority（存在 Origin 时） | [api-request-trust.ts:137-155](../packages/client/connection/src/api-request-trust.ts#L137-L155) | hop 必须重写 `Origin`；重写前由 hub 自己先判「Origin 是否指向本 hub」，否则等于替恶意页面开口 |

因此 `--single-origin` 的形态是：**hub 一个 origin + 跳转时种下的路由 cookie**（`qilin_tenant=<accountId>`，`Path=/; HttpOnly; SameSite=Lax`）。`/t/<用户名>` 是入口（转发运行时的启动 URL，含令牌，并附加路由 cookie），此后**任意路径**（`/workspace`、`/api/*`、`/api/remote.mux`、媒体流）都按该 cookie 路由。

hub 仍然**不做访问判定**：路由 cookie 只是选择器，伪造它只会到达一个不认可调用者的运行时（账号门照旧）。

### 12.2 交付形态

| 件 | 内容 |
|---|---|
| [tenant-proxy.ts](../apps/cli/src/tenant-proxy.ts) | hop 原语：`hubAcceptsOrigin`（Origin/`sec-fetch-site` 围栏，在转发的操作里执行）、`forwardedHeaders`（丢连接级头、改写 `Host`/`Origin`）、`proxyRequest`（流式转发，任何方法）、`relayAnswer`（原样回写状态/头/体）、`relayUpgrade`（TCP 直管道，不拆帧，并补回被丢掉的 `connection: Upgrade`/`upgrade: websocket`） |
| [tenants.ts](../apps/cli/src/tenants.ts) | 路由 cookie 的种/清、按 cookie 解析运行时（必要时拉起）、`/t/<用户>/…` 深层路径去前缀转发、`server.on('upgrade')` 管道、`/status` 增 `mode` |
| [tenant-runtime.ts](../apps/cli/src/tenant-runtime.ts) | `proxyTarget()`：origin + 入口路径（含令牌），令牌只留在 hub 内，从不出现在浏览器 URL 里 |
| 空闲回收 | 单源模式下每个被代理的请求与升级都会 touch `lastUsedAt`，因此回收口径变成**真实流量** |

### 12.3 验收（全部实跑）

**[tenant-proxy.spec.ts](../apps/cli/tests/tenant-proxy.spec.ts)（7 例，对桩上游）**：Range 转发 + 206 + `content-range` 与体原样；`Host`/`Origin` 改写、连接级头（`connection`/`proxy-authorization`/`transfer-encoding`）不跨；外来 Origin 与 `sec-fetch-site: cross-site` 在**上游看到请求之前**被 403（桩记录 0 次请求）；`Location`/双 `Set-Cookie` 原样；上游未监听时转发失败；`relayAnswer` 流式回写且不回传连接级头；升级管道双向连通且上游看到请求行与头。

**[tenant-supervisor.expected.e2e.ts](../apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts) 第三个场景（真引擎 + 真进程）**：

| # | 断言 | 实测 |
|---|---|---|
| 1 | `/status` 报 `mode: single-origin`；跳转停在 hub origin：303 且 `Location: /workspace`，并带上 `qilin_tenant=<alice id>` | ✅ |
| 2 | **绝对路径** `/workspace` 仅凭路由 cookie 就取到应用文档（200 `text/html`、含 `<html`） | ✅ |
| 3 | `POST /api/auth/login` 带 `Origin: <hub>` 穿过 hub 得到 200，且运行时种的账号会话 cookie 一并回到浏览器 | ✅ |
| 4 | 同一 POST 换成 `Origin: http://evil.invalid` → **403**，且体是 hub 自己的拒绝文案 | ✅ |
| 5 | Remote（`session/list`，POST `/api/...`）穿过 hub 成功 | ✅ |
| 6 | **mux 升级**穿过 hub：`$events` 流拿到 `ready` 帧（证明帧管道，不是 101 假象） | ✅ |
| 7 | **按真实流量回收**：窗口（4 s）内每 1.2 s 一次请求使运行时保持 `running`，请求停止后被回收为 `stopped` | ✅ |
| 8 | 登录后应用文档里脚本/样式/清单的 **相对路径按文档 URL 解析后**穿过 hub 全部 200，且都不是 hub 自己的 HTML | ✅ |
| 9 | **同一个 `/` 按选择分流**：带路由 cookie 得到运行时的落地页（不含 `qilin tenants`），不带 cookie 得到 hub 目录 | ✅ |
| 10 | **路由 cookie 只是选择器**：把已登录的 alice cookie 配上命名 bob 的 `qilin_tenant` 去请求 `/api/session/list`，得到 bob 运行时自己账号门的 **401**（它不认自己没有签发的会话） | ✅ |
| 11 | **真实媒体路由的 Range 分流**：`GET /sidebar/media?sessionId=…&path=…` 带 `Range: bytes=5-14` 穿过 hub 得到 **206 + `content-range: bytes 5-14/40` + `accept-ranges: bytes` + 恰好那 10 个字节**；不带 Range 的同一条 URL 得到 200 与全部 40 字节 | ✅ |

媒体流的 Range 现在有一条**真实路由**的端到端断言（上面第 10 条），单元用例（对桩上游）仍保留，两条各自证明一层。

**真浏览器走查（Playwright 无头 Chromium，同一 hub、同一树）**：`/t/alice` → 运行时落地页（标题 `QiLin`）→ 点「进入控制台」→ `/login?next=%2Fworkspace` → 登录 → `/workspace` 渲染出**应用外壳（25 个 `[data-slot]` 节点；页面显示 `3.1.4-rc.2`、New Session、Workspaces、账户 `alice`）**，并且**控制台 0 错误、页面 0 异常、0 个 4xx/5xx 响应**——文档、全部脚本/样式资源、登录 API 与页面内请求都走通了同一条 hop。

这次走查抓到两个**进程级 e2e 抓不到**的真缺陷，都已修并补了回归断言：

| 缺陷 | 现象 | 修法 |
|---|---|---|
| hub 的 `/` 目录**遮蔽**了租户的 `/` | 账号门把未登录浏览器重定向到运行时的落地页（绝对路径 `/`），而 hub 在 `/` 上答自己的目录页 → **登录面不可达**，浏览器停在一张只列账户名的 hub 页面 | 路由顺序改为：带路由 cookie 的请求**先代理**（含 `/`），没有 cookie 时才落到 hub 目录 |
| `--idle-ms 0` **每 250 ms 回收全部运行时** | 文档写「0 表示不回收」，而代码 `sweep = max(250, …)` 且逐台判 `now - lastUsedAt < 0`（恒假）→ 全部被回收，浏览器拿到 503 | 窗口 ≤ 0 时**不安装 sweep**，而不是装一个每 250 ms 清场的定时器 |

第 2 条同时解释了为什么单源模式的浏览器走查必须做：进程级 e2e 用的是 4 s 窗口，这条路径在它之下永远不会被触发。

**录制**（按仓库 `record-browser-gif` 技能）：真实引擎（`qilin tenants serve --single-origin --idle-ms 0`，共享 home 下一个账户）、真实无头 Chromium（仓库自带的 Playwright 依赖）、单一 storyboard（跳转 → 落地页 → 登录 → 应用外壳）、1440×900 与录制尺寸一致，12.52 s 源片 → 1.5× → 1000×626 / 1.3 MB。产物在 `.playwright-mcp/tenant-single-origin/`（`demo.gif`、`demo.webm`、`final.png`）。**未跑模型轮次**（演示的是登录与外壳渲染，不是一次对话）；录制时服务该片的提交是 `0b966fd8ff`。

### 12.4 已知让步（P3 版）

1. **一个浏览器同时只服务一个租户**：路由 cookie 是浏览器级的。默认跳转模式仍可同时开多个租户（各自端口、各自 cookie 名），需要多租户并排时用它。
2. **租户端口仍可达**：单源模式只是给浏览器一条不暴露端口的路径，不关闭运行时自己的监听（它们只绑 127.0.0.1，且仍要过账号门）。真要收掉监听面，得让运行时只绑 hub 可用的通道，那是独立一件事。
3. **Cookie 名仍是 authority 绑定的**：因为 `Host` 被改写成租户 authority，浏览器里同一个 host 下会并存多个租户的 cookie（名字不同，天然不互相验证）。这是刻意的，不是缺陷。
4. **GIF 的适用范围**：真浏览器走查已在 12.3 完成（附截图）；按仓库 `record-browser-gif` 技能录制的 GIF 只演示这条部署路径，用真实引擎与真实浏览器，但**不跑模型轮次**（录制的是登录与外壳渲染）。

## 13. 验收矩阵（2026-10-11 收口）

目标五项逐项的落点、证据与状态。每条证据都在本机实跑过，命令与数字见对应小节。

| # | 目标项 | 落点 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 收掉两条过期 expected 车道 | `startup-url.ts`（按 URL 而非产品名匹配就绪行）＋ 显式挂载 `schedule-bundle`；`web-default-isolation` 改为断言 shipped 组合不含 schedule 三行 | 8 个车道（67 例）从 **44 红 → 62 通过 / 5 红**；§11.6 逐条复验后已收掉 3 例（`web-best-effort-startup` ×2、`creator-plugin-manager` ×1），只剩 `web-failure-matrix` 2 例待产品契约裁定 | 已完成 |
| 2 | A1/A2 引擎侧最小改动 | 无代码改动；结论与代码依据见 §11.7 与 Agent Note 的 `## Engine changes` | 上传索引按 `sha256(baseURL + credentials)` 分命名空间；`RemoteHostFacts.home` 是「文件所在机器」的属性 | **已裁决（2026-10-11 用户拍板：按判定）**：不加这两个 Config 字段，理由见 §11.7 |
| 3 | tenants 运维面 | `tenants-roster.ts`（accounts/add/passwd/remove）、`AccountStore.setPassword/remove`、`--max-tenants`、`--restart-backoff-ms` | e2e 场景 2 的 5 条断言＋`tenants-roster.spec` 7 例＋`accounts.spec` 新增 2 例；真 CLI 五步手测 | 已完成 |
| 4 | P3 单源反代与真实流量回收 | `tenant-proxy.ts`（hop 原语）、`tenants.ts`（cookie 路由、upgrade 管道）、`tenant-runtime.ts`（`proxyTarget`） | e2e 场景 3 的 11 条断言＋7 例桩上游 spec＋真浏览器走查（0 错误 / 0 异常 / 0 个 4xx-5xx，25 个 `[data-slot]`）＋GIF | 已完成 |
| 5 | 门禁、文档与验收齐备 | 本计划、`implemented/architecture/2026-10-11-multi-user-tenancy`（三件套）、`apps/cli/README`（双语）、`docs/user/guide/tenancy`（双语，已发布到文档站） | §14 门禁对账 | 文档齐备；「全部绿」受既有红限制，见 §14 |

## 14. 门禁对账（2026-10-11 收口）

**本工作触及的门禁（全绿，均为 2026-10-11 实跑）**：`tsc -b tsconfig.host.json` exit 0；`apps/cli/tests` ＋ `packages/identity/accounts-local/tests` 182 passed / 4 skipped；`tenant-supervisor.expected.e2e.ts` 4/4；`tenant-isolation.expected.e2e.ts` 1/1；`oxlint` 0/0；`verify-export-jsdoc`；`verify-package-dependencies`（78 包）；`verify-type-equiv`（466 块）；`verify-agent-note-format`（497 篇）与 `verify-agent-note-classification`（497 篇）；`verify-doc-budgets`（8 篇）；`verify-md-links`（2187 文件）；`verify-translation-pairing`（本工作改动的配对逐对一致）；文档站构建（`npx tsx website/build.ts`，14.9 s，新页与原始 Markdown 孪生页均产出）。

**不属本次改动面、未修的既有红（逐条留证，2026-10-11 用各门禁自己的命令实跑）**：

- `tsx scripts/check-workspace-constraints.ts`（即 `pnpm run constraints`）：`packages/client/ui-workbench: expected a package here (no package.json found)`。该目录**未被 git 跟踪**（`git ls-files` 为空），内容只有 `lib/` 与 `node_modules/`，是已删除包的构建残留；是否删除属本机清理，不由本工作决定。
- `tsx scripts/rescope-vendor.ts --check`（即 `rescope-vendor:check`）：**2 个文件**（`scripts/verify-preset-copy.ts` 与其 spec）仍带 rescope 前的名字 token；两者自提交 `364e6f1383` 起未再改动，也未被本工作触碰。
- `tsx scripts/verify-no-unknown-casts.ts`：**5 个文件**（`apps/web/tests/first-run-metric.e2e.ts` 两处，`packages/session/session-format-v3-to-v4/tests/{attribution,developer-relationships}.spec.ts`，`packages/session/session-format-v4-to-v5/tests/migration.spec.ts`），均未被本工作触碰。
- `verify-translation-pairing` 语料级噪声集中在被忽略的 `desktop/staging/**` 与 `docs/tool-catalog.i18n.yaml`。
- 全量单测车道 280 例红分布在 12 个文件，**没有一个**在本工作改动的两个包（`apps/cli`、`packages/identity/accounts-local`）内；可直接看到失败点的两例也无关（`scripts/doc-standard.spec.ts` 红在 `packages/session/session-format-v4-to-v5/README.md` 的 kind 期望，`scripts/persistence-developer.spec.ts` 红在 `encodeCurrent requires Session format v5`）。我没有为这 280 例建立改动前基线，归属判断依据是「交集为空 ＋ 失败点与改动面无交集」，不是逐例复现。
- 收口时发现并修掉的一处**自己造成的**违例：`apps/cli/tests/tenant-proxy.spec.ts` 用 `as unknown as ServerResponse` 伪造响应对象，命中 `verify-no-unknown-casts`；已改为驱动一个**真实** HTTP 响应（同一 `writeHead` ＋ pipe 路径），断言浏览器实际收到什么，而不是把违例记进既有红。

## 15. 收官状态（2026-10-11，第 12 轮）

### 15.1 已交付（本仓提交，均本地未推送）

| 提交 | 内容 |
|---|---|
| `55fe444407` | 多租户边界提案与计划落仓（Agent Note 三件套 + 本计划） |
| `3075a17b24` | P1：一个共享 home + 两份租户覆盖层 + 两个运行时的六条判据（常备测试） |
| `15a17314f8` | `accounts-local` 的接纳名单（一份部署只接纳列名账户） |
| `be637a866a` | P2：`qilin tenants serve`（账号→租户、按需拉起、就绪解析、303、空闲回收） |
| `8d6cf0903f` | 两条过期 expected 车道收口（就绪行按 URL 匹配；schedule 显式挂载） |
| `2b7746a01d` `f5eecd1695` | 运维面：`tenants accounts/add/passwd/remove`、`--max-tenants`、`--restart-backoff-ms` |
| `dbe341c378` | P3：单源反代（路由 cookie、authority 改写、Origin 围栏、upgrade 管道、媒体 Range） |
| `0b966fd8ff` | 浏览器走查抓到的两个缺陷：hub 目录遮蔽租户根、`--idle-ms 0` 反而不停回收 |
| `bd56d1c06f` | 浏览器走查与 GIF 证据入册 |
| `4a9c5bb668` | 真实媒体路由的分段读取穿过 hub（206 + `content-range`） |
| `c4ecd64fc2` | Agent Note 从 proposed 转 implemented（按 implemented 骨架重写） |
| `760cb25844` | 单源模式下 hub 自有的两条路径（`/healthz`、`/status`）写入 README |
| `f267fd88c7` | 用户指南（双语）并发布到文档站 |
| `c95210a566` | 路由 cookie 只是选择器：把甲账户的会话指向乙账户运行时得到 401 |
| `d73ecb55b9` `9f11a1f7b0` | 计划 §13 验收矩阵、§14 门禁对账 |
| `135d47bcaa` | 修掉自己造成的一处 `as unknown as` 违例（改为真实响应） |
| `b60a47917b` | `web-best-effort-startup` 收口（断言点名实际失败的模块） |
| `8cf1105eeb` | `creator-plugin-manager` 收口（fixture 经 `run_code` 分派） |
| `241c8e34b2` | 计划状态同步 |

### 15.2 本轮最终验证（2026-10-11，全部实跑）

`tsc -b tsconfig.host.json` exit 0；`apps/cli/tests` ＋ `packages/identity/accounts-local/tests` **182 passed / 4 skipped**；`tenant-supervisor.expected.e2e.ts` **4/4**、`tenant-isolation.expected.e2e.ts` **1/1**；`oxlint` 0/0；`verify-agent-note-format` 497；`verify-md-links` 2187；`verify-doc-budgets` 8；本工作改动的 6 个双语对逐对一致；文档站构建（第 8 轮）14.9 s 通过。

### 15.3 两项待裁定（各配一句可执行的补丁方案）

| # | 事项 | 现状 | 说一句话即可执行 |
|---|---|---|---|
| 1 | A1/A2 引擎侧 Config | 无代码改动；代码依据见 §11.7 与 Agent Note 的 `## Engine changes`：上传索引的命名空间就是 provider 凭据（共享同一把 key 时按租户拆路径只会重复上传），`RemoteHostFacts.home` 是「文件所在机器」的属性（所有租户同机） | 用户已拍板「按判定」：不加。此行的结论（引擎改动为零）保留为决策记录 |
| 2 | 被拒的 reload 是否回滚 | `reconcileProfilePatches` 先应用补丁再判「是否引入新的未激活项」，因此被拒的 reload 在树上已生效；`web-failure-matrix` 的 2 条恢复断言因此红 | 用户已拍板「回滚」，但**尚未落地**：两种实现都在 `packages/boot/{app-boot,hmr,plugin-manager}` 的既有测试上留下无法解释的副作用，见 §15.4 |

### 15.4 reload 回滚：两次实现尝试与实测副作用（2026-10-11）

用户拍板「回滚」。我实现了两版，跑同一组门（`packages/boot/{app-boot,hmr,plugin-manager}` 的 930 例），两版都在**既有测试**上留下副作用，因此**均已回退**，工作树回到干净状态。

**基线（改动前）**：38 文件 / **930 pass / 0 fail**。

| 实现 | 规则 | 结果 | 无法接受的副作用 |
|---|---|---|---|
| V1 全量回滚 | 任何被拒的 generation 都恢复上一份 `patches` | **7 红** | ① `manager`：`removeBundle` 由 `applied` 变 `failed`（移除 bundle 会被拒并撤销）；② `manager`：启用 bundle 后其行不再有 live entry；③ `profile.spec`：一次与故障无关的编辑不再落地 |
| V2 仅启动必需行回滚 | 只在 `webserver`/`modules`/`connection` 等 `requiredStartupEntryIds` 破时恢复 | **3 红**（1 红是我预期的契约变更：hmr 里 `webserver` 那条的最佳努力语义改变；另 1 红仍是 `manager` 的 `removeBundle` → `failed`） | 移除 bundle 的流程仍被牵连，而这次被拒的原因我**没有查到**，不能凭猜改产品 |

**难点（写清楚，不是找借口）**：`reconcileProfilePatches` 目前是「**最佳努力**」语义——被拒的 generation **照样生效**，只是把拒绝报出去。仓库里有多条测试在**依赖**这个语义：移除 bundle、启用 bundle、与故障无关的 profile 编辑。真正需要回滚的只是「**启动必需行被打破后无法恢复**」这一种（`web-failure-matrix` 那两条断言的场景）。要把两者分开，需要把「拒绝」拆成两类（可继续服务的最佳努力拒绝 vs 必须回到上一版可用组合的致命拒绝），并明确谁算致命——这是产品契约决定，不是实现细节。

**两条可选路径（等你选）**：

1. **拆拒绝语义**：在 `reconcileProfilePatches` 里引入「致命」判据（例如只有启动必需行 + bootstrap include 算致命），并把 `manager` 的 `removeBundle` 为何被牵连先查清（很可能与它传入的 `requiredIds`＝启用目标有关，而那是 caller 语义，不该触发回滚）；随后按新契约更新 hmr 里 `webserver` 那条参数化用例。
2. **不动 reload，改测试**：接受「被拒 generation 保持生效」的现状，把 `web-failure-matrix` 两条断言改成它实际能表达的语义（拒绝被报告、运行时保持存活），并在 §11.6 记明「恢复需人工修好配置后再触发一次」。

## 16. reload 回滚：本轮实测与结论（2026-10-11，第 13 轮）

用户裁定「拆拒绝语义」。按此实现了一版，**在单元车道全绿、在真实 Web 车道上留下了 11 处失败，且失败的性质不是断言过期，所以我整版回退**（工作树回到 `b7ef849ed3`）。账目如下。

### 16.1 实现了什么

`reconcileProfilePatches` 的第四个参数从裸 `requiredIds: readonly string[]` 改为 `options: { requiredIds?, rollbackOnRejection? }`——原先那个位置参数同时承担「compose 的目标行」和「调用方的必需行」两种语义，正是它在早先实验中让 `removeBundle` 被牵连。语义按调用方拆开：

| 调用方 | 语义 | 理由 |
|---|---|---|
`plugin-manager.reload()`（安装/移除/启用/停用 bundle） | 保持 best effort：拒绝只上报，generation 落地 | 这是**刻意的组合变更**：移除必须真的移除（早先全量回滚实验里它变成 `failed` 并撤销，等于插件卸不掉） |
`hmr` 的配置监听（`cordis.patch.yml` 变更） | `rollbackOnRejection: true` | 这是**编辑中的配置**：被拒的 generation 留在树上，正是让「随后的修正」拿一份已经失败的组合去评审的原因 |

「致命」判据试了两版：(a) 静态必需行集合 `requiredStartupEntryIds`（`agent-loop`/`webserver`/`modules`/`connection`/`headless-runner`/`acp`/`sdk-jsonrpc-server`）+ bootstrap include；(b) 「上一代**在服务**的行这一代变成未激活」+ bootstrap include。两版的判定结果在同一组测试上一致。

### 16.2 实测

| 车道 | 结果 |
|---|---|
`packages/boot/{app-boot,hmr,plugin-manager}` | **38 文件 / 930 例全绿**——改动在单元层是安全的，`plugin-manager` 的移除/启用用例全部不受影响（证明「按调用方拆」这一步是对的） |
`apps/cli/.../web-failure-matrix.expected.e2e.ts` | **11 红**（改动前 2 红）：`required native HMR {import,module evaluation,schema,config expression,disabled expression,sync apply,async apply,dependency} keeps siblings and recovers` 8 条，加 `native HMR reports a required Web server bind failure…` |

关键证据（`required native HMR sync apply` 单跑）：事件序列为 `witness apply 0 / witness dispose 0 / witness apply 1 / witness dispose 1 / witness apply 0`——**回滚本身成功了**（坏的 generation 被撤销、上一代被重新拉起），但**随后的修正从未落地**（没有 `witness apply 2`）。也就是说：把回滚放进 `reconcileProfilePatches` 之后，HMR 监听的 generation/去重记账（`lastInputs`）与「回滚又写了一次 `entry.update`」这件事对不上，后续文件变更不再产生新 generation。

`native HMR reports a required Web server bind failure…` 的两条断言按预期反向：回滚后运行时**没有**丢掉服务器，所以 `witness dispose 1` 会出现、`serverUrl` 仍存在。这条是**契约变更**（用户要的正是它），但必须连同上面 8 条一起、按新契约重写，而不是只改这一条。

### 16.3 为什么不硬收

两版判据都改变 8 条既有断言的契约（它们现在明确规定：HMR 期间一行失败时**兄弟行保留、失败 generation 保留、修正后恢复**）。把它们改成「坏 generation 被回滚」是**改产品契约**，不是修断言——可以改，但必须连同下面两件事一起做，否则就是把测试掰弯去迁就实现：

1. **先有回滚路径的单元级验证台**：现在只有真实 Web 进程能观察回滚，反馈周期 1–3 分钟/次，且被 `lastInputs` 去重掩盖。需要先用现成的 `boot()` + `reconcileProfilePatches` 夹具把「回滚 → 修正 → 落地」这条链钉在毫秒级，再动 e2e。
2. **明确新契约的措辞**：`某一行在新 generation 里无法激活` 时，究竟回滚整份编辑，还是只回滚该行？8 条断言里的 `required` 指的是**行 id 属于静态必需集合**，与「浏览器此刻是否还能被服务」并不等价（`acp` 在 web profile 里被插入失败时，应用一直正常服务）。

### 16.4 结论

用户选的「拆拒绝语义」在**调用方维度**是成功的（manager 保持 best effort，930/930 为证）；在**同一调用方内部区分致命/非致命**这一步，卡在回滚与 HMR 记账的相互作用上，需要先补单元级验证台再落。代码面无遗留改动。
