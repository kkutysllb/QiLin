# Agent Note: 多用户租户边界

Status: implemented

[English](2026-10-11-multi-user-tenancy.md) | 中文

## Problem

账号面发布时是一个门禁，不是边界：它自己的模块文档写明账号「gate access to one harness home」，且「a second account reaches the same Sessions, credentials, and files as the first」；包 README 也告诉运维，分开的人需要分开的 `QILIN_HOME` 与端口。现在产品要的恰好相反一半、相同一半：**会话与任务按用户隔离，而插件、模型设置与凭据在同一部署内共享。** 当前请求路径里没有任何地方携带「谁在请求」。Host/Origin 栅栏与鉴权只决定请求能否通过，通过之后一律以唯一的 operator Peer 准入（`admit()` 返回 `{ peer: this.operator }`），因此业务服务在原理上就分辨不出两个账号。

## Decision

把**一个引擎运行时作为租户单位**，并让账户的 harness home 成为隔离的单位：每个运行时以 `QILIN_HOME` 指向 `$QILIN_HOME/tenants/<账户 id>/` 运行，因此每个按 home 解析的根——`profiles/`、`settings.yaml`、`.credentials.yaml`、MCP 行、技能、预设、会话、任务、工作区与附件——都归该账户，而账户名册留在部署 home 里。一个新的守护进程——会服务浏览器的 profile（`qilin` 或 `qilin web`）所启动的入口——拥有「账号 → 租户」映射，并为每个账户运行一个引擎子进程，同时为它生成一份指名共享名册、只接纳该账户的 home 层。完整的证据清单与阶段划分见[多租户计划](../../../../plans/2026-10-11-multi-user-tenancy.md)；交付面是 `apps/cli/src/web-entry.ts`（部署入口）、`tenants.ts`（入口自有读取、登录表单与路由跳变）、`tenant-runtime.ts`（一个子进程与它的 home）、`tenants-roster.ts`（账户生命周期命令）与 `tenant-proxy.ts`（转发），其中 `accounts-local` 的 `admittedAccounts` 是每个运行时执行的接纳名单。

### 决定隔离的根

四个已校验的 Config 字段覆盖了不可共享的全部状态，因为每一个可隔离的存储都已经经由单一入口解析：

| 根 | 今天的默认值 | 按租户 |
|---|---|---|
| `session-persistence-jsonl.root` | `qilinHomePath('sessions')` | 该租户的会话目录 |
| `storage-json.root` | `qilinHomePath('storages')` | 该租户的存储根——一个字段承载 `workspace`、`schedule`、`session_projcache` 三个域 |
| `session-query-sqlite.path` | `:memory:` 且 `openAt: never` | 该租户的派生索引 |
| `attachment-local.qilinHome` | harness 主目录 | 该租户的附件根 |

真正让这件事可行的正是唯一的 `storage-json` 根：工作区状态（连其中的 archived 与 pinned 会话 id 列表）、主机级 Schedule 任务、投影缓存都经 `ctx.storageDomain` 打开，因此一行就搬走了三个域。

### 保持共享的部分

账户名册（`$QILIN_HOME/auth/accounts.json`）是唯一共享的状态。其余每个根都在账户自己的 harness home（`$QILIN_HOME/tenants/<账户 id>/`）内解析——模型设置、凭据、已装插件及其 profile、插件管理器、MCP 行、技能、预设、会话、任务、工作区与附件——因此隔离就是 home 本身，而不是架在共享树上的一层覆盖。本笔记最初描述的部署级共享根，只在运行时按覆盖层搬动单个根的阶段存在；该阶段在入口交付前已被替换。

### 守护进程

整套部署就是一条命令——会服务浏览器的 profile 本身，`qilin` 或 `qilin web`：入口在自己的地址上显示登录表单，按需为每个账户启动一个运行时，并转发字节。它不做访问判定。一次登录提交由被指名账户自己的运行时校验——入口把凭据转发到那里，中继它签发的会话 cookie，并加上分派后续每个请求的路由 cookie——因为应用文档、它的 `/api` 通道、它的 mux 升级与它的媒体请求都是页面 origin 上的绝对路径，只有 cookie 能把它们归属到某个账户。转发是传输工作：入口重写携带 authority 的头（把租户写进 `Host`，并在先校验浏览器 `Origin` 指向本入口之后把它一并重写）、原样转发 `Range`、`Set-Cookie` 与分段答案，并按字节管道转接 mux 套接字而不拆帧。判定落在做决定的操作里：每个子进程在自己的 origin 上保留账号门，且只接纳归属于该租户的账号，因此伪造的路由 cookie 只会到达一个不认可调用者的运行时。运行时只绑 loopback，因此浏览器需要的地址只有入口那一个，而同一个浏览器一次只服务一个账户。入口不需要新的引擎 RPC：Web 应用已经把启动 URL 行声明为守护进程契约——「supervisors RPC as soon as they observe the line」——启动器也已接受 `--profile` 与 `--patch` 覆盖层，其中 `--patch` 在 bundle 层与租户 home 层之后应用。桌面壳在做同一形态里「拉起」的那一半（拉起子进程、消费其 `ready{url, injections}` 消息）；它的反代正是本入口所交付路由的先例。入口也给自己定界：`--max-tenants` 在越过上限时先回收最久未使用的运行时，启动失败的运行时按倍增的等待重试而不是每次访问都重试，而名册命令（`qilin tenants accounts`、`add`、`passwd`、`remove`）是共享账户文件之上的运维面——因为一个运行时只接纳一个账户并关闭注册。

