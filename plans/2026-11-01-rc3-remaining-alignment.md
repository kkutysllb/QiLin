# 3.1.8-rc.3 剩余对齐清单（留给下一版本）

- 状态：rc.3 预览发布在途；本文只登记**下一版本**要收的对齐项与验收口径。
- 上游基线：`dsh-v0.2.2-alpha.2`（主对齐计划见 [2026-10-28-upstream-0.2.2-alpha.2-alignment.md](2026-10-28-upstream-0.2.2-alpha.2-alignment.md)）。

## 一、rc.3 已收口（不再重复）

- 会话语料：v4 → v5 全量重录（108 目录 / 125 个 v5），`test:snapshot` 从 113 红降到 0 红。
- 覆盖门：`ci-coverage`（分区 2）0 条 ERROR。
- 子代理：`stopped`/`awaitStopped` 生命周期；并发调用按接受序编号；结算通知在 turn 边界投递（确定且不增模型调用）。
- 插件管理页迁入设置分区；MCP 与技能设置页改为卡片样式。
- 桌面插件更新/卸载：`minimumReleaseAgeExclude` 归一化为裸包名；随包 pnpm 升到 11.23.0。

## 二、下一版本要收的对齐项

### A. 契约小包与客户端能力

| 项 | 现状 | 验收 |
| --- | --- | --- |
| `official-bundles` 契约包 | 未移植 | 包与消费者落地；`official-bundle-packages` 的 ON_DEMAND 名单与 UI 徽标同源 |
| `message-quotes` 客户端插件（R2b） | 未移植；此前在「本地引用渲染 vs 管线化」之间未决 | 先定语义再落包：引用高亮、跳转与复制行为有单测与 web e2e |
| 插件清单 tab（`settings.plugins.tab`） | 无宿主：移除「内置插件」设置入口后 inventory tab 不可达；ui-settings-plugins 的卡片仍被插件页使用 | 二选一：补回 tab 宿主并接 inventory，或删除 tab 账本与死代码（覆盖率门会要求） |

### B. R4 客户端打磨（D 簇）

- dockkit：中键关闭标签页。
- 代码高亮：会话内代码行的行级高亮。
- 侧栏对齐与窄屏回流：与上游最新间距/宽度档位一致。
- PWA 图标与 manifest 收尾。

验收：受影响包单测 + `QILIN_SNAPSHOT=replay pnpm run test:web` 的相关场景；视觉以真实 web scaffold 截图对照。

### C. R3b 共享动画/primitive

- `ui-workspace` 切到共享动画与 primitive（上一轮只完成模型拖拽排序共用预览）。
- 验收：ui-workspace + ui-primitives 单测；视觉无回退。

### D. 子代理结算通知的关闭期丢失

- 现状：父 turn 已结束、进程收尾时才到达的 parent-delivery 通知进入 next-turn 队列，本 run 不读取；`subagent-parallel` 的第二个子通知因此不再出现在录制里（行为确定、replay 稳定，但相对旧行为有信息丢失）。
- 需要：关闭期 flush / 等待 resident 背景子结算的产品设计（SDK server shutdown 与 headless runner 两处共用一套语义），并补单测与场景录制。

### E. 快照 lane 的构建前置

- 现状：快照子进程加载构建产物 `lib`；改产品后必须先 `pnpm run build`，否则新增 API 在 replay 子进程不可见（本轮已在 runner 加能力守卫兜底）。
- 需要：把 `build` 作为 `test:snapshot` 的显式前置（或 gate 依赖），避免"源码已改、lane 跑旧产物"的误判。

### F. Windows ACL 场景

- 现状：`windows-acl-skill` 的 harness workspace setup 已实现，macOS 上真实运行并通过；pnpm corpus 的 pending 名单只剩这一条，理由为「需要 Windows 环境验证 ACL 语义」。
- 需要：在 Windows 上复跑该场景并重录，随后删除 policy 的 `PENDING_V4_SCENARIOS` 条目。

