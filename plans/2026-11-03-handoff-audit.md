# 2026-11-03 交接与遗留问题审计

- 审计基线：HEAD 停在 rc.4 发布与遗留登记（tag v3.1.8-rc.4），时间 2026-11-01。
- 方法与边界：三条只读审计并行（工作树与门禁、plans 与 Agent Notes、TODO 债与 lane 已知红）后实测复核；明细见 `.tmp/handoff-analysis/` 下三份报告。本轮未跑 web 浏览器 lane 与快照 lane（需非沙箱宿主与长窗口），lane 数字一律引自计划内的实跑记录并标注出处。

## 一、结论

1. **rc.4 之后的修复全部停在工作树。** 13 个已修改文件加 3 项未跟踪（新 spec、本交接计划、`.tmp/` 目录）未提交；未提交即未收口，任何「已修」说法目前都只是候选落地。
2. **交接文档方向准确，但有六处不实或漏报**，最要紧的是漏报 lint 门与 per-file 覆盖率门的红。按它建议的三笔直接落笔，两门会红。
3. **账面有 11 处过期或自相矛盾的登记**，其中同一份计划并存四套 web e2e 基线数字。下一位读者照账簿行动会踩到已被撤回的结论。
4. **代码债很小，测试债很大。** 全仓只有 1 条 FIXME 且已陈旧；真正的欠账是测试 lane 的已知红，而它没有机器可读名单，只散落在 plans 散文里。

## 二、工作树与门禁实况

工作树：13 个已修改文件、2 项 `.tmp/` 之外的未跟踪文件（`packages/client/ui-chat/tests/chat-flow-focus.client.spec.tsx`、本目录的交接计划）、`.tmp/` 下 66 项草稿与审计产物。

| 门禁 | 结果 | 关键输出 | 耗时 |
| --- | --- | --- | --- |
| `tsc -b tsconfig.host.json` | 绿 | 本次有实质重建 | 5.4s |
| `tsc -b tsconfig.client.json` | 绿 | 增量 no-op | 0.9s |
| `vitest run packages/client/ui-chat` | 绿 | 798/798（60 文件），含新增流级恢复用例 | 7.7s |
| `vitest run packages/client/ui-chat --coverage` | **红** | `stores.ts` statements 96.29% / branches 93.1%，未覆盖 78-79 行 | 约 60s |
| `pnpm run test:docs` | **红** | 21 门 20 过 1 红，唯一红为 repository references | 33.3s |
| `pnpm run verify-repository-references` | **红** | 3 处裸提交哈希，全在 `.tmp/commit-msg14.txt` 与 `commit-msg19.txt`；已跟踪文件 0 命中 | 7.1s |
| oxlint（改动涉及的 4 个源文件） | **红** | 4 errors：`arrow-parens` 1、`indent` 1、`no-unnecessary-condition` 2 | 2.5s |

`pnpm run build` 本轮未复跑。间接证据：`.qilin-build/client-build-environment.json` 记 439 个客户端产物，写入时间晚于最后一次源码改动，与交接文档的「整树 build 绿」自洽，但不等于本轮的实跑结论。

**为什么 `.tmp/` 会一直红：** 该门禁用 `git ls-files --cached --others --exclude-standard` 取文件，未跟踪但未被忽略的文件同样进扫描。`.gitignore` 只有 `tmp/` 一行，不匹配 `.tmp/`；把审计草稿写进 `.tmp/` 会不断给它新增命中（本轮三份审计报告里已有一份因此又添两处）。

## 三、交接文档的六处偏差

| # | 文档说 | 实测 | 影响 |
| --- | --- | --- | --- |
| 1 | 「13 个已修改文件未提交」 | 16 项：13 改 + 新 spec + 新计划 + `.tmp/` | 按 13 文件清单提交第 1 笔会漏掉本轮新增的流级恢复用例 |
| 2 | 未提 lint | oxlint 4 errors；`ChatNodeSeat.tsx:132` 两处 `no-unnecessary-condition` 是死守卫（`processSpec`、`routedNode` 在该作用域已收窄） | 落笔即红门，且死守卫说明作者对该处类型收窄判断有偏差 |
| 3 | 未提覆盖率 | `stores.ts` 78-79 行（`consumeTurnProcessFocus` 无记录早退）零覆盖 | per-file 100% 覆盖率门在 ui-chat 上红 |
| 4 | 未提文档门 | `test:docs` exit 1 | 与计划内已登记的「HEAD 即红」一致，属漏报而非判断错误 |
| 5 | 「整树 build 绿」 | 本轮只跑了两面 `tsc -b`，未复跑 build | 结论方向一致，但证据强度弱于文档语气 |
| 6 | 红因是「plans 裸哈希 + `.tmp/` 草稿」 | plans 已清干净，3 处全在 `.tmp/` | 处置范围更窄：清 `.tmp/` 即整门转绿 |

