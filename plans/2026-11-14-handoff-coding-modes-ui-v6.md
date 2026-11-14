# 交接单：编码模式改名 / UI 批次 / V6 办公 / 设置页改版

日期：2026-11-14
仓库：`/Users/libing/kk_Projects/QiLin`（QiLin monorepo，pnpm workspace）
状态：**94 个提交未推送**；第 4 节修复另有 4 个文件的未提交改动

## 1. 先看这几处，能快速建立上下文

- `plans/2026-11-14-coding-mode-rename.md` —— ptc → coding 改名计划与落地方案（含保留词汇的裁决）
- `plans/2026-11-14-v5-coding-mainline.md` / `…-progress.md` —— 编码模式主线切片与执行账本
- `plans/2026-11-14-v6-office.md` —— 通用办公批次（office-read / office_read，S1–S4 已落地）
- `plans/2026-11-14-release-notes-3.1.12.md` —— 发布说明草稿（**未发布**）
- `design/settings-redesign/variant-{a,b,c}.html` + 同名 PNG —— 设置页设计稿（用户已选 C）

## 2. 已交付（全部有门禁证据）

| 批次 | 内容 |
|---|---|
| V5 编码主线 | 工作树移除、变更范围（本次提交 / 上一轮）、行内未知工作树图标、终端分块重试、输入框 hold、聊天自动加载与继续生成、重试排队 |
| 侧栏 | 项目按「编码项目 / 普通项目」分区、可折叠、字号层次修复 |
| UI 刷新 | v0 令牌与密度、v1 三面迁移、24 网格图标集、响应式三处修复 |
| 改名 | 预置 id `ptc`→`coding`（保留只读别名）、四个运行层包改名、`ctx.codingRuntime`、`mode: 'native' \| 'coding'`、`demo:coding`、残留词汇收口 |
| 会话格式 | `SESSION_FORMAT_VERSION` 7→8，新增 `session-format-v7-to-v8` 边界包，归档 v7 引用（v0–v8 全部通过 `verify-persistence-formats`） |
| V6 通用办公 | `packages/document/office-read`（只读解析 DOCX/XLSX/PPTX，14 测试）、`packages/document/tool-office-read`（`office_read` 工具，8 单测 + 1 条 Loader 真实组合测试）、接入标准/编码预置、`readOfficeMetadata` |
| V7 静态审计 | `typecheck` 双面干净、`lint` 0/0、`hygiene` 22/22、`duplication` 0.07%（26 个既有克隆） |
| 设置页 | 删除页眉「打开配置文件」与关闭按钮（关闭路径保留遮罩 / Escape / 返回工作区）；按设计稿 C 改为分组卡片 + 通栏横条 |
| 侧栏 | 「新会话」由大按钮改为面板列表里的通用菜单项（带图标、快捷键提示） |

## 3. 未完成 / 需要接手的事

1. **发布**：用户裁决「等其余计划完成后再发布」，版本暂定 **3.1.12（patch）**。发布时要：
   - 推送 94 个提交 → `pnpm run build` → 打 tag → `gh release create --notes-file`（用发布说明草稿去掉草稿头）→ `pnpm run release:verify-published`；
   - `docs/persistence-changes/historical-formats/v7.md`（+zh）里 `source: tag: qilin-v3.2.0` 是占位，**必须改成实际使用的 tag**，否则是假引用。
2. ~~两个未解决的运行时错误~~ 已定位并修复（`mode: ptc` 改名遗漏，见第 4 节）；快照通道里同类旧值待裁决。
3. **V6 剩余**：预览转换缓存改用解析器元数据做键，需要新增 Host↔Client 远程方法（Typert 契约 + 代码生成门禁），本次刻意未做，已在计划与 README 记录。
4. **保留词汇**（有意为之，不要顺手改）：`tool/ptc-dispatch*` 事件类型与 `tools/ptc-dispatch-log` 扩展点（持久化/扩展词汇，改名要再进位一次会话格式）；`.agents/notes/**` 历史记录正文与文件名（只更新了指向已移动文件的链接）。
5. **V7 收口的剩余两项**：视觉规格文档定稿、release notes 定稿（草稿已写）。

