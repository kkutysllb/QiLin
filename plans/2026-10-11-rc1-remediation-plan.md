# rc.1 复核结论的整改台账

日期：2026-10-11 · 复核：[从 3.1.4-rc.1 到现行实现的设计复核](2026-10-11-rc1-to-current-design-review.md) §9 · 整改基线：`main` @ `038bffe73e`

本文件是复核清单的执行台账。每项写清出处、状态与落地证据；状态只有三种：**已落地**（附提交）、**部分落地**（写明缺口）、**待决策**（写明要谁定什么）。复核本身只读，本台账的每一项改动都跑过对应门禁并单独提交。

## P0 安全与正确性

| # | 项 | 状态 | 落地 |
|---|---|---|---|
| 1 | §5.1 `--patch` 在部署入口被静默丢弃 | **已落地** `ff4c6c1e26` | 入口拥有 `--patch` 并解析为绝对路径（子进程 `cwd` 是自己的租户目录，相对路径在那边无效），经 `tenantChildArguments` 以启动器 flag 形式置于应用参数之前。`apps/cli/tests/tenant-runtime.spec.ts` 断言顺序与内容 |
| 2 | §4.3 `--tls-cert`/`--tls-key` 被丢弃（fail-open） | **已落地** `ff4c6c1e26` | 入口自己终止 TLS：成对给出才接受，文件读不出来即失败退出，绝不退回明文；与 `--per-account-ports` 互斥（按账户分发的 origin 是明文）。地址、`/status` 与文档同步为 `https` |
| 3 | §4.1 首启接管窗口 + 默认 `registration: open` | **已落地** `ff4c6c1e26` + `025cc12ab5` | 入口按绑定地址定默认：loopback 上 `open`，其他地址 `closed` 并打印提示（`qilin tenants add`）；`setup` 端点接入 `registration`，closed 时回 403 `registration-closed`，不再由产品表单创建第一个账户；`--host` 拒绝通配地址（与 web 应用同规） |
| 4 | §4.2 名册并发写 | **已落地** `025cc12ab5` | `AccountStore` 每次变更在文件旁取独占锁、重读、再原子替换；锁有等待上限与过期判据（`LOCK_STALE_MS` 长于 `LOCK_TIMEOUT_MS`，避免等待者自己把活锁判成残留）；`add()` 在临界区内判定用户名/邮箱唯一并抛 `AccountConflictError`；新增 `initialize()` 在临界区内判定空名册 |
| 5 | §5.10 与在途写入者对齐后重验首启路径 | **已落地** | 在途改动已提交为 `15c7637c84`/`cc2cc98341`；本次在提交后的树上重跑 `apps/cli/tests` 与 `packages/identity/accounts-local/tests`，`/api/auth/status` 与静态资源按原路径转发（`tenants.ts` 单请求单次名册读） |

## P1 计划完整性与死面

| # | 项 | 状态 | 落地或缺口 |
|---|---|---|---|
| 6 | §3.1 三个构建残留目录 | **已落地** | `packages/client/ui-workbench`、`packages/subagent/subagent-claude-code`、`packages/subagent/subagent-codex` 三个目录（只剩 `lib/` 与 `node_modules/`，`git ls-files` 为 0，无 manifest）已删除，`npx tsx scripts/check-workspace-constraints.ts` **exit 0**；指向已删包的临时夹具改名见 `00dd6591da`。`website/.generated`、`website/.dist`、`desktop/staging` 仍含旧包引用，但三者都被 gitignore，且由各自的构建重新生成 |
| 7 | §3.2 audience 宿主面 | 待办 | `setAudience`/`writeAudience`/`PluginAudience`/`BundleInfo.audience` 与 manifest 读取仍在；需删，或在计划里登记为口径变更并给出所有者。删除会波及生成件 `tool-kylin/src/api-catalog.ts` 与 `docs/subsystems/boot.md`，要和生成器一起改 |
| 8 | §3.3 `TenantTarget.entry` 死字段 | **已落地** `ff4c6c1e26` | 代理目标收敛为 origin；`relayUpgrade`/`proxyRequest` 签名与 `tenant-proxy.spec.ts` 同步 |
| 9 | §3.6 悬空快照 pin + §2.4 退役表述 + `verify-preset-copy` 作用域 | **部分落地** | 悬空 pin 已消除（`subagent-acp-diagnostic` 不再指向已随产品后端删除的 `product-subagent-codex`，改为自持）；CLI reference 中英、GitHub 评审指南中英、base 组合包 README 中英、`permission-policy-context` 注释、webhook 车道夹具与断言、以及随 ptc 预设下发给模型的 `editing-cordis-compositions/SKILL.md` 都已改名为 `ptc`（那条夹具此前请求已退役的 `minimal`，属 §2.5 的潜伏断裂）；门已扩到 7 个契约文件，除「id 紧邻 preset」「`agentPreset` 取值」外还拦「一行枚举两个退役 id」，两条负向对照都实跑过（改名即红并指名 file:line）。**未做**：§2.4 的包 README 同族旧表述（`docs/rescope.md` 政策豁免其散文）；`docs/session-format-status.md` 的 V5 finalization/release 记录（要 V5 检查点与确认记录，属持久化台账流程，不能半改）；`subagent-acp-diagnostic` 的 `system-prompt.expected.md` 边车与整场景重录（需 `QILIN_SNAPSHOT=record` 与真实 key，归 §6 的 red） |
| 10 | §3.4 每请求多次读名册 | **部分落地** `ff4c6c1e26` | `handle` 每请求只读一次名册并全程复用（同一请求一个视图）；跨请求缓存未做——外部写入（`tenants add`）必须被看见，缓存需要签名失效，留待真正需要时再做 |
| 11 | §5.3 历史会话认领入口 | 待决策 | 新布局把 `$QILIN_HOME/sessions` 换成 `tenants/<账户>/sessions`，旧会话在应用里不可见。需要产品决定认领形态（首个账户自动认领 / `qilin tenants claim <账户>` / 启动时提示），再落代码与迁移器 |
| 12 | §4.7 `--purge-data` 永假守卫 + `IDENTITY_PATTERN` 允许 `..` | **已落地** `c5aefb6b5f` | 身份校验收敛为一个导出的 `isTenantIdentity()` 并拒绝 `.`/`..`；`removeAccount` 的 `rm -rf` 前同时要求该规则与「父目录就是本部署的 `tenants` 根」，新增用例证明旧比较恒真时会把 `tenants/../outside` 删掉 |