## 四、遗留项分档

**A 档：无 key、无产品决策，本轮可收**

1. 落三笔提交，第 1 笔按 7 个文件显式 `git add` 未跟踪的新 spec。
2. 修 lint 4 处：两处格式、两处死守卫（删守卫或改判真正的空源）。
3. 补 `stores.ts` 78-79 两个分支的覆盖。
4. 处置 `.tmp/`：在 `.gitignore` 补一行 `.tmp/`（同时转绿文档门与引用门），或清掉 `commit-msg*` 草稿。
5. FIXME 清零：删 `packages/guard/timeout-policy/src/index.ts` 的模块头 FIXME 与中英 README 各一处引用（改名台账已定现名，属陈旧）。

**B 档：需一次小决策**

- `shipped-composition` 5 例：期望的工具清单含 `run_code`，现行 web 组合不含——改期望还是补组合。
- `background-job-list` 2 例：现行 `tool-bash` 的 background 分支把 `jobId` 声明为 required 并实际返回，源码与「后台 bash 不返 job id」的产品回归判断相反，更可能是期望漂移，应按 e2e 定性销项。
- `subagent-multi`：pinned v0，是两项 coverage 的唯一提供者——迁移覆盖，还是新增并行场景。
- experimental hooks 双包是否继续维持：一个决定可关掉 6 条同文 TODO。

**C 档：需 key 或长窗口**

- web e2e 的 B 族约 10 例（`changed-files-turn`、`file-upload-round`、`steering`、`subagent-interrupt-ui`、`details-session-lifecycle`）：根因是录制与驱动的调用序列漂移（工具面改为 `run_code` 直调、live 侧新增 skill-catalog 提醒），需带 key 重录。
- 快照 lane 5 红：两个 advanced-toolchain 需人工重写期望，两条子代理场景需新模型响应，`subagent-multi` 见 B 档；另有 `subagent-spawn-in-process` 约 1/12 的顺序竞态。
- web e2e 超时家族约 8 例与散点约 20 例：逐个按「期望漂移 / 产品缺陷 / 环境」二分，不要并行摊开。

**D 档：需特定环境**

- 真实执行工具的 spec 只能在非沙箱宿主跑（宿主沙箱下 bash 工具无法嵌套沙箱）。
- playwright：`apps/web` 解析到 1.61.1，要求 chromium 与 headless-shell 都是 1228；缓存里 chromium 1228 已是完整安装，但 `chromium_headless_shell-1228` 仍是指向 1243 的 symlink（跨 Chrome 149 与 153 两代）。这是潜在的等待类 flake 源，未在本轮验证。

**E 档：版本工程**

- pnpm 跟随稳定线：四处 pin 全为 11.23.0（根 `packageManager`、根 devDependency、`apps/desktop`、`native/system`），锁文件 lockfileVersion 9.0 未变。升级需同步四处 pin、重生成锁文件、复跑 build 与 web lane。

**上游对齐计划的长期开放项**（不在 rc.4 清单内，出自 2026-10-28 对齐计划）：I1-I6 六个大批次未启动、F 六语言面有意只出 en/zh、P1 plugin-market 详情页未做、V vendor 升版本轮无变更。

## 五、记录质量问题

判据是「后一位读者会不会被误导」。以下为择要，完整 11 条见 `.tmp/handoff-analysis/plans-audit.md`：