## 4. 两个运行时错误的根因与修复（已解决）

### 4.1 根因

`coding` 预置的 `tool-presentation` 行把 `mode` 留在改名前的 `ptc`：

- `packages/preset/agent-presets/presets/coding/agent.cordis.yml` 写 `mode: ptc`；
- `@qilin-agent/agent-tool-presentation` 的 schema 只接受 `native | coding`（`packages/core/agent-tool-presentation/src/index.ts`）。

预置在会话挂载时整份失败（`agent-preset/invalid`，「1 row(s) did not activate」），宿主侧 coding 会话因此不可用，连带出三个现象：

| 现象 | 机制 |
|---|---|
| 右侧「变更请求」面板 `无法加载变更请求面板 / 重试` | 面板流在拿到第一帧前就结束，落到 `ChangesTab.tsx` 的 `snapshot.disconnected` 分支 |
| 输入框 `当前模型不可用，请先选择模型` | 会话路由读不到，模型选择因此没有可用项 |
| 文档预览 `client api: workspaceFiles/read failed: Failed to fetch`、控制台一条 404 | 会话挂载失败后宿主状态异常，传输层请求失败 |

控制台原文（Playwright 实测，修复前）：

```
initial workspace selection failed: SessionCreateError: session create failed: agent-preset/invalid:
agent-presets: preset "coding" failed to mount: 1 row(s) did not activate:
tool-presentation (@qilin-agent/agent-tool-presentation): invalid config:
  - $.mode expected "native" | "coding" but got "ptc" (at mode)
```

所以不是 forge 面板逻辑、也不是 RPC 寻址或代理；上一版「4.2 已排除」的方向把会话挂载失败误判成了传输故障。

### 4.2 修复

- 预置 `mode: ptc` → `mode: coding`（`packages/preset/agent-presets/presets/coding/agent.cordis.yml`）；
- 同一处旧值 `packages/experimental/cua-macos/examples/persistent-ptc.cordis.yml` 一并改为 `coding`；
- `@qilin-agent/agent-tool-presentation` 与 `@qilin-agent/tools` 的 `Config.mode` JSDoc 仍按 `ptc` 描述接受值，改为 `coding`（契约文字与 schema 对齐）。

### 4.3 验证

- Playwright 用本机账号加载 `http://127.0.0.1:8790/workspace`：修复前控制台即上面那段错误、会话列表为空、输入框「当前模型不可用」；修复后无报错，会话列表、模型（`DeepSeek-V4.1-Flash`）、右侧「Code review and changes」面板都正常（面板显示空态文案，不再出现重试按钮）。
- `npx vitest run packages/preset/agent-presets/tests/shipped-root.spec.ts packages/preset/agent-presets/tests/mount.spec.ts` → 65/65；`packages/core/agent-tool-presentation` → 7/7；`npx tsx scripts/verify-cordis-config.ts` → 227 个配置文件通过；`oxlint` 0/0。
- 预置 yml 在每次会话挂载时读取，**改完不需要重启宿主**，浏览器刷新即可；不需要重新 `pnpm run build`（只改了预置与注释）。

### 4.4 同类旧值已全部清掉

**配置值**

- `snapshots/session/*/{cordis.yml,cordis.snapshot.yml}` 18 个文件的 `mode: ptc` → `coding`；
- 11 个 `snapshot.yml` 的 `QILIN_TOOLS_MODE: ptc` → `coding`；
- `packages/preset/agent-presets/presets/coding/agent.cordis.yml`（运行中的应用就是被这条打挂的）；
- `packages/experimental/cua-macos/examples/persistent-ptc.cordis.yml`。

**旧标识符与路径**

- `snapshots/session/headless.snapshot.ts` 的 skill 路径 `presets/ptc/…` → `presets/coding/…`（原先 `skill-load` 场景直接 ENOENT）；
- `scripts/gen-plugin-packages.ts` 的生成目标路径同一处旧目录；
- `scripts/verify-preset-copy.spec.ts` 的夹具 id/copy key；
- `snapshots/sdk/{ptc-turn,tool-error-details}/runtime.cordis.yml` 的 `@qilin-agent/ptc-runtime-node` → `coding-runtime-node`；
- `snapshots/session/ptc-python-turn/` 的两处 `disabled: id: ptc-runtime` / `workflow-ptc` 与 `@qilin-agent/experimental-ptc-runtime-python`（错名会让 Python 场景与 Node provider 撞服务）；
- `snapshots/session/ralph-loop/` 的 `@qilin-agent/workflow-ptc` → `workflow-coding`;
- `apps/cli/tests/fixtures/github-webhook/cordis.yml` 的 `agentPreset: ptc` → `coding`。

