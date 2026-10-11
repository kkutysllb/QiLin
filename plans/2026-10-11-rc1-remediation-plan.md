# rc.1 复核结论的整改台账

日期：2026-10-11 · 复核：[从 3.1.4-rc.1 到现行实现的设计复核](2026-10-11-rc1-to-current-design-review.md) §9 · 整改基线：`main` @ 复核对象树

本文件是复核清单的执行台账。每项写清出处、状态与落地证据；状态只有三种：**已落地**（附提交）、**部分落地**（写明缺口）、**待决策**（写明要谁定什么）。复核本身只读，本台账的每一项改动都跑过对应门禁并单独提交。

本轮落地的提交按顺序记作 **C1**…**C11**，提交主题如下（本仓的引用门禁不接受提交号，故以主题为准）：

| 标号 | 提交主题 |
|---|---|
| C1 | `fix(accounts-local): serialize roster mutations and decide first-run where the write lands` |
| C2 | `fix(cli)!: read the deployment's own flags, terminate its TLS, and keep the roster off the request path` |
| C3 | `fix(cli): refuse to purge a directory the account identity does not own` |
| C4 | `test(scripts): name the config-ownership fixture after a package that exists` |
| C5 | `fix(agent-presets): name the shipped preset alone wherever presets are documented` |
| C6 | `docs(plans): record the rc.1 review and its remediation ledger` |
| C7 | `refactor(cli): name the host Web Scheduler API fallback and record its rationale` |
| C8 | `refactor(plugin-manager)!: drop the bundle audience surface` |
| C9 | `refactor(client): drop fixtures the removed workbench tag left behind` |
| C10 | `refactor: drop an unreferenced socket alias and describe the audience record as legacy` |
| C11 | `feat(accounts-local): mark session cookies Secure when the public address terminates TLS` |
| C12 | `fix(scripts): scan only Git-known paths in the bilingual pairing gate` |
| C13 | `docs(i18n): pair the desktop README and refresh the Chinese tool catalog` |
| C14 | `test(scripts): register the released V4 restore package as a library` |
| C15 | `test(identity): cover concurrent first-run, registration, and sign-in` |

## P0 安全与正确性

| # | 项 | 状态 | 落地 |
|---|---|---|---|
| 1 | §5.1 `--patch` 在部署入口被静默丢弃 | **已落地** C2 | 入口拥有 `--patch` 并解析为绝对路径（子进程 `cwd` 是自己的租户目录，相对路径在那边无效），经 `tenantChildArguments` 以启动器 flag 形式置于应用参数之前。`apps/cli/tests/tenant-runtime.spec.ts` 断言顺序与内容 |
| 2 | §4.3 `--tls-cert`/`--tls-key` 被丢弃（fail-open） | **已落地** C2 | 入口自己终止 TLS：成对给出才接受，文件读不出来即失败退出，绝不退回明文；与 `--per-account-ports` 互斥（按账户分发的 origin 是明文）。地址、`/status` 与文档同步为 `https` |
| 3 | §4.1 首启接管窗口 + 默认 `registration: open` | **已落地** C1 + C2 | 入口按绑定地址定默认：loopback 上 `open`，其他地址 `closed` 并打印提示（`qilin tenants add`）；`setup` 端点接入 `registration`，closed 时回 403 `registration-closed`，不再由产品表单创建第一个账户；`--host` 拒绝通配地址（与 web 应用同规） |
| 4 | §4.2 名册并发写 | **已落地** C1 | `AccountStore` 每次变更在文件旁取独占锁、重读、再原子替换；锁有等待上限与过期判据（`LOCK_STALE_MS` 长于 `LOCK_TIMEOUT_MS`，避免等待者自己把活锁判成残留）；`add()` 在临界区内判定用户名/邮箱唯一并抛 `AccountConflictError`；新增 `initialize()` 在临界区内判定空名册 |
| 5 | §5.10 与在途写入者对齐后重验首启路径 | **已落地** | 在途改动已由另一写入者提交；本次在提交后的树上重跑 `apps/cli/tests` 与 `packages/identity/accounts-local/tests`，`/api/auth/status` 与静态资源按原路径转发（`tenants.ts` 单请求单次名册读） |

## P1 计划完整性与死面