| # | 冲突 | 影响 |
| --- | --- | --- |
| 1 | 同一份 rc.3 计划并存四套 web e2e 基线：56 文件 93 例 / 53 文件 87 例 / 59 例 / 50 失败 395 通过；且 50+395+17=462 与 lane 总数 464 差 2 | 无法判断「当前基线」，也无法度量某一笔修复的收益 |
| 2 | rc.4 第 1 项在已提交段落被判为「产品缺陷、优先」，未提交段落又写「未复现、由 ui-settings-plugins 注册」 | 按提交版本阅读会拿到已被撤回的结论 |
| 3 | rc3-contract-packages 判 official-bundles「不重复移植」，次日 rc3-remaining 决定建契约包并已落地 | 同一包两份相反结论 |
| 4 | message-quotes、ui-workspace 共享原语在旧计划里仍是「待拍板 / 延期」，实际已由替代路径落地 | 读者会重复已完成的决策 |
| 5 | 三处「工作树未提交」全部过期（forge-panel、contract-packages、splash），对应提交已落地 | 诱导重做已完成的工作 |
| 6 | rc3-plugin-cards 的勾选状态与执行状态矛盾：`[ ] git rm` 未勾，包目录已不存在 | 待办项不可信 |

另有一项结构性债：**仓库没有机器可读的 known-red / known-flaky 名单**。红项只写在 plans 散文里，任何一次重写计划都会让已知红失去登记。

## 六、TODO 债

`packages/` 与 `apps/` 内标记行 64 / 54 文件；排除构建产物后回查，0 行落在 `node_modules`、`lib`、`dist`、`.qilin-build`、`.desktop-build`。按 `docs/development.md` 的紧急度口径拆分：

- 真实代码注释 42 行 / 34 文件：FIXME 1、TODO 37、XXX 4。
- 其余 22 行是 README 引用叙述（15）与测试夹具、提示词字面量（7），随代码清理时会一起过期。

唯一 FIXME 是「把 `@qilin-agent/tool-call-timeout-policy` 改名为 `timeout-guard`」的建议，而改名台账已把现名记为既定名，属陈旧标记。债集中三处：shell/terminal 9 条、experimental hooks 10 条（含 2 条测试标题）、client UI 6 条。可一次性收口的重复家族：`TODO(hook-continue-false)` 2、`TODO(stop-loop-guard)` 2、`TODO(per-session-hook-config)` 2、`TODO(background-infrastructure-outcome)` 2、bash/pwsh 持久终端的镜像对 4。

## 七、建议顺序

1. 先做 A 档（约半小时），把工作树从「红了四门」拉到「可提交」。
2. 按修正后的口径落三笔：第 1 笔 7 文件（含新 spec），第 2 笔语音两例，第 3 笔图标断言与 cookbook；交接计划本身随任一笔记入或单独一笔。
3. 就 B 档的三次决策各要一句结论（组合面、background-job-list、subagent-multi），决策一到即可落 6 例左右。
4. 把 rc.3 计划重写为「rc.5 待办」与「历史」两节，并在文件头固定一次权威 e2e 数字（通过/失败/跳过三元组），旧数字下移历史节。
5. proposed 下 26 条全部无 implemented 对应件：13 条有回指可留，13 条零回指且无代码痕迹，逐条做或 rejected，其中会话重构 5 条建议合并重写。
6. C 档等有 key 与非沙箱宿主的窗口再动，不要与 A、B 并行摊开。

## 八、A 档执行结果（2026-11-03，已完成）

- 七笔提交，按主题拆分：`chore(repo)` 忽略 `.tmp/`；`fix(chat)` 分组级焦点保持（含新流级用例与存储分支覆盖）；`docs(guard)` 清掉陈旧改名 FIXME；`test(web)` 语音场景跟进现行入口；`test(web)` 链接图标断言；`docs(cookbook)` 设置卡片入口；`docs(plans)` 本审计与上一轮交接。
- 门禁复跑（全部实跑）：改动文件 oxlint 0 error；`tsc -b tsconfig.client.json` 绿；ui-chat 801/801，`stores.ts` 与 `client/chat` 组的语句、分支、函数、行覆盖均为 100%；`test:gui` 685 文件 10525 通过 1 跳过；`test:docs` 21/21；`verify-repository-references` 绿；整树 `pnpm run build` 绿（439 个客户端产物）。
- 未跑：全量 `test:coverage` 分区门、web 浏览器 lane、快照 lane，原因见文首边界；快照 lane 的构建新鲜度守卫已由本次整树 build 刷新。
- 一处计划外事实：包 README 的骨架门（`doc-standard`）要求`### Dev Note` 恒在，因此 FIXME 清理不能整段删除开发备注，改为模板的「无待决项」形态并重录配对账本。
- 剩余项未动：B、C、D、E 档与上游对齐长期项（第四节），按第七节顺序推进。

## 九、B 档第一项执行结果（shipped-composition，2026-11-03，已完成）

