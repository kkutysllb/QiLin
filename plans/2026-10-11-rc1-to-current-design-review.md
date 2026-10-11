# 从 3.1.4-rc.1 到现行实现的设计复核

日期：2026-10-11 · 复核对象：`main` 上「出厂预设收敛之后、首次运行初始化那笔提交」所对应的树 · 关联：[NMO 改造计划](2026-10-11-nmo-transformation-plan.md)、[多用户架构改造计划](2026-10-11-multi-user-tenancy.md)、[一个公共地址的多用户部署](2026-10-12-public-multi-user-deployment.md)、[上游对齐计划](2026-10-10-upstream-0.2.1-alpha.2-alignment.md)

本文件只做复核，不改代码。五条要求各自成节：冗余代码、死代码、安全漏洞、按计划实施的准确度与完整性、实际代码层面的功能断点。

**方法与并行写入声明。** 复核由四条只读工作线并行完成（计划实施核对、安全与功能断点、死代码与冗余、以及本文作者的独立复核），所有高影响结论都经第二方在代码上复验。本仓在本轮复核期间被另一个写入者持续修改：开始时工作树有 8 个改动文件，中途变为 9 个，随后被提交为「首次运行初始化」那笔提交，之后又新出现 2 个改动文件。因此本文件的 `文件:行` 以那笔提交所在的树为准；工作树上的在途改动另记于 §5.9、§4.1。标注「审计分支实跑」的结果由复核工作线在只读约束下执行，本文作者未复跑。

## 0. 区间与基线

| 区间 | 提交 | 文件 | 增/删 | 内容 |
|---|---|---|---|---|
| v3.1.4-rc.1 → v3.1.4-rc.2 | 29 | 583 | +121116 / −4272 | 上游 0.2.1-alpha.2 对齐 + NMO 改造 S1–S6 |
| v3.1.4-rc.2 → 复核对象 | 31 | 186 | +5187 / −14040 | subagent 产品后端删除（−10280）、多用户租户 P1–P3、入口收拢为 `qilin web`、首次运行初始化 |
| 复核时工作树 | — | 2（在途） | +41 / −26 | 另一写入者正在改 `tenant-runtime.ts` / `tenants.ts` 的注册策略与首启路由 |

`desktop/` 在第二个区间内零改动（`git diff --stat v3.1.4-rc.2..HEAD -- desktop` 为空），桌面壳仍按自己的路径启动，未进入新的部署入口。

## 1. 现行设计

### 1.1 拓扑

```
浏览器 ── HTTP ──► qilin web（部署入口，进程 A）
                     ├─ /healthz、/status          hub 自有，无鉴权
                     ├─ 名册为空 ⇒ 全部路径交给 .bootstrap 运行时
                     ├─ /t/<用户名>[/…]           交接：303 到租户 origin，或单源下原样转发
                     └─ 其余：按 qilin_tenant 路由 cookie 选运行时，必要时拉起
                             │
                             └─► 租户运行时（进程 B，每账户一个）
                                   QILIN_HOME=$QILIN_HOME/tenants/<账户 id>
                                   只绑 127.0.0.1:0；账号门由它自己回答
```

### 1.2 关键机制

| 面 | 现行实现 | 证据 |
|---|---|---|
| 隔离的物理基础 | 每个租户运行时以 `QILIN_HOME=<部署 home>/tenants/<账户 id>` 启动，`cwd` 同为该目录 | `apps/cli/src/tenant-runtime.ts:371-377` |
| 每租户层 | 覆盖层只写 `accounts.qilinHome` 与 `admittedAccounts`；其余根全部由 `QILIN_HOME` 推出 | `apps/cli/src/tenant-runtime.ts:208-225` |
| 唯一共享面 | `$QILIN_HOME/auth/accounts.json`（名册）与部署 home 目录；技能根另经 `QILIN_AGENTS_HOME`/`~/.agents` 仍共享 | `apps/cli/src/tenants.ts:236`、`packages/skill/skill-filesystem/src/index.ts:168` |
| 路由 | 单源为默认；`qilin_tenant=<账户 id>` 是选择器不是凭据，`HttpOnly; SameSite=Lax` | `apps/cli/src/tenants.ts:97-104`、`apps/cli/src/web-entry.ts:116` |
| 账号门 | 每个运行时自带；cookie 名按请求 authority 的 sha256 命名，签发绑 authority + 凭据代次 | `packages/identity/accounts-local/src/session.ts:80-83,166-167`、`packages/identity/accounts-local/src/index.ts:201-211` |
| 出厂预设 | 恰一条 `ptc`（`order: 1`），前端预设面关闭 | `packages/preset/agent-presets/presets/ptc/preset.yml`、`packages/bundle/web-app/cordis.patch.yml:424-426,579` |
| 会话格式 | 代次 5，V4→V5 迁移把 `standard`/`cordis`/`minimal` 折叠为 `ptc` | `packages/core/session/src/types.ts:89`、`packages/session/session-format-v4-to-v5/` |
| 入口 | 任何服务浏览器的 profile（`qilin`、`web`）都是部署；子进程带租户标记不再重入 | `apps/cli/src/web-entry.ts:28,64-66`、`apps/cli/src/bin.ts:44-50` |

### 1.3 与计划的三处重大偏离

1. **「插件与模型配置共享」已不再成立。** 多租户计划 §0/§3 的目标是「会话与任务隔离，插件与模型配置共享」，§4.2 的样例覆盖层只搬会话/存储/附件根、保留共享 `settings-file`/`credentials-local`/`profiles`。计划 §17 记录了形态改为「每个运行时的插件、模型设置、凭据、技能、预设、会话都在自己的 home 内解析」。代码证实：覆盖层只写 `accounts`，其余全部随 `QILIN_HOME` 走。
   后果：新账户的运行时没有模型凭据，除非部署进程把 `DEEPSEEK_API_KEY` 之类放进环境（子进程继承 `...process.env`，`apps/cli/src/tenant-runtime.ts:371-377`）或每个账户各配一份；`$QILIN_HOME/settings.yaml` 不再被任何租户读取；每个账户各自物化 `profiles/`，成本随账户数线性增长。这条偏离没有在计划正文里以「让步」形式登记（§17 只说了形态取代）。
