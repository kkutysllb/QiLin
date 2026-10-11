---
description: "多用户（多租户）改造计划：账号→租户映射、会话/任务/工作区隔离，插件与模型配置共享。含证据盘点、租户覆盖层样例、验收清单与阶段划分，未改动产品代码。"
kind: "plan"
---

# 多用户架构改造计划（会话与任务隔离，插件与模型配置共享）

- 日期：2026-10-11
- 状态：**计划**，未改动产品代码
- 决策记录：[多用户租户边界](../.agents/notes/proposed/architecture/2026-10-11-multi-user-tenancy.md)
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

| | V1 每租户独立端口 | V2 单源反代（目标形态） |
|---|---|---|
| 做法 | 守护进程把浏览器 302 到 `127.0.0.1:<tenantPort>` | 浏览器只见守护进程一个 origin；转发时附引擎 cookie、剥离浏览器侧 cookie；WS 升级逐跳透传 |
| 隔离依据 | 每个运行时的 `accounts-local` 只接纳自己的账号（`admittedAccounts`），cookie 名绑定 `host:port` 天然不互通 | 引擎端口不出 loopback，租户不可直达 |
| 代价 | 每个租户要单独登录一次 | 需要自己维护反代与 WS |
| 适合 | 内网原型、开发 | 生产 |

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
| P3 | 守护进程 V2（单源反代 + WS + 媒体流，收掉租户端口暴露面） | 真浏览器走查 + 录 GIF（GUI 可见变更的仓库要求） |
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

新测试不依赖这两处（自带按输出匹配就绪 URL，并显式挂上 schedule bundle），所以它们不影响 P1 的结论；修不修是另一件事。

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

§4.1 写的是「hub 认证、反代、把 cookie 附到转发请求上」。P2 实际把边界放在**各租户运行时内部**：hub 不认证、不反代，只做目录与 303；登录由运行时的账号门完成，`admittedAccounts` 保证它只接纳本租户的账户。

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

1. 租户 id = 账号 id，1:1 且无注册表，因此没有"两个账户共用一个租户"或改名这一层运维面；`qilin tenants` 目前只有 `serve`。
2. 空闲窗口按**最后一次跳转**计：浏览器到达租户 origin 后直接与它通信，hub 看不到这份流量，所以长时间开着标签页的部署要把 `--idle-ms` 调大或设为 0。P3 的单源反代才能按真实流量判定。
3. 账户由共享 home 的普通 Web 表面创建（hub 不提供开户），租户覆盖层把 `registration` 关掉，因此某个运行时不能顺手造号。
4. §4.5 的四条让步仍然成立：同一 OS 用户、共享模型 key、插件共享写、成本随租户数线性增长。

### 11.5 仍未做

- A1（`llm-deepseek` 上传索引补 Config）与 A2（`RemoteHostFacts.home` 可注入）未做。
- 租户运行时的日志等级与轮转、并发上限、崩溃退避重启未做（当前只有按需拉起与空闲回收）。
- P3（单源反代 + WS + 媒体流）未开。