- 决策口径：改组合——让场景按它自己注释假设的 PTC 呈现组装，而不是把断言削到默认组合上。
- 落地：五处脚手架改用既有的 `toolsMode: 'ptc'` 组合接缝；主用例的 agent 同时改挂 `ptc` 预设（`EXPECTED_TOOLS` 描述的就是该预设的目录）。三处过期期望按现状校正：目录补 `plugin_manager`、文件引用提示词夹具重录（`present` 文件卡片指引落地后的文本）、后台作业 id 断言跟进 `bash-<16 位十六进制>`。
- 实测：该文件 8 例中 5 例通过（此前 2 例通过、6 例失败）。
- 余下三例的定性：
  - 2 例属宿主沙箱限制——后台 bash 用例报 `sandbox-unavailable: sandbox_apply: Operation not permitted`，Auto 卸载用例报 `posix_openpt` 被拒；非沙箱宿主上应转绿。
  - 1 例为产品面缺陷，见下。

### 新发现：`backgroundMode` 已成死配置

`tool-subagent` 的 `Config` 与激活调用里都没有 `backgroundMode`（激活重构把委派迁到 `startActivation` 之后移除，配置键未同步清理）。现在的模式由 provider 能力决定：实现 `prepareContinuable` 的 provider 一律走 continuable，而 `subagent-spawn-in-process` 与 `subagent-fork-in-process` 两个本地 provider 都实现了它。

仍在声明该键的位置共 7 处：`packages/bundle/base/cordis.patch.yml` 两处（fork 那处还配着「这条 base 行保持 one-shot」的注释，与实际行为相反）、两个出厂预设各两处、`apps/web/tests/auto-review-child.overlay.yml` 一处。后果是 web 用例里那条「一次性绑定」造出来的子代理记成了 continuable，`reviews one-shot…` 用例因此红。

处置二选一，需决策：

1. 恢复一次性本地激活能力（管理器加一条 one-shot 通道，`tool-subagent` 收回 `backgroundMode` 并把模式传进激活），7 处 yml 键重新生效；
2. 承认 one-shot 由 provider 选择表达，删除 7 处死键、改掉 base 的错误注释，并把该用例改成「外部 provider 的一次性绑定」或改期其期望。

### 执行结果（backgroundMode 走 1：恢复能力，2026-11-03 已完成）

- 实现：激活规格新增 `mode`（默认 `continuable`）；管理器按 mode 冻结描述符、跳过可续专用的返回指引，并拒绝「预留子 id + 一次性」的组合；工具把 `backgroundMode` 传进激活，且只对可续模式预留子 id（一次性子 id 没有后续消息可寻址）。README 配置表中英补该字段并重录配对。
- 组合面：7 处声明重新生效——基础组合的 fork 行回到一次性（与其注释一致），两个出厂预设显式声明可续。
- 实测：`packages/subagent` 774 通过（含新增的两条一次性用例）、`packages/preset` 214 通过、host/client 两面 tsc 绿、整树 build 绿、`test:docs` 21/21、oxlint 0 error。
- 一次性 / 可续 / 冷恢复子代理一例：已收口，见下节。

### 收口（2026-11-03，该用例已转绿）

根因不是一次性模式，而是「被拒绝的预步回合会结束驱动」这条既有契约：结算通知打开一个只带通知的回合，测试的预步监听把它判掉，父会话随后空闲；此时接受的提示停在被拒绝回合之后，等一次不会再来的唤醒（现有 agent-loop 用例明确断言：被阻塞的回合不自动续跑，排队输入等新唤醒）。

按同一文件里可续子代理那处的做法，在下一条提示前等父代理空闲。复跑：`shipped-composition` 8/8、`background-job-list` 3/3，两文件 11/11 通过；agent-loop 438 例不受影响。未改动 agent-loop 语义：尝试过的「被拒绝时若有排队 follow-up 就自动重开驱动」与现有三条用例冲突，已放弃并回退。

### B-2（background-job-list）执行结果

两处按旧编号写死的断言已改：匹配正则收紧为 `bash-<16 位十六进制>`，输出采集改为转发启动结果报告的编号。在非沙箱宿主上该文件 3/3 通过；同一轮把 `shipped-composition` 里同样的写死 id 一并改掉，该文件 7/8 通过。

## 十、subagent-multi（v0 保留场景）收口（2026-11-03 已完成）

