# 从 3.1.4-rc.1 到现行实现的整改报告

日期：2026-10-11 · 复核输入：[设计复核](2026-10-11-rc1-to-current-design-review.md) · 逐项台账：[整改台账](2026-10-11-rc1-remediation-plan.md)

本报告是整改的结论视图：修了什么、按什么证据判定、还剩什么。**每项的落地细节与提交标号在台账里**，本报告不重复。

## 1. 结论

复核列出的 P0 全部落地，P1/P2 中可执行的项全部落地；**文档门禁从「21 项里 3 项常红」变为全绿**，死面（audience 无消费者链、悬空 socket 别名、失效夹具与注释）清空，账号面补上了并发与限流的行为保证。剩余项只有两类：**需要你拍板的产品决定**（3 条）与**需要先建测试台的并发面**（3 条），另有 2 条已登记的让步。

| 维度 | 复核发现 | 处置 | 主要证据 |
|---|---|---|---|
| 安全 | `--patch`/TLS 被入口静默丢弃、首启接管窗口、名册并发写、`--purge-data` 永假守卫、`IDENTITY_PATTERN` 允许 `..` | 全部修复 | `apps/cli/tests` + `accounts-local/tests`；名册并发的两个写者用例；purge 的否定用例 |
| 安全（本轮新增） | 登录无任何刹车 | 按 authority + 标识符限流 | 单元 7 例 + 真组合 3 例 + 负向对照 |
| 功能断点 | `--patch` 丢失、首启需二次登录、历史会话不可达、`--help` 不打印、未知 flag 静默吞、就绪判定混入 stderr | 前两项已修；历史会话认领待决策 | 入口自身回答 `--help`；未知参数透传；就绪按 stdout 整行匹配 |
| 死代码与冗余 | 三个构建残留目录、audience 无消费者链、`TenantTarget.entry`、`UpgradeSocket`、四处 `workbench` 夹具、`workbench-list-panel` | 全部删除 | `check-workspace-constraints` exit 0；生成件用 `gen-kylin-api` 重出并对账通过 |
| 计划准确度 | 退役预设的表述与夹具、悬空快照 pin、`verify-preset-copy` 作用域 | 已修 | 门扩到 7 个契约文件；两条负向对照实跑 |
| 文档与夹具口径 | 配对门禁扫 gitignore 残留、中文 tool catalog 落后、desktop README 无对照、`session-format-v4-to-v5` 未登记 | 全部修复 | `pnpm run test:docs` **21/21** |
| 并发验证 | 名册并发写无覆盖；登录/首跳、首启并发、上限回收无覆盖 | 名册与首启/注册/登录已覆盖 | 真组合 HTTP 3 例 + 负向对照；回收竞态等 3 条待建测试台 |

## 2. 怎么自己复核一遍

按改动面从小到大（每条命令都在本机实跑过，均不推送）：

```sh
# 身份面：名册并发、首启竞态、登录限流、cookie 属性（57 例）
npx vitest run packages/identity/accounts-local/tests

# 部署入口与租户：flag 解析、TLS、--patch 传递、层文档、代理目标
npx vitest run apps/cli/tests/tenant-runtime.spec.ts apps/cli/tests/tenant-proxy.spec.ts apps/cli/tests/web-entry.spec.ts apps/cli/tests/tenants-roster.spec.ts

# 文档与脚本门禁（21 项）
pnpm run test:docs

# 残留目录常备门（整改前 exit 1，三条报错）
npx tsx scripts/check-workspace-constraints.ts

# 四份生成件的新鲜度
npx tsx scripts/gen-kylin-api.ts --check && npx tsx scripts/gen-kylin-catalog.ts --check \
  && npx tsx scripts/gen-config-catalog.ts --check && npx tsx scripts/gen-tool-catalog.ts --check
```

## 3. 安全（P0 与后补）

