# 同一 web 入口的多租户隔离：审计与收口

日期：2026-10-11 · 触发：用户要求「同一个 web 入口下，会话、模型配置、插件、token 消耗各自隔离」· 基线：`main`（本节所有结论都在当前树上实跑）

## 1. 现在真的隔离到什么程度

隔离判据的车道是 `apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts`，本轮在当前树上重跑并**通过**：

```sh
npx vitest run --config vitest.expected.config.ts -t "keeps sessions, tasks, workspaces, plugins, and model settings with their tenant"
```

它逐条断言（双侧：本租户看得到、邻居看不到）：会话（`tenants/<id>/sessions` 与 `session/list`）、任务（schedule 存储域）、工作区、插件（各自 `tenants/<id>/profiles`）、模型设置（各自 `tenants/<id>/settings.yaml`）、转发事件不跨租户、外来会话身份被拒。部署根下只有名册与 `tenants/`。

按源码逐一核过的其它根（都落在租户 home 内，故天然隔离）：`.credentials.yaml`、MCP 用户补丁、附件与缓存（`cache/`）、`session-query-sqlite`、agent 文档、上传索引、shell 环境；首启运行时用 `tenants/.bootstrap` 作自己的 home，不写共享根。**token 消耗**不存在共享账本：它是会话投影（`tokenUsage`），会随会话一起按租户隔离。

## 2. 本轮修掉的真实泄漏：用户技能 / agent 文档

**证据（产品代码 vs 测试夹具的差异）**：

| 位置 | QILIN_HOME | QILIN_AGENTS_HOME |
|---|---|---|
| 测试夹具 `tenant-web-process.ts` | 租户目录 | `<租户目录>/agents` |
| **产品** `apps/cli/src/tenant-runtime.ts`（修前） | 租户目录 | **未设置** |

`skill-filesystem` 的根解析是 `config.agentsHome ?? process.env.QILIN_AGENTS_HOME ?? ~/.agents`，而 base 组合挂载它时**不带 config**。因此产品里每个租户都落到同一个 `~/.agents`：A 的用户技能、agent 文档对 B 可见，也能互相覆盖——而隔离车道照样全绿，因为**它自己的夹具补上了这个变量**。

**修法**：把子进程环境抽成 `tenantChildEnvironment()`，像指定 QILIN_HOME 一样指定 `QILIN_AGENTS_HOME=<租户>/agents`；部署 home 仍只按名字交给名册层。

**验证**：`apps/cli/tests/tenant-environment.spec.ts` 3 例（根都在租户目录内、覆盖 hub 继承来的共享根、其余环境照旧继承）；**负向对照**：删掉那一行 → 2 例变红，恢复 → 3/3。回归：`tenant-supervisor.expected.e2e.ts` **7/7** 通过。

## 3. 还没收口的三处（按性质排序）

| # | 面 | 事实 | 性质 |
|---|---|---|---|
| 1 | **单源模式下的浏览器存储** | 客户端把偏好写进 localStorage：`ql-theme`、`qilin.locale`、`qilin.conversation.busyEnter`、`qilin.sidebar-right.v1.*`、`qilin.open-in-app.choice` 等；localStorage 按 **origin** 隔离，而单源模式正是把两个账户放在**同一个 origin** 上。仓库自己的测试注释也承认这层隔离来自「fresh origin」 | **缺陷**：同一浏览器里 A 的主题/语言/侧栏布局会串到 B。修法要选：按账户 id 给键加前缀（含旧键迁移）／多账户同浏览器只走按账户端口 |
| 2 | **继承的环境凭据与 `~/...` 环境凭据** | `tenantChildEnvironment` 继承 hub 的 `process.env`，所以 `DEEPSEEK_API_KEY` 一类的键对每个租户都一样；pi-ai 的 `fileExists` 把 `~/...` 解析到操作系统家目录，读的是环境的凭据文件 | **政策**：部署给所有人一把钥匙是合理默认，也可能是你要禁掉的。要禁就得在子进程环境里剥掉 provider 键、并决定 `~/...` 还读不读 |
| 3 | **按账户的 token 汇总 / 配额** | 每个会话的用量有投影，但**不存在按账户的汇总或上限**；也没有跨会话的用量账本 | **新增能力**：要「各自消耗」的账目或额度，需要新服务 + 存储 + 页面 |

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
- 第 3 节的第 2、3 条我没有擅自实现：它们改的是「部署给不给共享凭据」与「要不要做额度」这类产品口径。