| # | 项 | 状态 | 落地或缺口 |
|---|---|---|---|
| 6 | §3.1 三个构建残留目录 | **已落地** C4 | `packages/client/ui-workbench`、`packages/subagent/subagent-claude-code`、`packages/subagent/subagent-codex` 三个目录（只剩 `lib/` 与 `node_modules/`，`git ls-files` 为 0，无 manifest）已删除，`npx tsx scripts/check-workspace-constraints.ts` **exit 0**；指向已删包的临时夹具改名见 C4。`website/.generated`、`website/.dist`、`desktop/staging` 仍含旧包引用，但都被 gitignore，由各自的构建重新生成 |
| 7 | §3.2 audience 宿主面 | **已落地** C8 + C10 | 按 C6=a 补完：`setAudience`（Remote）、`writeAudience`、`PluginAudience`、`BundleInfo.audience`、`InstallBundleOptions.audience`、`listBundles` 的 audience 读出、`selectBundle` 的 audience 参数与写回、`packages/api/remotes` 的再导出、以及 `manager.spec.ts` 的 setAudience 用例与客户端夹具的 `setAudience: vi.fn()` 全部删除；生成件 `api-catalog.ts` 与 `docs/subsystems/boot.md` 双语区域用 `gen-kylin-api` 重生成（`--check` 通过）。**保留**：manifest 的 `qilin.profile.audiences` 仍是 `app-boot` 判定「这层归 profile 所有」的信号，其 JSDoc 已写明只有仍提供该选择的旧版本会写它 |
| 8 | §3.3 `TenantTarget.entry` 死字段 | **已落地** C2 | 代理目标收敛为 origin；`relayUpgrade`/`proxyRequest` 签名与 `tenant-proxy.spec.ts` 同步 |
| 9 | §3.6 悬空快照 pin + §2.4 退役表述 + `verify-preset-copy` 作用域 | **部分落地** C5 | 悬空 pin 已消除（`subagent-acp-diagnostic` 不再指向已随产品后端删除的 `product-subagent-codex`，改为自持）；CLI reference 中英、GitHub 评审指南中英、base 组合包 README 中英、`permission-policy-context` 注释、webhook 车道夹具与断言、以及随 ptc 预设下发给模型的 `editing-cordis-compositions/SKILL.md` 都已改名为 `ptc`（那条夹具此前请求已退役的 `minimal`，属 §2.5 的潜伏断裂）；门已扩到 7 个契约文件，除「id 紧邻 preset」「`agentPreset` 取值」外还拦「一行枚举两个退役 id」，两条负向对照都实跑过（改名即红并指名 file:line）。**未做**：§2.4 的包 README 同族旧表述（`docs/rescope.md` 政策豁免其散文）；`docs/session-format-status.md` 的 V5 finalization/release 记录（要 V5 检查点与确认记录，属持久化台账流程，不能半改）；`subagent-acp-diagnostic` 的 `system-prompt.expected.md` 边车与整场景重录（需 `QILIN_SNAPSHOT=record` 与真实 key，归 §6 的 red） |
| 10 | §3.4 每请求多次读名册 | **部分落地** C2 | `handle` 每请求只读一次名册并全程复用（同一请求一个视图）；跨请求缓存未做——外部写入（`tenants add`）必须被看见，缓存需要签名失效，留待真正需要时再做 |
| 11 | §5.3 历史会话认领入口 | 待决策 | 新布局把 `$QILIN_HOME/sessions` 换成 `tenants/<账户>/sessions`，旧会话在应用里不可见。需要产品决定认领形态（首个账户自动认领 / `qilin tenants claim <账户>` / 启动时提示），再落代码与迁移器 |
| 12 | §4.7 `--purge-data` 永假守卫 + `IDENTITY_PATTERN` 允许 `..` | **已落地** C3 | 身份校验收敛为一个导出的 `isTenantIdentity()` 并拒绝 `.`/`..`；`removeAccount` 的 `rm -rf` 前同时要求该规则与「父目录就是本部署的 `tenants` 根」，新增用例证明旧比较恒真时会把 `tenants/../outside` 删掉 |