**入口不再丢参数。** 部署入口拥有 `--patch` 并解析为绝对路径交给每个运行时（子进程 `cwd` 是自己的租户目录，相对路径在那边无效）；`--tls-cert`/`--tls-key` 由入口自己终止 TLS，成对给出才接受、文件读不出来即失败退出，绝不退回明文，与按账户分发端口互斥。

**首启不再是「先到先得」。** 入口按绑定地址定默认注册策略：loopback 上开放，其他地址关闭并打印运维提示；`setup` 端点接入注册策略，关闭时回 403 `registration-closed`；`--host` 拒绝通配地址。**名册写入串行化**：每次变更在文件旁取独占锁、重读、原子替换，锁有等待上限与过期判据；用户名/邮箱唯一性与「名册为空」都在临界区内判定——两个并发的首启提交只产生一个账户。

**路径校验不再恒真。** `--purge-data` 的守卫改为「身份合法 + 父目录就是本部署的 `tenants` 根」，并有用例证明旧比较恒真时会把 `tenants/../outside` 删掉；`IDENTITY_PATTERN` 收敛为导出的 `isTenantIdentity()` 并拒绝 `.` 与 `..`。

**登录有了刹车（本轮）。** `loginMaxAttempts`（默认 10）次失败落在 `loginAttemptWindowSeconds`（默认 900）内，该键的后续尝试回 429 `too-many-attempts` 并带 `Retry-After`；登录成功或窗口过期都会清零；**不指向任何账户的标识符照同样方式计数**，因此这道限制不是名字探测。计数器活在该账户自己的运行时里，也就是该账户的限制。

**会话 cookie 的 `Secure` 由部署决定。** 入口自己终止 TLS 时给每个运行时写 `sessionCookieSecure: true`——不能读运行时自己的 socket，因为它说的是 loopback 明文 HTTP。

## 4. 功能断点

已修：部署入口丢弃 `--patch`；`--help` 从不打印（launcher 的 `helpOption(false)` 让它落进应用参数）；应用 flag 与拼错的 flag 被静默吞掉（现在只消费入口自己的 flag，其余透传）；就绪判定把 stderr 混进同一缓冲（现在按 stdout 整行匹配，失败详情不再携带带启动令牌的 stdout）；`--from-default-profile` 在入口无效（现在明确拒绝并说明原因）。

待决策：**历史会话认领**。新布局把 `$QILIN_HOME/sessions` 换成 `tenants/<账户>/sessions`，既有单用户的历史会话在应用里不可见。需要你选形态（首个账户自动认领 / `qilin tenants claim <账户>` / 启动时提示），再落代码与迁移器。

## 5. 死代码与冗余

删除：三个只剩构建残留的目录（`ui-workbench`、`subagent-claude-code`、`subagent-codex`，常备门随之复绿）；audience 的整条无消费者链（Remote 方法、私有写实现、`BundleInfo.audience`、安装选项、客户端再导出、客户端假实现、列表读出）；`TenantTarget.entry`；`UpgradeSocket` 与其类型导入；四处给已删工作台标签的 `ctx.provide('workbench')` 与其注释；`workbench-list-panel` 元素 id；rightbar 样式里解释已退役内容体的注释。**保留并写明**：manifest 的 `qilin.profile.audiences`——`app-boot` 仍把它读作「这层归 profile 所有」的信号。

**一项需要你知情的判断**：宿主 Web Scheduler API 兜底（`globalThis.scheduler`）在仓内**已无消费者**——三处调用点现在都从 `node:timers/promises` 导入。它被保留为面向进程内其余代码（移植模块、第三方插件）的宿主能力保证，理由与移除条件写进了 Agent Note；Node 24.18 实测无该全局，桌面壳内置的 Electron 44 也带 Node 24（已查实）。

## 6. 计划实施准确度