2. **鉴权形态由「hub 认证 + 反代」改为「hub 不认证、运行时是边界」**（§11.2 已登记），随之 `/signin` 这类 hub 自有登录面不存在，登录页来自运行时的账号门。公共地址部署计划 §2 的 D/E 两条验收仍写 `POST /signin`，与实现不一致。
3. **单源是默认而不是选项。** 多租户计划 §4.4 写「V1 每租户独立端口（默认）」，实现是 `singleOrigin: !args.includes('--per-account-ports')`，默认单源。

## 2. 按计划实施的准确度与完整性

### 2.1 NMO 改造（T1–T9 / A1–A8 / S0–S6）

| 计划项 | 计划要求 | 落地证据 | 判定 |
|---|---|---|---|
| S1/T1 预设收敛 3→1 | roster 恰一条 ptc，合并件逐项在位 | 目录仅 `presets/ptc`；`agent.cordis.yml` 含 tool-kylin、customSkillDirs→`skills/`、创作 persona；两 workflow 行 `disabled: true`；`shipped-root.spec.ts:92` 断言 `['ptc']`；`web-app/cordis.patch.yml:579` `default: ptc`；`verify-preset-copy` 实跑通过 | 完全落地，一处口径变更 |
| S2/T4 会话 V5 | 代次 5，V4→V5 折叠，`resolve()` 不加兜底 | `core/session/src/types.ts:89`；`session-format-v4-to-v5/src/migration.ts`（头 + selected 双写点）；`agent-presets/src/index.ts:370-383` fail-loud；catalog 生成件、持久化变更记录、8 份 SDK 场景 fixture 齐备；spec 19 例 | 完全落地 |
| S3/T2 双工作台删除 | 标签 UI、状态机、过滤、admission 门零残留 | `WORKBENCH_TAG`/`workbenchShows`/`audienceAdmits`/`SlotAdmissionGate`/`installAdmission`/`AgentPresetChip` 全仓零命中；`git ls-files packages/client/ui-workbench` = 0 | 完全落地，夹具面有半删残留（§3.7） |
| S3 audience 归一（C6=a） | 删准入门、受众 UI、store 字段与写入口、`PluginAudience` 类型 | 客户端一侧全部完成；**宿主一侧未做**，见 §3.2 | **部分落地** |
| S4/T5 前端零预设面 | display 键、locales、种子清账，新增 grep 门 | `display.ts` 只剩 ptc 两键；两处字典只剩 PTC；`verify-preset-copy` 挂 `doc-quick`；`ui-agent-preset` 行保留为 `disabled: true` 的依赖声明 | 落地，门的作用域比 A7 窄（§2.4） |
| S5/T6 Open 门禁 | 第三方零核心改动接入；官方插件可摘除 | `third-party-plugin.e2e.ts` + `fixtures/plugins/fixture-third-party/`；`without-official-plugins.overlay.yml`；`shipped-composition.e2e.ts:1209-1234` | 完全落地 |
| S6 度量 | 首启步数 ≤2、配置项 0 | `first-run-metric.e2e.ts` + `expected/first-run-metric/steps.expected.md` | 完全落地 |
| S6 打断点审计 | 逐点「用户决策了什么」 | 计划 §12 七行，路径逐一存在 | 落地，但只存在于计划文档 |
| S6 docs/nmo 对账 | 增附录「T1–T9 落地状态逐条对回 §3 表」 | `docs/nmo.md:58-68`（+zh）是 native/minimal/open/registered yields 四段叙述 + 指向计划 | **口径变更**（无 T1–T9 编号账目） |
| T9 env 缝退役 | unset 与 set 一致，或登记上游依赖 | 两处部署 patch 改为 `process.env.QILIN_TOOLS_MODE ?? 'ptc'`；`docs/nmo.md:68` 登记上游依赖（计划允许的让步态） | 按让步态收口 |

**本节的唯一实质差异（S1）**：C7=a 的原话是「创造模式的 tool-plugin-manager 启用，不在预设层关」，实现用的是 `disabled: !!js "!ctx.get('profileContext')"`——无 profile 的组合里禁用。计划 §9 已把它登记为缺陷修复（否则每个会话都无法组合），因此是**有记录的口径变更**，不是漏做。

**门的作用域比验收断言窄。** A7/计划 §4 要求「退役预设 id 在预设注册面与文案面零回流」，`verify-preset-copy.ts:23-33` 实际只查「预设目录 + display 映射 + 两处客户端字典」，不查 README、指南、fixture 与随预设下发的技能正文，于是 §2.4 与 §3.7 的残留全都过了门。

### 2.2 多用户租户（P1–P3 / 八条判据 / D1–D4）

| 判据 | 状态 | 证据 |
|---|---|---|
| 1 会话不互见 | 有真进程车道 | `apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts:63` |
| 2 任务不互见 | **仅在本机 P1 夹具下成立** | 出厂 Web 组合不含 `schedule`/`ui-schedule`/`time-context`；`tool-schedule` 虽写在 ptc 预设里，但 `ctx.inject(['schedule'])` 让它在服务缺席时静默不注册（`packages/schedule/tool-schedule/src/index.ts:436`）。出厂部署没有可被「互见」的任务面 |
| 3 工作区不互见 | 随 `QILIN_HOME` 隔离成立 | 每租户 `storages/` 独立 |
| 4 配置与插件共享 | **已被 §17 形态取代** | 见 §1.3 第 1 条 |
| 5 事件不串 | 每租户独立 Webserver 与 mux；单源下按 cookie 选择 | `apps/cli/src/tenants.ts:449-472` |
| 6 越权拒绝 | 有断言（伪造路由 cookie 到另一租户得到 401） | `tenant-supervisor.expected.e2e.ts:560-572` |
| 7 共享写安全 | **未覆盖且有真实风险** | 唯一共享写已变成名册；`AccountStore` 是「读—改—写」整份替换、无锁无 revision（§4.2） |
| 8 生命周期 | 空闲回收、上限回收、崩溃退避 | `tenant-supervisor.expected.e2e.ts:243,351` |