- 现象：replay 报 `llm-replay: script exhausted`——父会话要第 4 次模型调用，录制只有 3 次。根因是关闭期结算通知的刷新会给父会话多开一个回合，旧录制里没有这个回合。
- 处置：v0 输入按策略冻结、不能重录；改用场景侧车机制（`snapshot.yml` 声明 `replay: override`，`replay.override.json` 在派生脚本末尾补第 4 个调用），writer oracle 随刷新记录新增回合。历史输入文件未改动。
- 复验：该场景 replay 通过；语料策略用例 16/16 通过；两个子角色的 writer oracle 仅消息序号重排。
- 未选原计划的两条路：迁移覆盖要另造 v0 输入（等于丢掉真实录制），新增当前格式并行场景不满足 v0 覆盖要求；侧车方案同时保住冻结输入与覆盖名。

### 顺带收口：语料清单的会话引用（已完成）

语料清单用例「共享会话引用必须指向属主的选中代」在本轮之前即红：8 个 web 场景的 `snapshot.yml` 仍写死 `session.v3.jsonl`，而属主（`fresh-round-trip`、`live-interactions`、`feedback-command`）的选中代已是 v5；`seeded-history` 没有 v5，其借用方保持 v3。

只改这 8 份清单的 `session.source`：运行时本就按角色取最高代，行为与金标不变——同一批 8 个用例在改动前后都是 4 文件失败 / 31 通过 / 5 失败，红项全是既有登记项。语料清单用例 3/3 通过。

## 十一、删除内置推荐的 MCP 服务器（2026-11-03 已完成）

- 决策：部署不再提供 MCP 服务器定义。设置页曾附带的 fetch / context7 / sequential-thinking / playwright 推荐目录整体删除；服务器一律由用户通过设置页或 home 层补丁文件自行配置。
- 服务面：`@qilin-agent/mcp-servers` 只保留 `list`/`save`/`delete`/`setEnabled`；`addBuiltin`、快照 `builtins` 字段、推荐徽标、命令可用性探测与 subprocess 注入全部移除（peer/dev 依赖同步删除）。
- 页面面：设置页保留手工编辑器与启停/删除；中英词典删掉逐服务器描述与推荐段落；子系统参考补一句「部署自身不提供任何服务器」。
- 记录：新增 Agent Note `implemented/feature/2026-11-03-mcp-servers-user-configured`（中英 + 配对账本）。
- 复跑：两个包 77 例通过、`pnpm run build` 绿、`test:docs` 21/21、`hygiene` 21/21。

## 十二、E 档：pnpm 跟随稳定线（2026-11-03 已完成）

- 四处 pin 升到 12.16.1：根 `packageManager`、根 devDependency、`apps/desktop`、`native/system`。
- 锁文件由 pnpm 12.16.1 重新生成：它把自身的包管理器依赖写成第一个 YAML 文档（`packageManagerDependencies` + `@pnpm/exe.*` 平台条目），原锁内容作为第二个文档保留；`--frozen-lockfile` 通过。
- 复跑：`pnpm install`、`pnpm run build`（439 客户端产物）、`test:docs` 21/21、`hygiene` 21/21 全绿。

## 十三、C 档：web e2e 家族（2026-11-03 第一轮已完成）

- 超时家族：清零。六个文件 25 通过 / 1 跳过（seeded-history、rail-search-expand、models-settings-recovery、document-preview、reference-composer、details-session-lifecycle）。更正：details-session-lifecycle 不是 composition 漂移，而是 markdown 改渲染式只读预览、右栏默认 0.35、面板外宽不再 +1；不需要 key 重录。
- 散点家族：九文件 / 九例转绿（image-display、streaming-fence-highlight、session-inspector、live-interactions、queue-actions、onboarding-deepseek-config、sidebar-sections、third-party-plugin、plan-review）。
- 首轮仍红 13 例，后续处理结果：
  - preview-boot：已转绿（见第十四节起）。
  - github-ready-review：已转绿——示例覆盖层按第三方 profile 直接命名已安装包，scaffold 只链接 `profile.packages`，测试补链接后会话创建通过，ARIA 金标按现行外壳刷新。
  - smoke-real 三例：已转绿——wire 快照改为 native 清单；标题请求改用「无工具面」识别，重试次数回到 2；bash 详情列默认按 0.35 打开，断言改为「点击不改动列宽」。
  - skill-user-invoke 两例：已转绿——按「注入不进 transcript」改在会话日志断言 `skill-invocation` 消息；引用 chip 改为断言文档页签与内容；ARIA 金标刷新。
  - present：已转绿——交付物上方间距是流自身的 16px（尾部 4px 只作用于动作行）。
  - message-actions：已转绿——Turn 过程默认折叠后无滚动余量，用例临时压视口制造滚动范围；焦点工具提示改为先等可见再抓 ARIA；视口恢复移到清理之后。
  - lifecycle-chrome：已转绿——`[data-follow-end]` 横向跟随标记已移除，改为断言运行中 Think 行渲染出流式推理文本。