## P2 清晰度与契约

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 13 | 被拒 reload 是否回滚 | 待决策 | 两版实现已在真实 Web 车道回退（计划 §16）；要先裁定契约措辞，再重写 `web-failure-matrix` 的 8 条断言 |
| 14 | §3.5 `bin.ts` 的 `scheduler` 补丁理由移入 Agent Note | **已落地** C7 | 兜底抽成 `apps/cli/src/scheduler-yield.ts`（`installSchedulerYield()`，JSDoc 只写契约并链到 Agent Note），入口在顶部调用、注释只剩一句契约；`desktop/package/app/host/main.mjs` 的同一决定也改为一句契约并链同一篇 Note。新增 [Agent Note](../../.agents/notes/implemented/architecture/2026-10-07-web-scheduler-yield-host-shim.md)（中英 + 记录）说明为什么这个全局兜底留着。**新发现**：三处调用点（`api-session-controller` 冷列表、`session-persistence-jsonl` 分片让路）现在都从 `node:timers/promises` 导入 `scheduler`（Node 17.3 起提供，`@types/node` 注释为证），所以仓内已无消费者；兜底保留的理由是进程级失效防护（移植模块与第三方插件可能裸读该全局），Node 24.18 实测无该全局、Electron 44 内置 Node 24。新增 `apps/cli/tests/scheduler-yield.spec.ts` 3 例（越过微任务让路、宿主自带不被覆盖、重复安装为空操作） |
| 15 | §4.6 登录限流 / §4.7 cookie `Secure` 条件 | **部分落地** C11 | `Secure`：`SessionCookies` 增加第三个参数，`accounts-local` 增加 `sessionCookieSecure`（默认 false，进入 config catalog 与双语 README），hub 自己终止 TLS 时给每个运行时写进租户层（`tenantPatchYaml`/`bootstrapPatchYaml` 第二个参数，`tenants.ts` 由 `options.tls !== undefined` 推导）——不能靠运行时自己的 socket 判断：它说的是 loopback 上的明文 HTTP。用例：`session.spec.ts`（带/不带 `Secure`）、`tenant-runtime.spec.ts`（两种层文档）、`auth-surface.spec.ts`（真组合下 setup 与 logout 都带 `Secure`，14/14）。**未做**：登录限流/退避——需要产品口径（阈值、窗口、是否锁定账户），留待裁定 |
| 16 | §4.7 非 loopback 绑定告警 + 文档分开写 hub 与租户地址 | **部分落地** C2 | 入口在非 loopback 绑定上打印可达性事实；文档已说明租户运行时只绑 loopback |
| 17 | §7 五条并发/共享写用例 | **部分落地** C1 + C15 | 名册并发写：C1 的单元用例（同一进程并发、两个写者各持旧快照、锁等待、过热锁过期、等待超时、空壳锁路径）。真组合 HTTP 车道：C15 新增三例——两个首启 setup 并发只产生一个账户（另一个得 409 `already-initialized`，其用户名无法登录，赢家的会话可用）、两个注册并发都存活、两个账户同时登录各自带自己的会话过门禁。负向对照实跑：把 `initialize()` 临界区里的空名册判定改成恒假，该用例变红（1 failed），恢复后 17/17。**仍缺**：`makeRoom`/`--max-tenants` 的回收竞态、坏 profile 下的串行阻塞、>2 账户与回收抖动——三者都要 supervisor 装配测试台或真进程车道，本轮未建 |
| 18 | §5.8 schedule 能力是否进入出厂部署 | 待决策 | 影响判据 2 的可验证性 |
| 19 | §3.7 夹具与注释残留 + §2.4 文档口径 | **已落地** C9 + C10 | 四处 `ctx.provide('workbench', …)`（`ui-schedule`、`ui-sidebar-right` 的 apply 与 seat、`ui-sidebar-documentpreview`）与它们「dual-workbench D5」注释删除；`WorkspaceBrowser` 的 `id="workbench-list-panel"` 删除（全仓零消费者）；`SidebarRight.module.css` 的注释改为描述 dockkit 自身；`UpgradeSocket` 与其 `node:net` 类型导入删除；`manager-store.client.spec.ts` 的 `setAudience` 假实现随 C8 消失。**已由在途提交修好、本轮复核确认**：`tenant-runtime.ts` 的 `IDENTITY_PATTERN` 注释文字与 `bootstrapPatchYaml`/`tenantPatchYaml` 的 JSDoc 归属、`tenants.ts` 的 `hubOwnRoute` 恒假析取。**登记未动**：`packages/client/connection/src/client/fixture.ts` 零 importer（是否作为离线开发面保留需人工确认）；`snapshots/session/skill-load/**` 内嵌 NMO 前技能正文（需真实 key 重录）。**文档口径（C12–C14）**：配对门禁只扫 git 已知路径；`desktop/README.md` 补齐英文源、中文挪到 `README.zh.md`（两侧带切换器与逐字节一致的代码块）；`docs/tool-catalog.zh.md` 的四个 subagent section 按当前英文重写；`session-format-v4-to-v5` 补进已审计库登记表——至此全仓配对门禁 1097 对全绿 |