**注释与生成物**

- `packages/bundle/web-app/cordis.patch.yml` 两处注释、`packages/core/tools/tests/coding.spec.ts` 一处注释；
- `scripts/gen-tool-catalog.ts` 的 run_code 说明（同时去掉已退役的 `both`），并按生成器输出手工同步 `docs/tool-catalog.md` / `docs/tool-catalog.zh.md`，重录 `docs/tool-catalog.i18n.yaml`；
- 重新生成 `presets/coding/skills/cordis-composition-reference/references/packages.md`（路径修正后补上 3 个漏掉的包：coding-runtime-node、experimental-coding-runtime-python、tool-office-read）。

**门禁策略**

- `scripts/verify-preset-copy.ts` 把 `ptc` 列入退役预置 id（prose、`agentPreset:` 记名、display map、字典 copy key 都会被拒），夹具与用例同步更新——这正是这次「改名漏一处」的检测口。

保留不动：`tool/ptc-dispatch*` 事件类型、`tools/ptc-dispatch-log` 扩展点、`tools:ptc-only` 段落名、`<parent>:ptc:<n>` 子调用 id、历史迁移包（`session-format-v2-to-v3`/`v4-to-v5` 里的 `ptc` 就是当时的语义）、场景目录名。

### 4.4.1 快照通道：v8 世代迁移完成（2026-11-14 晚）

`pnpm run test:snapshot` 现在全绿（175 passed / 2 skipped）。原来那 22 条失败的处理方式：

**6 条沙箱/环境失败**：不是代码缺陷。用 DSH 的完整文件策略重跑后全部通过（`sandbox-exec`、`posix_openpt`、`$HOME` 下的 `mkdtemp` 都只是被会话沙箱拦掉）。其中 `ptc-node-read-only`、`ptc-node-workspace`、`session-sandbox-root`、`workflow-confinement`、`bash-tool`、`persistent-tools` 已按真实行为重录（旧期望里写死了「sandbox 不可用」「posix_openpt 失败」这类本机沙箱报错，属于旧机制残留）。

**16 条 v7→v8 期望漂移 + 语料库整体迁移**：`SESSION_FORMAT_VERSION` 早已是 8，但语料库（184 个 owner）从没跟着迁移，corpus 门禁一直在 acp 那条上先抛错。本次：

- `QILIN_SNAPSHOT=refresh pnpm run test:snapshot` 全量重录：新增 184 个 `session.v8.jsonl` 世代（约 2.0 MB），并刷新 writer / notifications / system-prompt / tool-schemas 期望；
- Web 夹具（19 个 `snapshots/web/*`，`recording: live`，本机无 key 不能重录）按格式迁移生成 `session.v8.jsonl`：只动 header 版本与 `agentPreset: ptc → coding`（`session-format-v7-to-v8` 的同一套规则），内容逐字节相同；
- 跨档案引用（`snapshots/web/*/snapshot.yml` 的 `session:`）全部指向 owner 的当前选世代（14 处 v7 → v8）；
- 新增 `snapshots/session/v7-adjacent-migration/`（v7 回放输入 + v8 writer 期望）：v8 进位后语料库缺 v7 覆盖，`assertSnapshotCorpusPolicy` 要求每个历史版本都有一条 adjacent-migration 角色，`MAX_RETAINED_ROLES` 13 → 14（v1–v7 各一条 + 6 条 v0）；
- 语料库策略里加了 `RAW_JOB_ID_SCENARIOS` 例外：`background-confinement-failure`、`background-job-admission` 的记录文本里带裸 job id（`bash-…`），replay 会把记录文本原样喂给循环，token 化的 `{{id:N}}` 无法还原成活 job，因此它们只能保留在记录的世代上；等 replay 层支持 job id 还原后删掉这两条即可；
- `snapshots/session/headless.snapshot.ts` 修了 refresh 的 stdout 断言：重录会用归一化后的夹具覆盖 `fixtures`，而 stdout 是本轮运行产出的原文，两者不该互相比对——改为对比重录前那份夹具。

