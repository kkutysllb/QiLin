# 一个公共地址的多用户部署（实施计划）

本计划把"一个公共地址部署公用 agent、多个用户登录、不同账户不同运行时、运行时之间彻底隔离"落成可执行步骤，并给出你能自己复现的验收命令。本计划不改产品代码；批准后才动。

## 1. 需求（按你的口径）

1. **一个启动命令**。不做第二套入口命令；"租户"是内部状态，不是用户要敲的东西。
2. **一个公共地址**。浏览器只连这一个地址；每个账户的运行时只绑 `127.0.0.1`，外面进不来。
3. **多用户登录发生在这个地址上**。打开地址是登录表单，不是账户列表；登录成功后进入自己的工作区。
4. **不同账户不同运行时**。一个账户一个引擎进程。
5. **运行时之间彻底隔离**：会话、任务、工作区、附件、插件、模型配置、凭据，各自一份。
6. **唯一共享的是账户名册**（用户名 + 密码哈希），因为门要用它决定"你是谁、去哪个运行时"。
7. 删除我之前自己加出来的垃圾：`qilin tenants serve` 这条第二入口命令。

## 2. 验收标准（你复现这些命令即可判我对错）

```sh
cd ~/kk_Projects/QiLin
export QILIN_HOME=$(mktemp -d)/home QILIN_AGENTS_HOME=$(mktemp -d)
node apps/cli/lib/bin.js tenants add alice --password-stdin <<< 'alice-password'
node apps/cli/lib/bin.js tenants add bob   --password-stdin <<< 'bob-password'
node apps/cli/lib/bin.js web --port 0        # ← 唯一的启动命令
```

| # | 判据 | 期望 |
|---|---|---|
| A | 只有一条入口 | `qilin tenants serve` 不存在（退出码非 0）；上面的 `web` 起来 |
| B | 一个地址 | 上面那条命令打印一个地址；`lsof -iTCP -sTCP:LISTEN` 里只有它，运行时都在 127.0.0.1 |
| C | 地址上是登录 | `curl <addr>/` 返回含 `type="password"` 的表单，且**不含**账户列表链接 |
| D | 错误密码被拒 | 错密码 POST `/signin` → 200 且回到登录表单（无会话 cookie） |
| E | 正确密码进入 | POST `/signin` → 303 到 `/`，响应带该账户的运行时会话 cookie + `qilin_tenant` 路由 cookie |
| F | 不同账户不同运行时 | `$QILIN_HOME/tenants/<账户 id>/` 各一份；两个账户是两个进程 |
| G | 会话隔离 | alice 建会话后，bob 的 `session/list` 为空；bob 直接按 id 访问 alice 的会话被拒 |
| H | 插件/配置隔离 | 每个账户 home 下有各自的 `profiles/`；alice 写 `ui-theme.fontSize=16` 后 bob 读不到该值 |
| I | 共享面只有名册 | `$QILIN_HOME` 下只有 `auth/`（名册）与 `tenants/`；没有 `profiles/`、`settings.yaml`、`sessions/` |
| J | 自动化 | `npx vitest run apps/cli/tests` 全绿；两条租户 e2e（`tenant-isolation`、`tenant-supervisor`）全绿；文档门绿 |

我已用一段脚本跑过 C–I 中的一部分，当前实测结果（本轮原样输出）：

```
ENTRY: http://127.0.0.1:58737
front page has a password field: True
alice sign-in status 200 final url http://127.0.0.1:58737/
alice cookies: ['qilin-session-…', 'qilin_tenant']
bob   sign-in status 200 final url http://127.0.0.1:58737/
bob   cookies: ['qilin-session-…', 'qilin_tenant']
create ok: True
alice created: session-aef3d6b4-25b8-4708-ba47-8732c7cbfd88
alice sees: ['session-aef3d6b4-25b8-4708-ba47-8732c7cbfd88']
bob sees:   []
ISOLATED: True
deployment home: ['auth', 'tenants']
```

## 3. 现状：已经有什么、还缺什么

### 已经在仓里并验证过

| 部件 | 位置 | 证据 |
|---|---|---|
| 每账户独立 harness home 的运行时 | `apps/cli/src/tenant-runtime.ts`（子进程 `QILIN_HOME=tenants/<id>`） | `tenant-isolation.expected.e2e.ts` 1/1：会话/存储/设置/`profiles` 各在自己 home |
| 门：cookie 路由、`/t/<账户>` 交接、WS 升级管道、媒体 Range、空闲回收、并发上限、崩溃退避 | `apps/cli/src/tenants.ts`、`tenant-proxy.ts` | `tenant-supervisor.expected.e2e.ts` 4/4 |
| 账户名册与运维面 | `tenants-roster.ts`、`accounts-local` | `tenants-roster.spec.ts` 7/7、`accounts.spec.ts` 11/11 |
| **公共地址上的登录**、`qilin web` 单一入口 | `apps/cli/src/web-entry.ts`、`tenants.ts`（`/signin`） | §2 的实测输出 |