### G. Web e2e 浏览器 lane 基线

- 现状：rc.2 时该 lane 长期红（15/25）；本轮修复了 settings-chrome、plugin 系列与若干时序 flake，但仍非全绿。
- 需要：逐条定性（期望漂移/产品缺陷/环境），修到可纳入发布门禁；不能修的明确标注跳过原因。
- rc.3 实测（`QILIN_SNAPSHOT=replay pnpm run test:web`）：136 文件 / 464 例 → **56 文件、93 例失败**（354 通过、17 跳过），exit 1。失败家族：
  1. **超时 28 例**：多为 locator 等待 10–60s。抽样 `rail-search-expand` 孤立复跑仍 60s 超时；探针确认页面已是英文且 `Collapse sidebar` 按钮存在，卡在可点击性，需逐个查遮蔽/动画。
  2. **ARIA golden 漂移 23 例**：抽样 `access-confirmation` 期望英文 `Auto review EXP`，实收中文 `自动审查 EXP`；孤立复跑同样失败，说明是这些场景启动页面的语言与 golden 不一致，属夹具/语言设置问题。
  3. **回放夹具未消费完 12 条**：`llm-replay: fixture not fully consumed`，录制脚本与当前驱动步数不匹配。
  4. **其余**：个别计数/布尔断言，以及控制台副作用（`client api: ... has no active Connection`）。
- 与 rc.3 纸感/组件语言改动无关：失败日志中从未出现本次新增的设置字段或配色文案。
- 下一步按家族修：(a) 未显式指定语言的场景统一走 English 页工厂；(b) 逐条判定 golden 该 refresh 还是产品缺陷；(c) 按当前驱动步数重录回放夹具；(d) 超时例先读 `saveFailureShot` 截图再决定。

**进展（第一轮收口）**

- 已完成：终端配色断言与 colors/theme golden（`b6a1274319`）；26 份 golden 重录并按文件核对归属（`9f7ac24a1d`）；composer「14 行」上限改为随行高计算（`9d701d0dfc`，这是字号升到 15px 后暴露的真实回归）；`goal-command-presentation`、`settings-chrome` 的硬编码字号期望同步。
- 复核方式：重录后以 replay 复跑，9 个 spec 32/33 通过；`composer-draft-scroll` refresh 与 replay 各 7/7。

**剩余家族的真实成因（本轮定位）**

- **超时家族不是可点击性问题**：`file-upload-round` 等用例点的是 `DeepSeek-V4-Flash-Vision-Exp`，该 id 只存在于回放目录（`apps/web/tests/scaffold.ts` 的 `REPLAY_PROVIDERS`）。本机 `QILIN_SNAPSHOT=record` 走真实部署目录（当前为 V4.1-Flash / V4-Pro），用例点不存在的条目，才表现为 30s 点击超时（证据：`.artifacts/web-e2e-file-upload-drive.png` 显示模型菜单里只有 V4.1-Flash 与 V4-Pro）。
- **因此夹具无法在本机忠实重录**：需要先让 record 模式也用固定目录（或让用例按位置/能力选择模型，而不是钉死名称），再在有固定目录的环境重录。
- **夹具与断言耦合**：`file-upload-round` 的 Trajectory 附件失败（列表 hidden、`liveTrajectory` undefined）由回放未消费完导致，属同一根因的下游表现。

**第二轮进展与更正**

- 已落地 B：record 模式注册 `deepseek-fixture` 路由，公布回放目录（V4-Flash / V4-Flash-Vision-Exp）并把 `stream` 转发到部署真实 provider/model，会话默认模型也指向该路由（`337cb4af89`）。此前 30s 点击超时的 `file-upload-round` 主用例现在 2.7s 通过。
- **更正**：夹具并不"陈旧"。`recordFixture` 写入的是按格式版本命名的 `session.v5.jsonl`，该文件被 `.gitignore` 忽略、每次录制重新生成；因此 `git status` 看不到变化并不代表没重录。上一版记录里"夹具无法在本机重录"的判断作废。
- 重录后 replay 仍失败的用例（`file-upload-round` 的 Trajectory 附件、`turn-tail-actions` 的 `processBottom + 8` 实得 16、`rail-search-expand` 的首击超时）属 **UI 状态断言**，需要逐个在真实页面上调试，不能再靠重录解决。