运维面（P2 §11.8）齐全：`tenants accounts/add/passwd/remove`、`--max-tenants`、`--restart-backoff-ms`（`apps/cli/src/tenants-roster.ts`、`apps/cli/src/args.ts:226-280`）。

**reload 回滚（§15.3 第 2 项）是未交付的计划项**：用户已裁定「拆拒绝语义」，两版实现均在真实 Web 车道上留下 11 处失败，已整版回退（计划 §16）。`web-failure-matrix` 的 2 条恢复断言仍红，产品契约「被拒的 reload 是否回滚」尚未裁定。代码面无残留（两笔相关提交都是 docs-only）。

### 2.3 一个公共地址的多用户部署（进行中的计划）

| 步 | 内容 | 状态 |
|---|---|---|
| S1 | 修 `args.spec.ts` 断言 | **已完成**（本轮实跑 37/37 绿） |
| S2 | 重跑 `tenant-supervisor` 新入口 | 车道已扩展到 7 个场景，**本轮与复核分支均未独立重跑** |
| S3 | 补错误密码/退出清 cookie/每账户 profiles 断言 | 退出清路由 cookie 已有断言；错误密码与「每账户 `profiles/`」的显式断言未见 |
| S4 | `--host/--port/--idle-ms/--max-tenants/--restart-backoff-ms` fail-loud | **部分完成**：数值开关校验到位，但未知/拼错参数静默忽略（§5.6），且 `--patch`/`--tls-*` 被丢弃（§5.1） |
| S5 | 文档与计划同步、删掉 `tenants serve` 说法 | 计划 §17 已改；公共部署计划 §2 自己仍是旧形态（写 `POST /signin`） |
| S6 | 提交并产出可复现报告 | 提交已发生（另一写入者）；计划 §2 的可复现报告尚未落盘 |

计划的「缺口 5」（历史会话不归属任何账户）**未处理**，且比计划写的更严重：新布局把 `$QILIN_HOME/sessions` 整个换成了 `tenants/<账户>/sessions`，**没有认领入口**，单用户从旧版升级后自己的历史会话在应用里完全不可见（数据仍在磁盘）。这是本次改造里对既有用户影响最大的一条。

### 2.4 文档与代码不一致

| 位置 | 事实 |
|---|---|
| `apps/cli/reference/README.md:100` 与 `.zh.md:102` | 「通过 `cordis`、`ptc` 与 `standard` agent preset 暴露相同工具」 |
| `apps/cli/reference/README.md:96` | 「`QILIN_TOOLS_MODE` 选择 `native`、`ptc` 或 `both`」——`both` 已删除，同仓 patch 注释写的是 `(native|ptc)`，也没写新的 ptc 兜底 |
| `docs/user/guide/github-review.md:70` 与 `.zh.md:70` | 「Session 请求选择 `standard` agent preset」 |
| `packages/preset/agent-presets/presets/ptc/skills/editing-cordis-compositions/SKILL.md:12` | **随 ptc 预设下发给模型**的技能仍写「出厂预设提供 `standard`、`ptc`、`minimal`、`cordis`」——模型可见的过期契约 |
| `packages/bundle/base/README.md:111` 与 `.zh.md:111` | 仍列「Codex and Claude Code provider bundles」为可安装的可选 provider，而这两个包已整目录删除 |
| `apps/web/tests/permission-policy-context.e2e.ts:2` | 注释仍写「through all three presets」 |
| `docs/session-format-status.md:31-33,43-45` | writer 已是 5，但 finalization record 仍 `latestFinalizedVersion: 4`、release record 仍 `latestReleasedVersion: 3`；V5 已随 rc.2 发布 ⇒ 按该文档自述规则应推进（V4 亦从未登记，属既有缺口） |
| `packages/deliverables/tool-present/README.md:28`、`packages/client/ui-deliverables/README.md:35`、`packages/client/ui-goal/README.md:12,79`、`packages/goal/command-goal/README.md:64`、`packages/schedule/tool-schedule/README.md:12,28,32,120`、`packages/web/tool-web/README.md:253`、`packages/client/ui-agent-preset/README.md:28,36`、`packages/client/ui-chat/src/client/conversation-nodes/README.md:210,264` | 同族旧表述（中英各一份） |
| `plans/2026-10-11-nmo-transformation-plan.md:102` | 声称「api-remotes 的 PluginAudience 类型删除」，实际仍在（§3.2） |
| `plans/2026-10-11-multi-user-tenancy.md:505` | 现状列仍写 reload 回滚「尚未落地」，而 §16.4 已记录实现与回退结论 |

`docs/rescope.md:31` 声明「`docs/` 之外的散文保留写作当时的名字」，包 README 那一批可以按政策辩护；但 `docs/user/guide/github-review.md` 在 `docs/` 之内是明确违例，`ptc/skills/` 里的技能是下发给模型的正文，不受该政策保护。

### 2.5 一处潜伏的车道断裂

`apps/cli/tests/fixtures/github-webhook/cordis.yml:15` 把 `agentPreset` 设成 `minimal`，同一车道的断言 `apps/cli/tests/github-webhook-real.e2e.ts:410` 也期望 `'minimal'`。该值经 `packages/experimental/webhook/src/session.ts:55,126` 走 `ctx.agentPresets.resolve()`，在只出厂 `ptc` 的 roster 下没有兜底，必然抛 `agent-preset/not-found`。该车道需要真实 key 与 `QILIN_GITHUB_*`，无 key 时自跳过，所以断裂是**潜伏的**，不在任何一次常规门禁里显形。

## 3. 死代码与冗余代码

### 3.1 三个构建残留目录（常备门已红）

实跑 `npx tsx scripts/check-workspace-constraints.ts`：**exit 1**，三条同一形态的报错——目录存在但已无 `package.json`：

```
packages/client/ui-workbench: expected a package here (no package.json found)
packages/subagent/subagent-claude-code: expected a package here (no package.json found)
packages/subagent/subagent-codex: expected a package here (no package.json found)
```