- workflow-run：已转绿——两处真实缺陷：① 成员行打开子会话硬编码 `mode: 'one-shot'`，与实际地址不符被持久层拒绝（「subagent mode does not match the supplied address」），改 `mode: 'unknown'` 由历史读取解析；② 窄版阶段标题的 42% 上限落在 `width: max-content` 包装器里没有确定包含块，长阶段名越过摘要，给阶段内容包装器补 `flex: 1 1 auto; width: auto; min-width: 0`。测试探针改到真正的标题 span。
- chat-scroll-contract：6/7——准备步在窄版重新展开 rail 后转绿一例。剩余一例的实测证据：`Back to bottom` 落点 `scrollTop=10562`（正是内容底），但折叠留下的预留空间让 `scrollHeight` 比内容多 1510px；100ms 内一次归因于读者的采样用含预留空间的 `floor` 判底，得出「远离底部」并把 `followingTail` 置 false，预留空间此后按「读者在下方的空间」保留，距离一直是 1510。
- 采纳「跳到最新后保持跟随」的决定后，专项尝试了 A（把 `floor` 拆成 `contentFloor`：跟随判定、采样、回底都用内容底，原始 `floor` 只用于写入钳制）。`ui-chat` 的 14 个 fold-follow 单测给出硬约束：跟随读者落地在**原始 `floor`**，预留空间随内容增长被 `reclaimBelow` 逐步裁掉（`spacer = top + height - contentHeight`），把回底目标改成内容底会让「落地即贴内容底、空间留在下方」与既有断言冲突。
- 又试了「回底时请运行中的折叠批次改落尾部」（复用 `retarget`）——触发条件是批次已装好重定向，而该场景的 1510px 预留是跳跃**之后**、跟随已释放时才出现的，所以未命中。
- 还试了「让待跑/运行中的折叠批次改落尾部」两条变体：仅认 `retarget` 已装好的情形不命中；用 `motion.inputActive()` 放宽后命中了 `chat-scroll.client.spec.tsx` 的「回底必须立即落地，并取消旧的折叠等待者」（`scrollTop` 0≠600）——把回底推迟给批次违背既有契约。
- 全部尝试已回滚（`ui-chat` 801 例保持绿）。当轮的结论是「要改折叠批次的**提交时刻**：批次开始时 `tail` 已定，而回底可能发生在批次运行中，需要在非尾部提交分支里重新读一次 `reader.follow.active`」。**更正（2026-11-03，见第十五节）：该结论已被逐帧实测推翻——这一例全程没有折叠批次介入（`foldActive`/`inputActive` 均为 false、`spacer` 始终为 0），1510px 来自焦点恢复把工具行滚入视口。**
- 覆盖提示：video 预览在 web e2e 已无覆盖，建议补一条；普通 Context 的行几何断言随行隐藏作废，若要几何保护应针对可见的「工具变更 Context」行另写。
- B 族 10 例仍需 DEEPSEEK_API_KEY 重录；D 档按决定不做。
## 十四、preview-boot 第一层：编译器缺口已修（2026-11-03）

- 根因：webworker 编译器只把语句位置的 `yield*` 降级为转发循环，`return yield*` 直接拒绝；而 `@sec-ant/readable-stream` 的 `fromAnyIterable` 正是 `async function* () { return yield* o }`。
- 处置：新增 `returnDelegate`（同形态转发循环，完成分支 `return step.value`；正常结束跳过 close，异常退出仍在 `finally` 关闭），遍历器记录已降级节点避免二次改写；值位置与赋值位置的 `yield*` 仍 loud 拒绝。
- 复验：transform 138 例（含新增的转发与完成值用例）与包内 921 例全绿；预览启动场景里该错误消失。
- 场景越过编译器后停在打包层，三处新阻塞（均有实测日志）：
  - `PCancelable is not defined`：`include:` 模块里的打包残留，源码无直接引用，需定位具体依赖。
  - `webworker modules: no static module is registered for "node:https"`：导入链是 `web-app/lib/startup.js → host-webserver`，即宿主 webserver 被拉进 worker 镜像；要么给 module table 补 `node:https`，要么让该依赖不进 worker 图。
  - `llm-pi-ai: TypeError: getAllBuiltinModels is not a function`：`catalog.ts` 从 `@earendil-works/pi-ai/providers/all` 引入该导出，worker 里解析到的构建不含它（版本/生成物对齐问题）。