### H. 发布与打包配套

- macOS 签名：`codesign --timestamp` 需要把 `HTTP_PROXY/HTTPS_PROXY` 指向本地代理（`http://127.0.0.1:7890`），签名缓存先预热两轮；未签名包仅作对照。
- `pnpm` 随包版本：rc.3 已升到 11.23.0；下一版本继续跟随稳定线，升级时同步 `packageManager`、根 devDependency、`apps/desktop` 依赖与 `native/system` 的 pin。
- vendor 族：本轮只 bump `qilin` 族；vendor 若有变更，按 `release:vendor` 独立批次并先于 qilin 发布。

## 三、门禁命令（下一版本沿用）

```sh
pnpm run build
pnpm exec tsc -b tsconfig.host.json && pnpm exec tsc -b tsconfig.client.json
pnpm run test:docs
QILIN_SNAPSHOT=replay pnpm run test:snapshot
pnpm run test:web
pnpm run test:coverage
```

## 四、执行状态（2026-11-01，收口轮次）

### 已收口

- **E 快照 lane 构建前置**：新增 `scripts/snapshot-lane-build-freshness.ts`（含 7 例单测），`test:snapshot` / `test:snapshot:record` / `test:snapshot:refresh` 三脚本前置该守卫。判据是构建记录 `.qilin-build/client-build-environment.json` 与 `packages/**/src`、`apps/web/src` 的修改时间比较，源文件更新即报「build is stale」并指向 `pnpm run build`；`QILIN_SNAPSHOT_ALLOW_STALE_BUILD=1` 是显式逃生口。文档见 [testing.md](../docs/testing.md)。
- **F Windows ACL 场景**：账本的「需要 Windows 环境验证」结论已过期——该场景的 workspace setup 只把平台中立的 skill 资产复制进 `.qilin/skills`，v5 fixture 已在树内。本机（macOS）`QILIN_SNAPSHOT=replay` 重放 `windows-acl-skill` 通过，corpus 门禁在删除条目后全绿；`PENDING_V4_SCENARIOS` 机制一并移除（无条目即不可达死码），v4 生成代仍按既有规则保留在目录中。
- **H 发布配套（文档面）**：`docs/development.md` 不再复述 pnpm 具体版本（改指 `packageManager` 字段，原写法停在 11.7.0 已漂移）；macOS 签名补充「安全时间戳走 Apple 时间戳服务，只经本地代理出网的主机须为打包进程导出 `HTTP_PROXY`/`HTTPS_PROXY`，签名缓存前两轮预热，未签名包仅作对照」。
- **H vendor 族**：`git log v3.1.8-rc.1..HEAD -- vendor/` 为空，本轮无 vendor 变更，故不出 vendor 批次；vendor 独立发布仍按 `release:vendor` 先于 qilin。

### 决策记录

- **A2 message-quotes 走「本地引文渲染」（路径 2）**：不引入上游 user-text registry 管线（会换掉 QiLin 现行 `projectUserText` 主路径，与「本地特性不回退」红线冲突）。引用选择/高亮/跳转/复制在现行渲染上增量实现，契约由新包承载。
- **A1 official-bundles 走契约包（路径 B）**：ON_DEMAND 徽标经核实本就由 Host 派生下发、客户端无第二份名单；真正的缺口是 `EXTENSION_BUNDLES`/`MORE_BUNDLES`/`EXPERIMENTAL_BUNDLES` 在 `ui-plugin-manager` 里手写 + 用 `startsWith('@qilin-agent/experimental-')` 猜徽标。新增 `packages/util/official-bundles` 作为单一来源，Host 与 client 同源消费（client 只依赖 util 包，不越 client→Host 红线）。
- **A3 插件清单 tab：删除**：`settings.plugins.tab` 自「内置插件」入口移除后无宿主，整包 `ui-settings-plugin-inventory` 不可达；按「删 tab 账本与死代码」处置，设置页能力由 `ui-plugin-manager` 承担。
- **B2 代码行级高亮**：上游基线无此能力，按本地特性实现（CodeBlock hover/聚焦整行高亮，不做持久选中）；上游 `dbf7d54a18` 是侧栏文档预览的跳转行高亮，属另一个面，登记为后续项。
- **B4 窄屏回流**：上游 client 侧唯一的宽度断点在 `ui-theme` 三个设置行的 `@media (max-width: 767px)`；`ui-sidebar` 的「窄屏」侧面是 9 处 `@media (hover: hover)`。