三者都只有 `lib/` 与 `node_modules/`，`git ls-files` 为 0。`ui-workbench` 由 NMO S3 删包留下（升级计划 §14 已登记一条）；后两条由本区间删除 subagent 产品后端时留下，**属新引入的红**。清理即 `pnpm run clean` 或直接删目录；同一形态还污染磁盘上已删模块的类型残留（如 `packages/client/ui-plugin-manager/lib/types/client/admission.d.ts`）。

### 3.2 audience 的宿主面没有删除（C6=a 未执行完）

| 残留 | 位置 | 现状 |
|---|---|---|
| Remote 写方法 | `packages/boot/plugin-manager/src/index.ts:548` | `setAudience(name, audience)` 仍是公开服务方法，仍经 `@Remote` 暴露；源码外的唯一调用者是 `manager.spec.ts:550-561` |
| 私有写实现 | 同文件 `:854` | `writeAudience()` 仍写 manifest 的 `qilin.profile.audiences` |
| 类型与字段 | `packages/boot/plugin-manager/src/types.ts:9,81,163` | `PluginAudience` / `BundleInfo.audience` / 安装选项 `audience?` 全在 |
| 客户端再导出 | `packages/api/remotes/src/client/index.ts:37` | 具名导出 0 引用 |
| 生成目录 | `packages/extensions/tool-kylin/src/api-catalog.ts:1680,6226-6227` | 仍登记签名与类型；`docs/subsystems/boot.md:134-141` 仍文档化 |
| 读路径 | `packages/boot/plugin-manager/src/index.ts:292-293,329,338,354,362` | 仍从 manifest 读 `audiences` 填进每个 bundle |

消费侧核对：`BundleInfo.audience` 在 `src/` 内没有读取者，`InstallBundleOptions.audience` 没有调用方传值，因此 `:292-293` 的读取与整个字段是一条无消费者的链。提交信息自述「Bundles keep their recorded audience on the Host side」说明是**有意保留**，但这与 D-B5「删类型与写入口」的字面要求相反，也违反仓规「每个选项都要有当前所有者与需要」。

### 3.3 `TenantTarget.entry` 是无消费者的死字段

`apps/cli/src/tenant-runtime.ts:256-260` 计算 `{ origin, entry }`；`proxyRequest` 与 `relayUpgrade` 都只用 `target.origin`（`apps/cli/src/tenant-proxy.ts:131,140-147,188-196`），两个交接调用点也只取整体。单源模式下浏览器从不访问启动 URL，令牌交换不再发生，所以这个字段没有消费者，而 `apps/cli/src/tenants.ts:7-9`、`tenant-runtime.ts:1-11`、`tenant-proxy.ts:44` 的模块注释仍在描述它。

### 3.4 每个代理请求重复读名册（冗余 I/O）

`AccountStore.open()` 每次 `readFile` + JSON 解析，无缓存（`packages/identity/accounts-local/src/accounts.ts:125-131`）。`tenants.ts` 在请求热路径上至少调用两次：`handle` 开头的空名册判定（`:336`，对每一个路径，含 `/api/*` 与全部静态资源）与 `routedRuntime` 的归属校验（`:257`）；`/t/<用户名>` 路径下还有第三次（`:351`）。多用户并发下是每请求 2–3 次磁盘读 + 解析。

### 3.5 `bin.ts` 的全局补丁与叙述性注释

`apps/cli/src/bin.ts:16-33` 在模块顶层给 `globalThis` 定义 `scheduler.yield` 的 `setImmediate` 兜底，注释是一段 6 行的故障叙事（版本、现象、`ReferenceError` 原文、处置理由）。两点：该补丁在**所有**调用模式下生效（含 `tenants`、`dump-config`）；注释是推理记录而非契约，按仓规应把理由移入 Agent Note。

### 3.6 悬空的快照 pin（审计分支实跑）

`snapshots/session/subagent-acp-diagnostic/snapshot.yml:9` 的 `systemPromptSource: product-subagent-codex` 指向一个已被整目录删除的场景。全量扫描 64 条 pin 得 `dangling 1`，唯一一条即它。消费者 `headless.snapshot.ts:722-726` 解析不到就抛错。

审计分支实跑 `npx vitest run --config vitest.snapshot.config.ts -t 'subagent-acp-diagnostic'`：**1 failed / 166 skipped**，但失败点在更早的会话逐字比对（`headless.snapshot.ts:1186`：录制里是 `subagent_acp`/`job_output` 直调，现产品只允许 `run_code` 直调，实得 `UNKNOWN_TOOL`）。也就是说这个 pin 现在被更早的断言挡住了，修完比对后会以它自己的报错再红一次。

### 3.7 半删残留与失效夹具

| 位置 | 事实 |
|---|---|
| `packages/client/ui-schedule/tests/browser-plugin.client.spec.ts:103`、`packages/client/ui-sidebar-documentpreview/tests/document-seat.client.spec.tsx:55`、`packages/client/ui-sidebar-right/tests/apply.client.spec.ts:85` | 三处仍 `ctx.provide('workbench', …presets:{general:'standard',coding:'ptc'})`，注释写「dual-workbench tag source (D5)」；提供者已随 S3 删除、无人读 |
| `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx:1321` | 残留 `id="workbench-list-panel"` |
| `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css:46` | 注释仍以「dual-workbench D5 / coding tag」解释结构 |
| `packages/client/ui-plugin-manager/tests/manager-store.client.spec.ts:98` | 假 remote 仍声明 `setAudience: vi.fn()`，store 已不调用 |
| `apps/cli/src/tenant-proxy.ts:220` | `export type UpgradeSocket = Socket` 全仓 0 引用（连带只服务它的 `import type { Socket }`） |
| `apps/cli/src/tenant-runtime.ts:178-189` | 属于 `tenantPatchYaml` 的 JSDoc 块错误地叠在只收 `registration` 的 `bootstrapPatchYaml` 之上，而 `tenantPatchYaml` 本身没有 JSDoc；`verify-export-jsdoc` 不扫 `apps/`，门禁看不见 |
| `apps/cli/src/tenant-runtime.ts:165` | `IDENTITY_PATTERN` 的注释写作「The patch document one tenant's harness home carries.」 |
| `apps/cli/src/tenants.ts:354` | `hubOwnRoute` 的 `/healthz`、`/status` 两个析取在前文已 return，恒为 false |
| `scripts/verify-config-source-ownership.spec.ts:17,25` | 临时夹具仍用路径名 `packages/subagent/subagent-claude-code` |
| `packages/client/connection/src/client/fixture.ts` | 全仓 0 importer（rc.1 起即 0），本范围仍在维护它（S3 时把 standard/minimal 改成 ptc），且不在 coverage exclude 列表里。是否作为离线开发面保留需要人工确认，不建议凭一条静态结论就删 |
| `snapshots/session/skill-load/session.v2/v3/v4.jsonl`、`snapshots/web/skill-tool-row/ui.expected.md:16` | 内嵌 NMO 前的技能正文（四预设表述），v4 还点名已删的参考文件；重录需真实 key |