### 引擎改动

没有。两处理论上的候选是拿代码核掉的，不是实现的。DeepSeek 上传索引的每条记录以 `sha256(baseURL + credentials)` 为键，命名空间就是 provider 凭据——本部署按设计共享同一把——按租户拆路径只会把同一个附件重复上传一遍。`RemoteHostFacts.home` 的唯一用途是把引用路径缩短到「文件所在的那台机器」，而所有租户都在同一台机器上；租户身份由账号面回答，且一个运行时只服务一个账号。因此本方案最初假定的引擎改动为零：这个功能就是守护进程、它的账号接纳名单与覆盖层生成器。

## Alternatives considered

**单进程租户平面。** 给每个账号一个 Peer，从 peer 上下文解析服务，并把会话、存储、查询、投影、jobs、workspace、Schedule、附件与终端服务挂在按租户的 `ctx.isolate` 标签下，只在根上留下共享服务。这才是让「一个引擎、多租户」成立的架构，此处是在一期拒绝而非原则上拒绝：它需要按请求的服务平面、把 Typert lookups 与 host contexts 移入各租户平面、按 peer 裁剪事件转发、全局唯一的会话 id（store 的 `session-<n>` 计数器会跨平面撞号），并要求每个后台执行者——Schedule 触发器、webhook、goal 轮次、子代理——显式携带租户。每一处漏掉都是静默的跨租户泄漏，因此这份成本换来同样的隔离，但改动面大得多。

**在会话头加 `owner` 字段，并在每个端点做归属校验。** 这要动不可变存储元数据字段，进而动会话格式版本与其发布期迁移规则，然后要求在每一个可达入口加校验：二十多个 Remote 端点，外加 Schedule、webhook 与子代理路径。三者之中它换来最弱的隔离（同进程、同缓存、同事件转发），却付出最大的改动面。

**保留账号作为门禁，要求每人各用一份 harness 主目录、由运维手工配置。** 这正是账号 Agent Note 记录的当前部署规则。它有隔离，但丢掉了需求里共享的那一半——每个人都要重装同一批插件、重配同一批模型——并且把「账号到主目录」的映射留在运维口耳相传里，而不是产品面。

**每个租户一个 OS 用户或容器。** 不拒绝，只是排序在后。它才是让租户之间互不信任的那一层，并且叠加在按租户运行时之上。本决策不做它，它定义的边界是协作，不是互不信任。

## Testing

两条 owner-local 进程测试（跑构建产物）锁定边界，另有一条对桩上游的用例锁定传输事实。

[tenant-isolation.expected.e2e.ts](../../../../apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts) 跑一个共享 home、两份租户覆盖层与两个运行时：彼此的会话都不出现在对方的列表里，Schedule 任务跟着创建它的那个租户，工作区状态各自独立，共享的设置与插件对两者都生效，一个租户的客户端收不到另一个租户转发的事件，而命名另一个租户会话 id 的请求被拒绝。

[tenant-supervisor.expected.e2e.ts](../../../../apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts) 跑整套部署：空闲运行时被回收、其数据在第二次登录后仍在，`--max-tenants` 回收最久未使用的运行时，无法启动的运行时会报告失败并给出重试时间、且在该等待内不会被重新拉起，零空闲窗口什么也不回收，并且——在同一地址上——登录表单与它对错误密码的拒绝、登录后的文档及其资源、外来 `Origin` 的拒绝、一次 Remote 调用、mux 升级、真实媒体路由的分段读取、按流量的回收与根选择全部穿过入口。

[tenant-proxy.spec.ts](../../../../apps/cli/tests/tenant-proxy.spec.ts) 对桩上游覆盖这条 hop：Range 与分段答案、authority 改写与连接级头的剥离、在任何上游请求之前执行的 Origin 围栏、cookie 与重定向、以及升级后的管道。

## Consequences

**换来的：** 会话、任务、工作区与附件归一个账户，而插件、模型设置、凭据、MCP 行、技能与预设仍是同一份部署，因此第二个账户不需要任何重新配置。

**文件系统不是边界。** 所有租户都以同一个 OS 用户运行，因此 agent 的 shell 与文件工具可以读取其他租户的目录和共享的凭据文档。本决策让租户成为同一台机器上的协作方；必须抵御恶意租户的部署需要上面提到的按租户 OS 隔离，那不在范围内。

**单源模式下，一个浏览器同时只服务一个租户。** 路由 cookie 为一个浏览器命名一个租户，因此打开第二个账户的跳转会连第一个标签页的租户一起切换；默认的跳转模式才是一个浏览器可以同时持有多个租户的模式。该 cookie 只是选择器，不是凭据：伪造它的请求会到达一个不认可调用者的运行时。

**隔离依赖生成的覆盖层，而漏掉一行会静默失败。** 忘掉一行就共享一个根，且不报错；因此按租户的补丁必须在启动时断言（各租户解析出的根互不相同），并由隔离测试覆盖。

**共享模型凭据意味着共享开销。** 一把 provider key 服务所有租户，而没有任何东西按账号归集用量；遥测通道携带的是匿名安装 id。按租户的配额或计费是另一条缝，继续延后。

**共享插件 profile 变成共享写目标。** 多个运行时同时安装插件需要单写者规则，或加锁加变更广播。

**成本随租户数线性增长。** 每个租户是一个带独立内存与端口的 Node 运行时，这正是空闲回收与并发上限属于守护进程、而非优化项的原因。

**一次升级同时影响全部租户。** 这通常是目的所在，但它使升级手册成为部署级动作。