### 本轮落地（代码面）

- **A1**：新增 `packages/util/official-bundles`（HIDDEN/EXTENSION/MORE/EXPERIMENTAL/ON_DEMAND + 三个判定），app-boot 改为 re-export 并加「生成目录名单 == ON_DEMAND 名单」漂移守卫；ui-plugin-manager 删掉三份手写清单与包名前缀猜测，改读共享包。客户端通过 `INLINE_SAFE` 内联该纯数据包（不申请 `qilin.client.external`），Host 侧在 `DUPLICATE_SAFE_PACKAGES` 登记（不新增 `SAFE_HOST_DEPENDENCY_EXPORTS` 例外）。
- **A2**：引文能力落在 `ui-primitives`（`quote-text.ts` 的扫描/解码/来源 token/插入序列化 + `QuotePreview`），`ui-chat` 用户气泡接入渲染、复制、跳转；新增 `apps/web/tests/user-quote.e2e.ts`。原计划的 `packages/session/message-quotes` **未入树**：它是 session 平面包却反向依赖 client 包，且零消费者，属分层错误，其中两项能力已并入 ui-primitives。
- **A3**：删除整包 `ui-settings-plugin-inventory` 与 `settings.plugins.tab` slot、web-app 的组合行与依赖、`PROTECTED_PLUGINS` 死条目，文档成对更新，生成物重生成。
- **B**：dockkit 中键关标签（停靠 chip 与浮窗标题双承载，含菜单门户守卫）、CodeBlock 行级悬停高亮（只改背景，减少动效下取消过渡，键盘仍只有 `pre` 一个停靠点）、侧栏间距档位对齐（外距 12→8px、新增 row-padding/label-gap/paint-inset、hover 收进 `@media (hover: hover)`）、ui-theme 三处窄屏断点、PWA 三枚自绘 PNG 图标 + manifest 六字段。
- **C**：`ui-workspace` 的 grouped tree 与 flat list 切到共享 `AnimatedRows`（`data-row-key`、`ready`、`resetKey`、`watermarkMotionKey`），删除本地 `@keyframes row-in`；新增共享 `motion.ts`（`prefersReducedMotion()`）收敛两处重复的 matchMedia 判断；顺带修复 `.sessionOverflowButton` 读取从未发布的 `--qilin-workspace-indent`（改为已发布的 `--dsh-workspace-indent`，子级 Show more 恢复 12px/级缩进）。
- **D**：`flushSettlementNotices` 有界幂等 flush + closing 批次；headless runner 恢复静默收敛循环（`settlementDeadlineMs`/`settlementMaxTurns` 两个 Config 界，超界 warn 未读数）；SDK shutdown 在 drainDescendants 之前 flush。

### 已知红与下一版项