### 3.8 查过、判定干净

claude/codex 产品后端的实现面（预设两行、ON_DEMAND_BUNDLES、official-bundles 生成件、release families、run-gates 冒烟清单、tsconfig、THIRD_PARTY_NOTICES、subagent 子系统文档与包 README）已随那笔删除提交清干净；`experimental-hooks-claude-code`/`hooks-codex` 是 Claude Code 钩子协议桥，不是同一件事。双工作台/受众门/准入缝的实现符号零残留。reload 回滚的两笔相关提交都是 docs-only，代码面无残留。`tenants.ts` / `web-entry.ts` / `tenant-proxy.ts` 是互补拆分而非重复实现；`packages/experimental` 44 个包无孤儿。

## 4. 安全

### 4.1 首启接管窗口（高）

**事实。** 名册为空时 `qilin web` 把每一个路径交给 `.bootstrap` 运行时（`apps/cli/src/tenants.ts:332-339`），其覆盖层只写 `accounts.qilinHome` 与 `registration: closed`、**不写 `admittedAccounts`**（`apps/cli/src/tenant-runtime.ts:186-202`）。`admittedAccounts` 缺席意味着「接纳名册里的任何账户」（`packages/identity/accounts-local/src/index.ts:162-182`），而初始化端点只判 `store.isEmpty`、**不看 registration**（`packages/identity/accounts-local/src/routes.ts:236-249`）。

**后果。** 刚启动、尚无账户的部署上，**第一个到达该地址的人** POST `/api/auth/setup` 即可创建第一个账户，随后由 hub 起专属运行时，攻击者重新登录后即拥有一个完整席位。默认 `--host 127.0.0.1` 只影响本机；绑到 `0.0.0.0` 就是未认证的远程账户创建。已提交的车道实证了 setup 返回 200（`tenant-supervisor.expected.e2e.ts:779-787`）。

**在途动向。** 复核末尾的未提交改动正在给首启运行时加 `registration: 'open' | 'closed'` 选项，并且 web-entry 侧**默认取 open**，同时把 `/t/<名册里没有的用户名>` 从 404 改成转发给首启运行时。按未提交形态，部署地址上的任何访客都能直接 `POST /api/auth/register` 自助开户（`routes.ts:251-270`），这与 `docs/user/guide/tenancy.md:9` 与 `tenants-roster.ts:5-6` 自述的「运行时关闭注册」相反，也未与 `--host` 联动。该改动未完成，因此按在途项记录，但它指的方向把 §4.1 的风险从「抢占第一个账户」扩大成「持续自助开户」。

**建议。** 非 loopback 绑定时拒绝自动首启或要求一次性运维令牌；把 `registration` 真正接到 `setup` 端点上；并对「部署尚未初始化」这一状态给出显式运维提示。

### 4.2 共享名册的并发写（高）

名册是唯一共享可写文件，`AccountStore` 在装载时 `open` 一次并长期持有内存快照，写回是整份文档的原子替换（`packages/identity/accounts-local/src/accounts.ts:190-216,247-254`）。两个运行时同时改密，或 CLI `tenants add/remove` 与运行中的改密并发，就会后写覆盖前写：改密丢失、被删账户复活、新账户消失。没有锁、没有 revision、没有变更广播。这是**静态推理**结论（未实跑并发），但代码里没有任何互斥机制。

### 4.3 入口静默丢弃 `--tls-cert`/`--tls-key`（高，fail-open）

`--tls-cert`/`--tls-key` 由 web-app 自己的命令面解析并交付给它的服务器（`packages/bundle/web-app/src/startup.ts:60-61,90-100`），但 `qilin`/`qilin web` 现在先被部署入口拦下（`apps/cli/src/bin.ts:44-50`），入口的 `http.createServer` 没有 TLS（`apps/cli/src/tenants.ts:441-447`），也不把这两个开关传给子运行时（子进程参数只有 `--profile/--host/--port/--no-open`，`apps/cli/src/tenant-runtime.ts:359-366`）。因此 `qilin web --tls-cert chain.pem --tls-key key.pem` **静默变成明文 HTTP**，无告警无报错。部署文档引导操作者用 `--tls-cert`，所以这是把「以为已启用 HTTPS」变成事实上的明文暴露。

### 4.4 `/status` 未认证枚举（中）

`/healthz`、`/status` 由 hub 直接应答，无鉴权、无 Host/Origin 栅栏，且**先于**方法检查（POST 也答）（`apps/cli/src/tenants.ts:328-331`）。返回体含每个运行的租户 `username`、`accountId`、loopback origin、pid、失败计数与 `detail`，而 `detail` 可携带最多 64KB 子进程输出（`apps/cli/src/tenant-runtime.ts:76,321-329,426`）。绑 loopback 时是运维便利，绑 `0.0.0.0` 时是公开的账户名册 + 运行态 + 子进程日志。

### 4.5 hub 自身路由没有 Host 栅栏（中）