按复核的口径，计划里 T1–T6/T9 完全落地，T8/A7 部分落地（门的作用域窄于验收断言）；判据 2/4/7 有口径或覆盖缺口。本轮未改这些判定，只清掉了它们周围的口径漂移：退役预设的表述在 CLI reference 中英、GitHub 评审指南中英、base 组合包 README 中英、permission-policy 注释、webhook 车道夹具与断言、以及随预设下发给模型的技能正文里全部改为 `ptc`，门扩到 7 个契约文件并带两条负向对照。

## 7. 文档与夹具口径

- **配对门禁**的语料改为「git 知道的路径」（索引 + 未被忽略的未跟踪文件）：构建残留不再被当作维护文档，单这一类此前常红 36 行；git 读不出的树保留全部发现，避免语料被收窄为空。
- **桌面 README** 原本以英文源名承载纯中文内容：英文成为源，中文挪到 `desktop/README.zh.md`，两侧带切换器与逐字节一致的代码块。
- **中文 tool catalog** 的四个 subagent section 仍在描述已删除的 `run_in_background` 与旧的中断/列举/发消息语义：按当前英文重写并重录记录。
- **`session-format-v4-to-v5`** 被判 `kind` 不合规的根因是它没进已审计库登记表（同族迁移包都在里面），补登记后该 spec 全绿。
- 另一写入者的多用户计划含 23 处裸提交号：按门禁既有的窄豁免形态加一条带理由的单文件豁免（该节记录的是一轮尚未推送的本地提交，没有 tag/PR 可引用），其余 `plans/` 仍在检查范围。
- 结果：`pnpm run test:docs` **21/21**；`verify-md-wrap` 2208 文件、`verify-md-links` 2187 文件、`verify-doc-refs` 3787 文件全过。

## 8. 并发验证

已覆盖：名册并发写（同进程并发、两个写者各持旧快照、锁等待、过热锁过期、等待超时、空壳锁路径）；真组合 HTTP 上两个首启 setup 并发只产生一个账户、两个注册并发都存活、两个账户同时登录各自过门禁——**首启竞态的用例带负向对照**（把临界区里的空名册判定改成恒假即变红）。

未覆盖（都要先建 supervisor 级装配测试台或跑真进程车道）：`makeRoom`/`--max-tenants` 的回收竞态（两个同时到达的交接是否会各自放行、把正在启动的运行时当作可回收对象）、坏 profile 下的串行阻塞、>2 账户与回收抖动。

## 9. 待你拍板（3 条）

1. **历史会话认领形态**（§5.3）——对既有单用户影响最大的一条。
2. **被拒的 reload 是否回滚**（§13）——决定 `web-failure-matrix` 的 8 条断言按哪种契约重写；两版实现已在真实 Web 车道回退，代码面无残留。
3. **schedule 是否进出厂部署**（§18）——影响判据 2 的口径。

## 10. 登记的让步与覆盖缺口

- **限流不限横向喷射**：轮换标识符的攻击者遇不到共享限制（本部署不保留按 authority 汇总的计数），已写进 `accounts-local` 的 Known Limitations；要收口需要新配置项与产品口径。
- **每请求多读名册**只收敛到「同一请求单次读取」，跨请求缓存未做——外部写入（`tenants add`）必须被看见，缓存需要签名失效。
- **hub→运行时的 TLS 接线**只有两层单元证据（层文档文本、cookie 属性）与真组合下的 cookie 断言，没有一条用例从「带 `--tls-cert` 的 hub」走到「运行时签发的 cookie 带 `Secure`」。
- **真进程租户车道**（`tenant-supervisor` / `tenant-isolation`）本轮未跑：需要构建产物与真实引擎。
- **未收口的既有红**（不在本轮改动面）：SDK 快照 6 项、`subagent-acp-diagnostic` 快照、`present`/`ptc-escalation`/`ptc-round` 陈旧夹具、`schedule-after`/`schedule-panel` 孤儿车道、四条需真实 key 的重录，以及 `apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts` 里一处模板串 lint 报错。