- **D 引发的 fixture 缺口**：行为变化使 6 个 `recording: authored` 场景与 `advanced-toolchain`/`advanced-toolchain-runtime` 的 replay 需要新的模型响应（`llm-replay: script exhausted`）。6 个 authored 场景按 authored 手写流程补「一个 closure turn」处理；两个 advanced-toolchain 场景需要人工重写。
- **`session/subagent-multi`**：`sessionFormat.version: 0` 且是 corpus 里 v0 `multi-hop` 与 `shipped-profile` 覆盖的唯一提供者，按「声明即冻结」不动它，本轮为已知红。下一版二选一：把两项 coverage 迁到受控迁移场景，或新增一个当前格式的并行场景承担行为回放。
- **`session/subagent-spawn-in-process` 抖动**：重录后的 fixture 存在约 1/12 概率的顺序竞态（子代理 `send_message` 的 `agent/inbox/spliced` 与父 `step/start` 先后），属既有 live 录制竞态而非 flush 引入；本轮登记为 known-flaky，下一版在归一化层稳定该事件对顺序。
- **H 的 pnpm 跟随升级**：稳定线当前为 `12.16.1`（rc.3 为 11.23.0）；升级需同步 `packageManager`、根 devDependency、`apps/desktop` 与 `native/system` pin 并重生成 `pnpm-lock.yaml`，最后跑 `pnpm run build` 与 `test:web` 复验。
- **G**：浏览器 lane 的剩余红按「期望漂移 / 产品缺陷 / 环境」三类处置；环境类（嵌套 `sandbox-exec`、`posix_openpt` 被宿主沙箱拒绝）需在非沙箱宿主复跑。

### 本轮实测（权威数据）

- **构建**：`pnpm run build` 绿，记录 439 个客户端产物（`.qilin-build/client-build-environment.json`）。
- **文档门**：`pnpm run test:docs` 21/21 通过（含 pairing 1181 对、type-equiv 498 块、md 链接 2337 文件）。
- **快照 lane**（full-access 宿主）：161 通过 / 5 红 / 2 跳过。5 红均为已登记项：`advanced-toolchain`、`advanced-toolchain-runtime`、`subagent-acp-diagnostic`、`subagent-depth-two-rejection`（需新模型响应，人工重写清单）与 `subagent-multi`（pinned v0 唯一覆盖）。此前的 6 条 ENV 红在放宽沙箱后全部转绿，确认为宿主限制而非产品问题。
- **Web 浏览器 lane**（`QILIN_SNAPSHOT=replay`、4 worker、full-access）：`Test Files 53 failed | 82 passed | 1 skipped (136)`，`Tests 87 failed | 360 passed | 17 skipped (464)`，426s。相比本轮开始时的 70 红文件 / 151 红用例，刷新 27 个场景的过期 golden 并修 4 个 spec 后下降，但仍未达「可纳入发布门禁」。
- 该 lane 的剩余红分成五类：① 已刷新 golden 仍红的行为层问题（隐藏元素与等待超时，12 文件 / 18 用例）；② 产品可疑待定（`background-job-list` 无 job id、`schedule-after` 域未开、`details-session-lifecycle` fixture 未消费完、`cordis-tool-round`/`document-preview`/`reference-composer` 超时）；③ `hmr-live` 已越过 dev:web 就绪（`onSuccess` 修复生效）但停在「空会话 hero wordmark 未出现」的英雄态假设；④ `skill-invocation-policy` 的引用预览结构变化待定性（可能是 ui-primitives markdown 改动副作用）；⑤ jsdom/testing-library 的 3 个跨文件错误。
- **`dev:web` 就绪**：`scripts/dev-web.ts` 的 readiness 计数从内联 `build:done` 改回 tsdown `onSuccess` —— workspace 级 hook 会覆盖内联 hook，导致「就绪行永不打印」，这是 `hmr-live` 长期红的根因。
- **未跑**：`test:coverage` 分区门（全量耗时超出本轮窗口；已用聚焦覆盖验证 D 改动的三个文件 100%，`internal.ts` 需含 `experimental/agent-team` 测试才到 100%；`projection.ts:160` 一条未覆盖分支非本轮引入，记为待验项）。
- **H 的 pnpm 跟随升级未执行**：需要在验证过的树上做整仓 install + 锁文件重生成 + 全部门禁复跑，本轮未做，步骤已按上文记录。