Origin 校验只存在于转发路径，且比较的是 `Origin.host` 与**同一个请求的 `Host`**（`apps/cli/src/tenant-proxy.ts:86-97`，调用点 `apps/cli/src/tenants.ts:291`）。DNS rebinding 场景下攻击者让两者同为自己的域名即可自洽通过，hub 自有路由（`/status`、名册为空时的首启转发）完全没有栅栏。真实风险上限被 cookie 命名挡住：租户会话 cookie 名是**请求 authority 的 sha256**（`packages/identity/accounts-local/src/session.ts:80-83`），rebinding 的浏览器只带攻击者域名的 cookie，拿不到受害者席位。因此这是「缺少固定 authority 允许列表」的加固项，而不是可直接越权的漏洞。

### 4.6 登录无速率限制（中）

登录路由只做「账户存在 + 在接纳名单内 + 口令校验」，没有尝试次数、锁定、退避或告警（`packages/identity/accounts-local/src/routes.ts:273-292`；全文件无 `rateLimit`/`attempts`/`lockout`）。scrypt（N=2^15）把单次成本抬到约 30ms 量级，公网地址上仍是每秒数十次量级的在线猜解，且部署方被文档告知「限流由部署方承担」——但入口本身不提供任何限流钩子。

### 4.7 其余面

| 项 | 严重度 | 事实 |
|---|---|---|
| `--purge-data` 的「双重校验」是永假分支（中） | 中 | `apps/cli/src/tenants-roster.ts:169-172`：`directory` 与 `expected` 由同一次 `join(home,'tenants',account.id)` 得出，`resolve(directory) !== expected` 永远为假，注释声称的保护不存在；此处也不做 `IDENTITY_PATTERN` 校验。账户文件里的 id 写成 `../../x` 时 `rm -rf` 会删到 home 之外。前提是能写账户文件（同 OS 用户），非远程提权 |
| `IDENTITY_PATTERN` 允许 `.` 与 `..`（中） | 中 | `apps/cli/src/tenant-runtime.ts:160,208-210`；`tenantDir = join(home,'tenants',accountId)`，id 为 `..` 时 `QILIN_HOME` 变成部署根。正常路径用 randomUUID，需手改账户文件才可达 |
| 会话 cookie 无 `Secure`（低） | 低 | `packages/identity/accounts-local/src/session.ts:166-167` 只有 `Max-Age; Path=/; Expires; HttpOnly; SameSite=Strict`；同一 authority 若也能被明文访问，浏览器会一并把 cookie 发过去 |
| `/t/%zz` 抛 URIError 变 500（低） | 低 | `apps/cli/src/tenants.ts:350` 的 `decodeURIComponent` 未捕获，应回 400/404 |
| `--host` 非 loopback 无告警（中） | 中 | `apps/cli/src/web-entry.ts:102` 接受任意 host；`apps/cli/src/tenants.ts:481-483` 把 `0.0.0.0`/`::` 打印成 `127.0.0.1`，远程部署者会以为仅本机可达 |
| `openAddress` 未挂 `error` 监听（低） | 低 | `apps/cli/src/web-entry.ts:77-85` 的 `spawn('xdg-open'…)` 没有 `error` 处理，而它自称复刻的 `packages/bundle/web-app/src/index.ts` 挂了 error/close；无 `--no-open` 的最小容器里可能崩 |
| 首启运行时长期占用上限名额（低） | 低 | `apps/cli/src/tenants.ts:174-191`：名册非空后它不再被路由，却仍在 `runtimes` 里、计入 `active()`，只靠 idle 回收。`--max-tenants` 下白占一名额；`--idle-ms 0` 时永久滞留 |
| 技能目录跨租户共享（中，文档不一致） | 中 | 子进程继承 hub 环境，只覆盖 `QILIN_HOME`/租户标记/部署 home；技能根取 `QILIN_AGENTS_HOME ?? ~/.agents`（`packages/skill/skill-filesystem/src/index.ts:168`），与 `docs/user/guide/tenancy.md:41`「skills 各归其主」不符 |

### 4.8 已做对的部分（供对照）

* 名册文件 `0o600`、目录 `0o700`、scrypt 哈希、明文口令只在内存（`packages/identity/accounts-local/src/accounts.ts:45-46`、`password.ts`）；口令只从隐藏提示或 `--password-stdin` 读取，不接受 `--password`；
* 会话 cookie `HttpOnly; SameSite=Strict`，HMAC 签发，载荷绑 `authority + subject + tokenVersion`，改密递增代次即失效；
* 路由 cookie 明确声明为选择器，并有「把它指向另一个租户得到 401」的断言；其值在进入任何查找前先经名册归属校验（`apps/cli/src/tenants.ts:257`），`/t/<用户名>` 也必须命中名册条目（`:351`），因此不存在 tenant id 路径穿越；
* 登录与「非接纳账户」返回同一个 401，不泄漏账户是否存在；
* hub 不做访问判定，边界落在做出决定的操作里（计划 §11.2 的理由仍然成立）；
* 代理层正确丢弃连接级头、改写 `Host`/`Origin`、按 Range 分流媒体流。

### 4.9 已登记的让步（不要当漏洞处理）

同 OS 用户不是文件系统边界（计划 §4.5 第 1 条）；一个浏览器同时只驱动一个租户（§12.4 第 1 条）；运行时端口仍可达、只绑 loopback（§12.4 第 2 条）；TLS/反代/限流/配额由部署方承担（公共部署计划 §5 第 3 条）——**但这条不覆盖 §4.3**：部署方被引导使用的 `--tls-cert`/`--tls-key` 会被入口静默丢弃。计划声称的 Referer 校验并不存在（全仓无读 `referer`），属「计划文本大于实现」。

## 5. 实际代码层面的功能断点

### 5.1 `--patch` 在部署入口被静默丢弃（高）

启动器的 `--patch` 被解析进 `invocation.patches`（`apps/cli/src/args.ts:137-141,190`），但部署入口的分支只把 `invocation.args` 交给 `runWebEntry`（`apps/cli/src/bin.ts:44-50`），`patches`/`fromDefaultProfile` 一律丢弃；子运行时的 spawn 参数里也没有 `--patch`（`apps/cli/src/tenant-runtime.ts:359-366`）。因此 `qilin web --patch x.yml` 是**静默空操作**。