**验证**：`pnpm run test:snapshot`（含 build 新鲜度门禁）175/2；`scripts/session-snapshot-corpus-policy.spec.ts` 19/19；`oxlint` 0/0。

**没做的**：web 层的渲染 golden（`ui.expected.md`）没有重录——web 泳道在本沙箱里有 110 条与本次无关的失败（终端 PTY、权限、几何 golden 等），重录会把环境噪声写进 golden。夹具内容与 v7 逐字节一致（只改 header 版本），渲染期望理论上不需变，但下次在可用环境里跑一遍 `QILIN_SNAPSHOT=replay pnpm run test:web` 复核。

### 4.5 门禁缺口
### 4.5 门禁缺口

`verify-cordis-config` 只校验 Loader 元数据与插件可解析性，不校验每行 `config` 是否符合插件自己的 schema；而没有任何测试真的挂载过 `shipped presets`（`mount.spec.ts` 用 fixture 预置）。这类「改名漏一个配置值」只能等运行时踩到。要补的门禁是：对 shipped 预置逐行按其插件导出的 `Config` 校验，或在真实组合里挂载一次 `coding` 预置。

## 5. 设置页设计（本轮踩坑记录）

- 设计稿在 `design/settings-redesign/`，用户选 **C：分组双栏卡片**；当前实现：`packages/client/ui-settings-general/src/client/GeneralSection.tsx` + `GeneralSection.module.css`。
- 分组由外壳持有：`SECTION_OF` 把已知条目 id 映射到 security / appearance / interaction / about，未知 id 落入「其他」；**排序用注册 `order`，不要按 id 字母序**（上一版因此把「显示代码工作视图」排到「权限」前面）。
- 布局：上半部分两列（`columns` 列布局），「版本与关于」「其他」为通栏横条（`bars`）——这是用户明确要求的，别改回统一两列。
- 外观行（ui-theme `AppearanceRow`）是分段控件，标签在左、控件右对齐；语言行同理。
- 前两次尝试（"单页规格表"、"磁贴仪表板"）被用户否决并已回退，不要重复。

## 6. 环境与门禁（本机）

- 已装依赖与构建产物；客户端改动后必须 `pnpm run build`（记录 433 个 artifact），宿主从源码跑、客户端从 `lib/` 读。
- 常用门禁：`pnpm run test:gui`（客户端+host，717 文件 / 10856 通过）、`pnpm run test:docs`（21/21）、`npx tsc -b tsconfig.host.json`、`npx tsc -b tsconfig.client.json`、`pnpm run lint`、`pnpm run hygiene`、`pnpm run duplication`。
- **已知环境失败（不是回归）**：本机会话沙箱禁止在 `$HOME` 下建临时目录/写配置，`coding-runtime`、`workflow-coding`、`tool-fs`、`client-ui-forge` 的沙箱用例会以 `EPERM: mkdtemp` 或 `sandbox-exec: sandbox_apply: Operation not permitted` 失败；跑宿主时可用 `QILIN_HOME=/tmp/qi-home TMPDIR=/tmp` 规避。
- 账号边界：Web 入口 `/workspace` 需要登录，我无法在本环境内复现用户的已登录界面。

## 7. 给接手人的三条建议

1. **不要再无证据改 UI**：所有视觉问题以用户截图为准，改动前先看截图、改后请用户回截图；仓库里有 Playwright（`apps/web/node_modules/playwright`），但本环境登录不了，只能本机用真实账号截。
2. **改动顺序**：先跑 `pnpm run test:gui` + 两套 `tsc`，再 `pnpm run build`（否则浏览器读到旧产物，会被误判成 bug）。
3. **遇到 404 / Failed to fetch**：先区分「产物缺失」「路由缺失」「连接断开」三类，再动手；这三类症状在当前代码里长得几乎一样。