- 因此预览启动仍红（2 个必需插件未激活），已不再属于编译器缺口；下一步需专项决定 module table 与依赖携带策略。
- 后续同轮继续推进（2026-11-03 深夜），逐层收口：
  - 编译器：命名默认导出曾降级成 `exports.default = class Name {}`，名字不再进模块作用域（`p-cancelable` 末尾引用直接炸）；改为保留声明、语句末追加导出。
  - worker 内置：补 `node:https`（复用 http 假服务器）、`node:tls`（含 `TLSSocket` 与 `_handle._parentWrap` 占位）、`node:dns`、`node:http2`、`assert`、`node:diagnostics_channel`、`http.Agent`。
  - CJS 形状：Node 的 `events` 模块值就是 EventEmitter 类本身，静态模块改为类形状（`class X extends require('events')` 依赖它）。
  - pi-ai stub 补齐 `getAllBuiltinModels` 与 `builtinModels`，`llm-pi-ai` 的激活不再抛错。
- 首页 hero 缺失的根因已定位：预览部署没有 profile 级设置服务——base 组合在缺少 `profileContext` 时禁用 `settings` 与 `config-editor`，Models 联表因此返回 `unavailable`，引导步骤自行 complete，`Configure later` 本就不会出现。测试改为断言宿主输入框这一真实首个交互面。
- 迁移层的根因：V4→V5 折叠表在 V5 落地时（2026-10-11）把 `standard` 记为已退役，而 `standard` 在 2026-10-18 重新成为出厂预设，折叠表未回退——历史会话的选中模式因此被静默改写成 `ptc`，并与会话索引分歧，父会话迁移抛「historical session generation changed during migration」。折叠表收敛为仍缺席的 `cordis`/`minimal`，`standard` 直通。
- 设置服务：预览引导的是组合后的条目清单而非启动器 profile，base 组合据此不挂载 `settings`/`config-editor`；preview-boot 改为记录该限制（断言 `settings service is absent`），凭据通路照旧实测。
- **preview-boot 已全绿**：页面、tree active、宿主输入框、会话读写/重命名、技能目录、凭据、种子会话与子代理目录、控制台无错误。

## 十五、chat-scroll-contract 最后一例收口：焦点恢复的回滚（2026-11-03 已完成）

- 复现：该文件第 3 例在 `wheelToHistoryStart` 后点 `Back to bottom`，`expectBottom` 读到 1510。页面内逐帧探针（替换 `scrollTop` setter、逐帧采样、属性与 `focusin` 观察器）给出的顺序：
  1. 点击前 `top=0`、`floor=12072`、`spacer=0`，没有折叠批次（`foldActive=false`、`inputActive=false`、`data-chat-motion` 计数 0）。
  2. `returnToBottom` → `followTail` 写 `scrollTop=12072`；`after-set` 读回仍是 12072，`scrollHeight=12924`、`clientHeight=852`。
  3. 同一帧内 `focusin` 落在一张工具行卡片（`[data-sample="bash"][role="button"]`）：`Back to bottom` 按钮随 `followingTail` 变真而卸载，焦点落回 `document.body`；`ChatFlow` 的「Turn 收尾重组后恢复焦点」观察者把这个回落当成重组丢焦点，重新 `focus()` 记录行里的 `role="button"`。
  4. 浏览器为把该行滚入视口，把 `scrollTop` 拉到 10562（12072-1510）；`scrollHeight`/`clientHeight` 全程不变，也没有 ResizeObserver 通知。
  5. 该 scroll 事件带 `movedByReader=true`（`readerInput` 由点击自身的 `pointerdown` 置位），`flushSample` 用带 1510 偏差的 `floor` 判底，得出「远离底部」并把 `followingTail` 置 false，此后不再回底。