影响面不小：仓库自己的约定写法是 `pnpm qilin web --patch apps/web/tests/pin-browse-picker.overlay.yml`（`AGENTS.md:116`），此外还有多条车道与脚本按同一形态启动（`default-web-process`、`web-failure-matrix`、`web-best-effort-startup` 等），它们现在都在没有覆盖层的情况下跑。`args.spec.ts` 恰好断言了 `patches` 被正确解析，却没有任何断言检查它被使用——解析到了没人用。

### 5.2 首启建户之后必须再登录一次（高）

首启转发**不带路由 cookie**（`apps/cli/src/tenants.ts:308-320` 的 `[]` 参数），它签发的会话 cookie 名绑定**它自己的** authority。名册一旦非空，hub 便不再服务该运行时，转而 302 到 `/t/<首个账户>/`（`:417-437`），那里是另一进程、另一 authority，浏览器手里那枚 cookie 不被承认，于是又落回登录页。

已提交的车道把这条路径固化成了现状：`tenant-supervisor.expected.e2e.ts:753` 第 4 步只断言 302 与 `/t/<用户名>/` 返回 HTML，**没有断言「免再次登录」**。用户视角是「刚设好账户又被要求登录一次」。

### 5.3 历史会话在新布局下不可达（高，已登记缺口 5）

`QILIN_HOME=tenants/<账户 id>` 一旦成为唯一根，部署根下的 `sessions/`、`storages/`、`settings.yaml` 都不再被读取。公共部署计划 §3/§4 把这条登记为「缺口 5，本计划只把它写清楚」。本复核确认没有认领入口、没有迁移器、没有提示。

### 5.4 首启期间的 WebSocket 升级必然被销毁（中，未测路径）

`server.on('upgrade')` 只按路由 cookie 找运行时，找不到或名册里没有就直接 `socket.destroy()`（`apps/cli/src/tenants.ts:449-472`）。首启阶段名册为空、且首启转发不种路由 cookie，所以应用外壳若在首启页打开 mux 事件流，这条连接一定失败。已提交的首启车道只断言 HTML 与 `/api/auth/*`。

### 5.5 就绪判定把 stderr 也喂进同一缓冲（中）

`apps/cli/src/tenant-runtime.ts:380-398` 把 stdout 与 stderr 都 append 进同一个 `output` 缓冲，而 `READY_URL` 只认行首 `label: http…`（`:21`）。注释（`:387-388`）明确说「标准输出那一行携带启动令牌，只转发 stderr」，但就绪匹配实际是在两路交错写入的缓冲上做的：交错落在 URL 行中间就会匹配失败，一路走到 120s 超时。失败详情还会带上含令牌的 stdout。

### 5.6 未知参数静默忽略（中）

`apps/cli/src/web-entry.ts:51-58,101-117` 只校验 4 个数值开关与 `--registration` 取值，其余拼错的参数（例如 `--idle-msx 0`）被静默忽略，与仓库「误配置 fail loud」的约定相反。

### 5.7 单源模式不再交换启动令牌（中）

与 §3.3 同源：令牌交接是死代码。当前账号门开启时登录能带出会话 cookie，够用；但把账号门关掉（`enabled: false`，部署逃生口已被别的车道用到）时，浏览器就没有任何建立设备会话的机会，需要复核这条组合。

### 5.8 出厂部署没有可调度的任务面（中，影响判据 2 的可验证性）

见 §2.2 判据 2：`schedule` 服务只随实验性 `schedule-bundle` 安装，`tool-schedule` 在服务缺席时静默不注册，因此「任务不互见」在出厂部署下没有可观测对象。

### 5.9 其他可用性/韧性断点

| 项 | 事实 |
|---|---|
| 名册非空后 `/` 只 302 到第一个账户 | `apps/cli/src/tenants.ts:430-437`：没有目录页，第二个账户必须自己知道 `/t/<用户名>` |
| 全局 `serialize()` 让一次启动超时阻塞所有账户 | `apps/cli/src/tenants.ts:225-229`：某个 profile 坏掉时，120s 的启动等待排在队首，其他账户的交接全部等待 |
| 回收是直接 SIGTERM（15s 后 SIGKILL），无 drain | `apps/cli/src/tenant-runtime.ts:324-344`：进行中的一轮对话会被中断（会话在盘上，数据不丢） |

### 5.10 在途改动（不属本次判定）

复核末尾工作树出现对 `tenant-runtime.ts` / `tenants.ts` 的在途改动：给首启运行时加 `registration` 选项（默认 open）、把「名册里的未知用户名」也交给首启运行时、把空名册分支的转发目标统一改成 `/`。**最后一条按当前形态会把首启期间的 `/api/auth/status` 与全部静态资源都请求成 `/`**，与 `tenant-supervisor.expected.e2e.ts:753` 第 2 步的断言冲突。该改动未完成、未提交，本文不据此判缺陷，只记录它需要在该写入者收口后重新验证。

## 6. 已登记但未收口的红

| 项 | 现状 |
|---|---|
| `web-failure-matrix` 2 条恢复断言 | 产品契约未裁定（被拒的 reload 是否回滚），两版实现已回退 |
| SDK 快照 6 项 | 需要真实 key 重录或逐场景改写（`serial-created`、`subagent-activation-limit`、两条 `-in-process`、`dynamic-route`、`tool-error-details`） |
| `subagent-acp-diagnostic` 快照 | 审计分支实跑 1 failed（直调被 PTC 门拒绝），另含一条悬空 pin（§3.6） |
| `present` / `ptc-escalation` / `ptc-round` | 本机录制夹具陈旧，只能 `QILIN_SNAPSHOT=record` 重录 |
| `schedule-after` / `schedule-panel` | 升级期孤儿车道，复活配方已写明 |
| 全量单测约 280 例红 | 计划 §14 登记为与改动面无交集的既有红，未建改动前基线 |
| `check-workspace-constraints` | 由 1 条残留涨到 3 条（§3.1 为本轮新发现） |