## P2 清晰度与契约

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 13 | 被拒 reload 是否回滚 | 待决策 | 两版实现已在真实 Web 车道回退（计划 §16）；要先裁定契约措辞，再重写 `web-failure-matrix` 的 8 条断言 |
| 14 | §3.5 `bin.ts` 的 `scheduler` 补丁理由移入 Agent Note | 待办 | 注释只留契约 |
| 15 | §4.6 登录限流 / §4.7 cookie `Secure` 条件 | 待办 | 入口已有 TLS 能力，`Secure` 现在可由入口按 scheme 附加；限流仍需产品口径 |
| 16 | §4.7 非 loopback 绑定告警 + 文档分开写 hub 与租户地址 | 部分落地 `ff4c6c1e26` | 入口在非 loopback 绑定上打印可达性事实；文档已说明租户运行时只绑 loopback |
| 17 | §7 五条并发/共享写用例 | 部分落地 | 名册并发写已有用例（同一进程并发、两个写者各持旧快照、锁等待、过热锁过期、等待超时、空壳锁路径）；登录与首跳并发、上限回收竞态、坏 profile 串行阻塞、首启与真实租户并存仍缺 |
| 18 | §5.8 schedule 能力是否进入出厂部署 | 待决策 | 影响判据 2 的可验证性 |
| 19 | §3.7 夹具与注释残留 + §2.4 文档口径 | 待办 | 三处 `ctx.provide('workbench'…)`、`WorkspaceBrowser` 的 `workbench-list-panel`、`manager-store.client.spec.ts` 的 `setAudience: vi.fn()`、`UpgradeSocket`、`tenant-runtime`/`tenant-proxy` 的模块注释（`hubOwnRoute` 死析取已在 `ff4c6c1e26` 改为单条件） |

## 本轮新增发现（复核清单之外）

| 项 | 落地 |
|---|---|
| 部署入口 `--help` 从不打印：launcher 的 `helpOption(false)` 让它落进应用参数，入口又忽略它，`qilin web --help` 会直接开始服务 | **已落地** `ff4c6c1e26`：入口自己回答 `-h`/`--help`，列出部署 flag 并说明其余参数交给各运行时 |
| 应用 flag 与拼错的 flag 一律被静默吞掉 | **已落地** `ff4c6c1e26`：入口只消费自己的 flag，其余（如 `--trusted-host`）透传给每个运行时的命令行 |
| 就绪判定把 stderr 与 stdout 混进同一缓冲 | **已落地** `ff4c6c1e26`：按 stdout 完整行匹配，stderr 只进诊断；失败详情不再携带带 launch token 的 stdout |
| `--from-default-profile` 在部署入口毫无效果（shipped profile 必被拒绝） | **已落地** `ff4c6c1e26`：入口明确拒绝并说明原因 |
| webhook 真实车道的夹具与断言请求已退役的 `minimal` 预设 | **已落地**（随 §2.5 一并修）：该车道需真实 key 且 `QILIN_GITHUB_*`，属潜伏断裂，不在任何常规门禁里显形 |
| `apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts:828` 有既有 lint 报错 | 登记未动：本轮未触碰该文件，改动面与之无交集 |