## 本轮新增发现（复核清单之外）

| 项 | 落地 |
|---|---|
| 部署入口 `--help` 从不打印：launcher 的 `helpOption(false)` 让它落进应用参数，入口又忽略它，`qilin web --help` 会直接开始服务 | **已落地** C2：入口自己回答 `-h`/`--help`，列出部署 flag 并说明其余参数交给各运行时 |
| 应用 flag 与拼错的 flag 一律被静默吞掉 | **已落地** C2：入口只消费自己的 flag，其余（如 `--trusted-host`）透传给每个运行时的命令行 |
| 就绪判定把 stderr 与 stdout 混进同一缓冲 | **已落地** C2：按 stdout 完整行匹配，stderr 只进诊断；失败详情不再携带带 launch token 的 stdout |
| `--from-default-profile` 在部署入口毫无效果（shipped profile 必被拒绝） | **已落地** C2：入口明确拒绝并说明原因 |
| webhook 真实车道的夹具与断言请求已退役的 `minimal` 预设 | **已落地** C5（§2.5）：该车道需真实 key 且 `QILIN_GITHUB_*`，属潜伏断裂，不在任何常规门禁里显形 |
| 宿主 Web Scheduler API 兜底的实际消费者已不存在（三处调用点都改为 `node:timers/promises` 导入） | **已登记并留证** C7：兜底按「进程级失效防护」保留，理由与移除条件写进 Agent Note；仓内不再有裸读全局的代码 |
| 文档门禁把 gitignore 的构建残留也当作维护文件扫描 | **已落地** C12：语料改为「git 知道的路径」（索引 + 未被忽略的未跟踪文件），git 读不出的树保留全部发现，避免语料被收窄为空；`scripts/translation-pairing.spec.ts` 新增夹具证明被忽略的残留不在结果里、未跟踪但未忽略的文件在。这一条此前让门禁常红 36 行 |
| `docs/tool-catalog.zh.md` 的四个 subagent section 落后于英文（仍描述已删除的 `run_in_background` 与旧的中断/列举/发消息语义） | **已落地** C13：按当前英文重写这四节的中文并重录记录；`gen-tool-catalog` 只写英文源，中文对照由人工维护 |
| `desktop/README.md` 以英文源名承载纯中文内容，是配对语料内唯一没有对照的 README | **已落地** C13：英文成为源，中文挪到 `desktop/README.zh.md`，两侧带切换器与逐字节一致的代码块，配对记录已录 |
| `plans/2026-10-11-multi-user-tenancy.md` 在维护文件里写了 13 处裸提交号，`verify-repository-references` exit 1 | **登记未动**：那是另一写入者的计划文档，「提交号 → 改动」对照表是它的账目主体；修法与台账同款（改用提交主题），但那是仍在写的文档，留给其所有者或下一轮 |
| `packages/session/session-format-v4-to-v5/README.md` 被判 `kind` 不合规 | **已落地** C14：该包与其同族迁移包一样是库，只是没进 `scripts/doc-standard.spec.ts` 的已审计库登记表；补登记后 `doc-standard.spec.ts` 22/22 |
| `apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts:828` 有既有 lint 报错（模板串多余） | **登记未动**：本轮未触碰该文件 |
| 登录限流缺失、被拒 reload 的回滚契约、历史会话认领形态、schedule 是否出厂 | **待决策**（见 §11/§13/§18 与上表） |

## 本轮未做的验证（如实登记）

- 真进程 e2e 租户车道（`tenant-supervisor` / `tenant-isolation`）本轮未跑：需要构建产物与真实引擎。
- C11 的 hub→运行时接线（`options.tls !== undefined` → 租户层的 `sessionCookieSecure: true`）只有两层单元证据（层文档文本、cookie 属性）与真组合下的 cookie 断言，没有一条用例从「带 `--tls-cert` 的 hub」走到「运行时签发的 cookie 带 `Secure`」；该补丁没有单元级的 supervisor 装配测试台。
- §7 剩下的三条并发面（`makeRoom`/`--max-tenants` 回收竞态、坏 profile 串行阻塞、>2 账户）复核时就没有测试台，本轮仍未建：它们需要 supervisor 级别的装配测试（或真进程租户车道），不是身份面能覆盖的。