## 7. 并发验证的覆盖边界

用户口径是「多用户并发测试验证已完成」。代码层面确实有一条真实并发车道：`tenant-supervisor.expected.e2e.ts:613` 让两个账户同时存活、并发 `session/create`、交错 3 轮 `session/list`、并各写一份 `settings/update` 断言互不可见——它覆盖了「隔离」的并发面。以下仍无覆盖：

1. **登录与首跳的并发**：两个账户在同一条用例里是先后登录的；没有同时登录、同时首跳、以及首跳与建户交错的用例。
2. **上限回收的并发竞态**：`makeRoom` 与 `--max-tenants` 由 `serialize()` 串行保护（`apps/cli/src/tenants.ts:198-229`），但现有断言都是顺序跳转（`:351` 场景）。两个同时到达的交接是否真的不会各自放行、不会把正在启动的运行时当作可回收对象，没有并发用例。
3. **名册并发写**：见 §4.2，没有用例。
4. **坏 profile 下的串行阻塞**：见 §5.9，没有用例。
5. **首启运行时与真实租户并存**：名册从空到非空是一个突变点，`handle` 的两次独立 `roster()` 读数（`:336` 与 `:257`）之间名册可能已变化；「两个浏览器同时 POST `/api/auth/setup`」的第二个应得 `409 already-initialized`，无断言。
6. **>2 账户与回收抖动**：所有车道最多两个账户。

## 8. 本轮实跑的验证

| 命令 | 结果 | 来源 |
|---|---|---|
| `npx vitest run apps/cli/tests/{args,tenants-roster,tenant-proxy,web-entry}.spec.ts` | **54/54 通过**（4 文件）——公共部署计划缺口 1 已修 | 本文作者 |
| `npx tsx scripts/check-workspace-constraints.ts` | **exit 1**，3 条残留目录（§3.1） | 本文作者 |
| `npx tsx scripts/verify-preset-copy.ts` | 通过：1 个出厂预设与 display 映射、两处字典一致 | 本文作者 |
| `git diff --stat v3.1.4-rc.2..HEAD -- desktop` | 空——桌面壳未被本次改造触碰 | 本文作者 |
| `npx vitest run --config vitest.snapshot.config.ts -t 'subagent-acp-diagnostic'` | 1 failed / 166 skipped（失败点早于 §3.6 的 pin 校验） | 复核分支 |
| 悬空 pin 扫描（按 `snapshot.yml` 的来源名反查场景目录） | checked 64 / dangling 1 | 复核分支 |
| 导出引用扫描（对区间内改动的 44 个源文件） | 得到 §3.2/§3.3/§3.7 的条目 | 复核分支 |

**未跑**：真进程 e2e 租户车道（`tenant-supervisor` / `tenant-isolation`，需要构建产物与真实引擎，且本仓正被并行写入）、`pnpm run duplication`、`verify-export-jsdoc`、`doc-sync` 全量、`pnpm run test`。计划文档里对这些车道的「全绿」自述因此属于**未经本轮独立复核**的引用。

## 9. 整改清单

**P0（安全与正确性，先做）**

1. §5.1 `--patch` 丢失：入口要么把 `invocation.patches` 真正应用到子运行时，要么明确拒绝 `--patch` 而不是静默忽略。它同时影响仓库自己的工作流与多条车道。
2. §4.3 TLS 开关丢失：至少要 fail-loud（入口不认识就报错），更好的是让入口能终止 TLS 或把开关交给运行时。
3. §4.1 首启接管 + §4.1 尾段的默认 `registration: open`：非 loopback 绑定时收口，并把 `registration` 真正接到 `setup` 上。
4. §4.2 名册并发写：加文件锁或 revision 比对的读—改—写，或把名册写集中到单一进程。
5. §5.10 与在途写入者对齐后重新验证首启路径（`/api/auth/status` 与静态资源必须按原路径转发）。

**P1（计划完整性与死面）**

6. 清理三个残留目录（§3.1），让 `check-workspace-constraints` 复绿。
7. 按 C6=a 补完 audience 的宿主面处置：删 `setAudience`/`writeAudience`/`PluginAudience`/`BundleInfo.audience` 与 `audiences` 读取，或在计划里把「保留宿主写入口」登记为口径变更（§3.2）。
8. 删 `TenantTarget.entry`（§3.3），或在单源路径上真正消费它（§5.7）。
9. 修 §3.6 的悬空快照 pin，并把 §2.4/§3.7 的退役表述一次清干净；把 `verify-preset-copy` 扩到 README、指南、fixture 与随预设下发的技能正文（`docs/user/guide/github-review.md`、`ptc/skills/`、`github-webhook` fixture 与 §2.5 的断言优先）。
10. 名册读取加缓存或每请求共享一次 `AccountStore`（§3.4）。
11. 历史会话认领入口立项（§5.3）——对既有单用户影响最大的一条。
12. 修 §4.7 的两个路径校验缺陷：`--purge-data` 的永假守卫与 `IDENTITY_PATTERN` 允许 `..`。

**P2（清晰度与契约）**

13. 裁定被拒 reload 是否回滚（§2.2 尾段），并按新契约重写 `web-failure-matrix` 的 8 条断言。
14. 把 `bin.ts` 的 `scheduler` 补丁理由移入 Agent Note，注释只留契约（§3.5）。
15. 登录加基本限流或退避（§4.6）；会话 cookie 补 `Secure` 的条件写清楚（§4.7）。
16. 在部署文档里分开写清「hub 地址」与「租户运行时可被 `--tenant-host` 暴露」，并对非 loopback 绑定打印告警（§4.5/§4.7）。
17. 补五条并发/共享写用例（§7）。
18. 把 schedule 能力是否进入出厂部署作为产品决定登记（§5.8），并据此修正判据 2 的口径。
19. 修 §3.7 的夹具与注释残留，并同步 §2.4 的文档口径（含 `session-format-status.md`）。