- 被否定的旧假设：`scrollTop=10562` 不是内容底，`scrollHeight` 也没有多出预留；`spacer` 始终为 0，`foldDriver` 没有跑过任何批次，`retarget` 从未装好。`contentFloor`、`retarget`、`inputActive` 三条改法都作用在一个不存在的折叠批次上。
- 根因：`ChatFlow` 的焦点记录只在「下一次 DOM 变化」时判读焦点是否仍在记录行内。读者先聚焦别的控件、该控件随后被卸载时，`activeElement` 已是 `document.body`，被误判成重组丢失焦点，焦点还给记录行，浏览器随之把会话滚回去。代码注释本就说「读者聚焦别处即消费记录」，只是发生得太晚。
- 处置：`ChatFlow` 在记录存活期间监听 `focusin`（捕获阶段），目标不在记录行内立即 `consumeTurnProcessFocus`；重组丢焦点的恢复观察者保留，两条路径共用同一个记录行查询。
- 复验（全部实跑）：`chat-flow-focus` 新增用例先红后绿（移掉 `focusin` 监听即红）；`chat-scroll-contract` 7/7（该例 5.1s，整文件 30.8s）；`ui-chat` 802 例、`tsc -b tsconfig.client.json`、改动文件 oxlint 0 error。
- 覆盖提示不变：video 预览在 web e2e 仍无覆盖。

## 十六、窗口 A：投影缓存保留上限（2026-11-03 已完成）

- 体检：`session_projcache` 的两处无界都成立——记录数随会话增长且**没有任何删除路径**（服务里没有一次 `table.delete`；归档/删除会话都不清），而 domain 在 `open` 时 `loadAll` 把每个 `<id>.json` 全读进内存。
- 本机取样（23 条记录）：磁盘 3.40MB、rows 紧凑体积 1.64MB，其中 `contextTimeline` 一项占 1.37MB（88%）。该键在当前注册表里根本不存在——记录来自另一套构建（desktop dev home 挂的是上游 `dsh-context@0.72.0`）；缓存身份只校验 `formatVersion/createdAt/cwd/isSeeded`，不校验投影键集合，所以这类行会被永久保留且永远不被读取。
- 决策：不做「未注册键」修剪。初始化时注册表键集合还不完整（agent preset 会为每个会话注册同一批工具投影），剪掉一个稍后才注册的键会让该会话下次 restore 从 seq 0 读整份日志，代价大于收益。改由字节上限覆盖超大行（本机 88% 的那一行正是最大行）。
- 落地：
  - 存储层新增 opt-in `retention: { maxRecords }`（`DomainSpec` → `KvUnitDescriptor`，仅 `per-record` 布局）：json 后端在 `loadAll` 前按写入时间保留最新 N 份文档并删除其余；sqlite 后端按 rowid 保留最新 N 行并删除其余。仍同步、不改变读契约。
  - 缓存服务新增 `maxRecords` / `maxRecordBytes`：启动维护一次性修剪存量（重写超预算记录、淘汰最旧 `createdAt`），此后每次写入都执行字节预算并在超量时淘汰最旧记录；整条记录被全部丢弃时直接删除而不是写空壳。
  - base 组合显式声明 `maxRecords: 256`、`maxRecordBytes: 131072`（128KiB）。
- 实测收益（本机存量模拟）：字节上限只丢 2 行（两条大 `contextTimeline`），rows 紧凑体积 1636KB → 833KB（−49%）；叠加 `maxRecords=256` 后，记录数与单条体积都随部署有界。首启仍会完整载入一次旧存量，之后由介质层上限约束载入量。
- 复验（全部实跑）：`storage` + `session-projection-cache` 136 例、`api/session-controller` + `session` 3497 例、`pnpm run build`、`test:docs` 21/21、`doc-sync` 全绿；改动文件 oxlint 0 error。
- 顺手修复的既存红项（与本改动无关，生成物/文档门禁要求）：`docs/tool-catalog.md`、`docs/persistence-catalog*`、`docs/persistence-schema.json` 的过期生成物；`release-age-excludes.ts` 与 `child-route.ts` 的 5 处导出 JSDoc 缺项。
- 下一窗口：P0-2（搜索 reconcile 作用域/并发/流式插入）与 P0-3（客户端 source 表剪枝、窗口上限）仍未动；窗口上限的「裁头后 `hasMore`/未解析位置」语义已被否决，需要另设计。
