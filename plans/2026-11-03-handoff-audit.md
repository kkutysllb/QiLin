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