### 未提交（本工作树里）的改动

- 新增 `apps/cli/src/web-entry.ts`；`bin.ts` 把 `web` profile 交给它；
- `tenants.ts` 增加 `/signin` 处理与登录页；`tenant-runtime.ts` 增加租户标记；
- 删除 `qilin tenants serve`（`args.ts`、`bin.ts`）与随之无用的辅助函数；
- 测试：`tenant-web-process.ts`（每账户 home 的夹具）、`tenant-isolation.expected.e2e.ts`（隔离判据）、`tenant-supervisor.expected.e2e.ts`（改用 `web` 入口）。

### 已知缺口（本计划要收掉的）

| # | 缺口 | 影响 |
|---|---|---|
| 1 | `apps/cli/tests/args.spec.ts` 有一条断言写死了 `fromDefaultProfile: false`，实际是 `undefined` | 单测 1 红 |
| 2 | `tenant-supervisor` 车道已改成新入口，**尚未重跑** | 未验证 |
| 3 | 登录的错误密码、退出登录清 cookie、按账户 home 断言 `profiles/` 还没有 e2e 断言 | §2 的 D/H 未自动化 |
| 4 | `apps/cli/README{,.zh}.md`、`docs/user/guide/tenancy{,.zh}.md`、计划 §12/§15、Agent Note 仍在讲 `tenants serve` | 文档与实现不一致，文档门会红 |
| 5 | 共享根里已有的历史会话不归属任何账户 | 切到公共地址后，老会话在应用里看不到（数据仍在磁盘） |

## 4. 实施步骤（每步一个可验证的停点）

| 步 | 动作 | 停点（跑什么、看什么） |
|---|---|---|
| S1 | 修缺口 1 的断言：`args.spec.ts` 按真实返回值断言，并保留"没有第二条入口"的断言 | `npx vitest run apps/cli/tests/args.spec.ts` 37/37 |
| S2 | 重跑 `tenant-supervisor.expected.e2e.ts`（新入口），把 e2e 打出来的问题逐个修 | 4/4 绿 |
| S3 | 补 e2e 断言：错误密码被拒、登录后清 cookie、每账户 `profiles/` 与 `settings.yaml` 各一份 | `tenant-supervisor` 与 `tenant-isolation` 绿，且新断言能在人为破坏时变红（做一次负对照） |
| S4 | 入口可配置项落在一条命令上：`--host/--port/--idle-ms/--max-tenants/--restart-backoff-ms`，非法值 fail-loud | 单测断言非法值退出码非 0；e2e 用到这些开关 |
| S5 | 文档与计划同步（双语 README、用户指南、计划 §12/§15、Agent Note），删掉所有 `tenants serve` 的说法 | `doc-sync`、pairing、md-links、doc-budgets 绿 |
| S6 | 提交，产出可复现报告（§2 的命令与原始输出） | 工作树干净、报告附原始输出 |

**缺口 5（历史会话归属）**：本计划只把它写清楚——老会话留在部署根、任何账户都看不到，数据不丢。要不要"把某个账户认领既有会话"另开一小步，等你说；不做的话我不假装它被处理了。

## 5. 明确的边界（本计划不做，也不假装做了）

1. **文件系统**：所有运行时同属一个 OS 用户，A 的 agent 用 shell 理论上能读 B 的 home。真隔离需要独立系统用户或容器。
2. **一个浏览器同时开两个账户**：cookie 只能记一个。要同时开需给账户分配子域名（DNS + 证书）。
3. **公网防护**：TLS、反向代理、限流、配额由部署方承担；入口只提供 `--host/--port`。
4. **账户从哪来**：入口不发明政策。名册里已有"开放注册/关闭注册"配置，`qilin tenants add` 是管理员建户路径；两者都保留，具体取值是部署配置。
5. **不做**：把运行时暴露到公网（它们只绑 loopback）、把名册拆成多份。

## 6. 风险与回退

| 风险 | 处置 |
|---|---|
| 单一入口改动影响既有 web 车道（有 8 处直接起 `--profile web` 的测试/脚本） | 租户标记 `QILIN_TENANT=1` 是内部开关；受影响的车道逐个改并跑 |
| 登录把密码经过门一次 | 门只把凭据转给**该账户自己的运行时**校验，门本身不存会话、不比对哈希；运行时仍是唯一验密处 |
| 回退 | 全部改动集中在 `apps/cli/src` 与对应测试；`git revert` 该提交即回到"两条命令"的旧状态 |
