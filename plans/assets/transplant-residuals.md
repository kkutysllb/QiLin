# 移植残差台账(P1 transplant residuals)

- 建档日期:2026-08-28
- 对象仓库:/Users/libing/kk_Projects/qilin-engine(基线 f4703c4,标签 pristine-dsh-0.1.1-rc.2;P1-S2 rescope 提交 3deb573;P1-S3 CLI bin 与品牌字符串提交 8be4e61)。
- 用途:登记「不能机械改名、未随 codemod 处置、或改名后仍需人工/流程跟进」的残差项,防止其在总计划 §7 上游移植与测试阶段被遗忘。每条残差必须归入下列四分类之一,处置后更新状态。

## 四分类法

| 分类 | 含义 |
|---|---|
| import 名漏改 | 源码/配置中 import、require、动态拼名等包名引用未被 codemod 覆盖,指向不存在的新名或残留旧名 |
| fixture 期望串 | 测试快照/期望文件中冻结的包名字符串;须随快照再生成流程更新,不手工改写 |
| 脚本硬编码 | 脚本/CI 中硬编码的包名;改名后须同步,否则脚本静默失效 |
| 真回归 | 改名引入的真实行为破坏(构建/测试/运行失败) |

## P1-S2 codemod 残差(2026-08-28)

机械规则 `@deepseek-ai/dsh-` → `@qilin/`:18242 处 / 3494 文件;特例:根包名 → `@qilin/engine-root`(5 处)、裸名 CLI → `@qilin/cli`(42 处 / 29 文件)。处置后,全仓跟踪文件(除 vendor/)仅剩下列 2 处 `@deepseek-ai/dsh`。

> **计数口径复核(S2 质量审查,2026-08-28)**:以 `git grep -o '@deepseek-ai/dsh-' 3deb573^ -- ':!vendor'` 实测为 **18239 处 / 3494 文件**,文件数与台账一致,处数差 3。差额已定位:CLAUDE.md 与 examples/CLAUDE.md 为指向 AGENTS.md 与 examples/AGENTS.md 的符号链接,codemod 按文件系统路径计数时跟随链接视图,重复计入 AGENTS.md 的 2 处与 examples/AGENTS.md 的 1 处(合计 +3);两链接本体因 BSD sed 跳过写入(见边界声明),被计数的链接视图替换并未发生,本体文件正常替换。复核与后续统计一律以 **18239 处(git grep -o 口径)** 为准。

| # | 位置(引擎仓相对路径) | 分类 | 状态 | 说明 |
|---|---|---|---|---|
| R1 | scripts/snapshots/translation-prompt-v4/request-response.expected.json:11 | fixture 期望串 | 未处置(遗留) | 冻结的 translation-prompt v4 期望快照,内嵌 README 原文含裸名 `@deepseek-ai/dsh`(npx 运行命令);该命令名已随 S3 定案为 `@qilin/cli`(bin 名 `qilin`),仍属 fixture 期望串,须随快照再生成流程收敛,不手工改写 |
| R2 | scripts/snapshots/translation-prompt-v4/request-response.expected.json:15 | fixture 期望串 | 未处置(遗留) | 同 R1(中文侧对应快照;定案新名同上 `@qilin/cli`) |

附注:该快照文件内的连字符形 `@deepseek-ai/dsh-*` 引用已被机械规则改写,v4 快照与其生成器当前输出已存在漂移;P1 测试阶段再生成快照时一并消除 R1/R2。

## 已处置的脚本硬编码(备查,不属未决残差)

| # | 位置 | 原值 | 新值 |
|---|---|---|---|
| H1 | package.json(根包)`"name"` | @deepseek-ai/dsh-root | @qilin/engine-root |
| H2 | scripts/publish-npm-baseline.ts:266 | '@deepseek-ai/dsh-root' 等值判断 | '@qilin/engine-root' |
| H3 | scripts/publish-npm-baseline.ts:808 | '@deepseek-ai/dsh-root' 等值判断 | '@qilin/engine-root' |
| H4 | scripts/release/families.ts:37 `WORKSPACE_ROOT_PACKAGE` | '@deepseek-ai/dsh-root' | '@qilin/engine-root' |
| H5 | scripts/verify-dsh-package-licenses.spec.ts:23 | '@deepseek-ai/dsh-root' | '@qilin/engine-root' |
| H6 | scripts/publish-npm-baseline.ts:37 `RELEASE_ENTRY_PACKAGE` | '@deepseek-ai/dsh' | '@qilin/cli' |
| H7 | scripts/publish-npm-baseline.ts:457 node_modules 路径 | @deepseek-ai/dsh/lib/bin.js | @qilin/cli/lib/bin.js |
| H8 | scripts/release/families.ts:359 `installedEntry` | '@deepseek-ai/dsh' | '@qilin/cli' |
| H9 | scripts/release/families.spec.ts:72,85,243 | '@deepseek-ai/dsh' | '@qilin/cli' |
| H10 | scripts/check-workspace-constraints.ts:60 | '@deepseek-ai/dsh' 允许产物映射键 | '@qilin/cli' |
| H11 | scripts/verify-dsh-package-licenses.spec.ts:33 | '@deepseek-ai/dsh' | '@qilin/cli' |

> **H9 行号复核(S2 质量审查意见「:243 → :242」)**:经 git 实测,基线 3deb573^ 与现行 HEAD 的 families.spec.ts 中第三处包名引用均在 **:243**(`expect(releaseFamily('dsh').installedEntry)…` 行;:242 为 it 起始行),该更正意见不成立,**维持 :243 不变**,留痕备查。实测命令:`git grep -n "'@deepseek-ai/dsh'" 3deb573^ -- scripts/release/families.spec.ts`(恰命中 3 行::72、:85、:243)。

apps/cli 的 `@module` 注释、根与 apps/cli 的 README(中英)、packages/bundle/base/README(中英)及 .agents/notes 历史笔记中的裸名引用(合计 42 处 / 29 文件)已随 CLI 特例一并改为 `@qilin/cli`,不属残差。

> **.agents/notes 子集明细(S2 质量审查补注,实测 22 处 / 12 文件)**:基线 3deb573^ 中 .agents 下裸名 `@deepseek-ai/dsh` 共 22 处 / 12 文件,均为 6 对中英笔记:proposed/process/2026-08-04-artifact-first-npm-baseline-publication(2+2)、implemented/simplification/2026-08-12-production-dsh-excludes-product-subagent-providers(3+3)、implemented/process/2026-08-13-public-vendor-and-native-sequences(1+1)、implemented/process/2026-08-10-npm-release-sequences(2+2)、implemented/feature/2026-07-20-dsh-cli-personal-config(1+1)、implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol(2+2)。均已随 CLI 特例改写为 `@qilin/cli`,现行残留 0。

## P1-S3 CLI bin 与用户可见品牌字符串(2026-08-28,提交 8be4e61)

### 已处置(计数)

| 项 | 计数 | 说明 |
|---|---|---|
| bin 字段改名 | 3 | apps/cli `dsh`→`qilin`;examples acp-demo `dsh-acp-demo`→`qilin-acp-demo`;examples jsonrpc-demo `dsh-jsonrpc-agent`→`qilin-jsonrpc-agent`(bin 值路径不变) |
| 根 scripts 键 | 1 | 根 package.json 键 `dsh`→`qilin`(命令体不变) |
| 文档/脚本中命令调用与指代 | 274 处 / 81 文件 | `pnpm dsh`/`dsh <cmd>`/`npx` 调用与「本 CLI/本产品」指代,含根与 apps/cli README(中英)、docs、examples、AGENTS.md、SKILL.md、apps/web/vite.config.ts、agent-presets 配置注释等 |
| CLI 自标识字符串 | 28 处 | apps/cli/src:commander `.name`/`.description`、HELP_EXAMPLES、argument 帮助文本、错误消息、NAME 诊断前缀(dump-config/plugin/profile-boot)及注释命令名 |
| 包内品牌错误前缀/输出 | 约 27 处 | app-boot profile.ts 错误消息与注释、web-app(opening 提示、URL 行、系统提示段)、headless(错误前缀、usage)、cmdline、acp-demo/jsonrpc-demo NAME、apps/web/package.json description、apps/cli/tsdown.config.ts |
| 测试断言/探针同步 | 58 处 / 9 文件 | built-bin.e2e、web-browser-open.snapshot(URL 正则 `dsh web:`→`qilin web:`、`dsh browser-open:` 前缀)、smoke-real.e2e、windows-shell、headless-shutdown、source-launch.compat、web-app.spec、fixtures/open.mjs |
| 快照同步 | 数据快照 3 个 + 测试代码快照(.snapshot.ts)3 个 | 数据快照:headless-profile/stderr.expected.txt(`dsh:`→`qilin:` 错误前缀)、acp skill-load/session.jsonl、apps/web skill-tool-row/ui.expected.md(SKILL.md 文本随源同步);测试代码快照:apps/cli/tests/web-browser-open.snapshot.ts、examples/acp-agent/tests/acp.snapshot.ts、examples/jsonrpc-agent/tests/sdk.snapshot.ts;README.i18n.yaml 双语 blob hash 重算仅 apps/cli 一对(S3 时点) |
| 品牌标题/生成器 | 6 处 | composition.md 标题、gen-doc-graphs.ts(标题+title map)、graph-atlas(中英)、根 README 首屏品牌段(中文侧完整;英文 H1 `# DeepSeek Harness` 在 S3 初版遗漏,由引擎仓修复提交 6c7a8b1 补齐为 `# QiLin`,并中英对称补 fork 出处行)、AGENTS.md 首段 |
| translation pairing 门禁重录 | 438 对基线 | 门禁自 S2 rescope 起漂移、S3 品牌改名再增(质量审查口径:S2 期 854 文件级 + S3 新增 74,合计 876 文件级 = 438 对 × 2,其中仅 apps/cli 一对曾随 S3 重录);已由引擎仓修复提交 6c7a8b1 以 `pnpm run verify-translation-pairing --write --all` 全量重录收敛,重录后 `pnpm run verify-translation-pairing` 实测 1003 对全查一致(exit 0),无内容真不同步残留 |

变更合计:128 文件 / 395 行(8be4e61);`git diff --name-only | grep -c '^vendor/'` = 0。

> **S3 计数口径(S4 复核用)**:总量以 `git show 8be4e61 --shortstat` 复核(实测 128 files changed, 395 insertions(+), 395 deletions(-))。分项计数(274 处/81 文件、58 处/9 文件、28 处、约 27 处等)为 S3 执行时按改动行人工归类的分项口径,与 git grep -o 全量口径不可直接相比——后者含未随 S3 改动的历史引用,如 `git grep -oE '(pnpm |npx )?dsh([ <]|$)' 8be4e61^ -- ':!vendor'` 实测 946 处 / 309 文件。S3 后命令调用残留以 `git grep -nE '(pnpm|npx) dsh\b' HEAD -- ':!vendor'` 实测为准(0 处);其余旧名残留按「其他登记」各条目口径跟踪。

### 顺延项(三条,含定案条件)

1. **repository/homepage/bugs 字段(约 238 处指 deepseek-ai/deepseek-harness)**:待引擎仓远端仓库 URL 定案后批量改写;定案条件 = 新远端在代码托管平台建成并可推送。
2. **shields.io 徽章(19 个 md)**:待发布渠道与 npm scope 展示策略定案后同步;定案条件 = 新 npm scope 发布流程首轮跑通。
3. **docs 内上游出处链接(48 处)**:保留出处价值(上游论文/决策/规范链接),默认不动;仅当总计划定案「完全去上游化」时批量替换。

### 其他登记(S3 执行中发现,留测试阶段/后续阶段)

- **CI/发布命名域**:`release:* --family dsh`、`dsh-v*` tag 约定、runner 标签(dsh-windows-*/dsh-ubuntu-*)、`dsh-npm-tarballs` artifact、issue-management actor(`dsh-issue-management` 等)、`.gitattributes` merge driver(`dsh-translation-pairing`)。牵动发布流水线与基础设施,待发布家族改名定案后统一处置。
- **Python 发行链 exe 名**:`dsh-jsonrpc-agent-pkg-*`(CI、.gitignore、python/ 文档)与 npm bin 名解耦,待 Python SDK 发行物定名后统一改。
- **.agents/notes 历史档案**:旧短包名(`dsh-session`/`dsh-tools`/`dsh-mode` 等)约 495 处及历史命令 `pnpm dsh` 引用;属历史决策记录,按档案纪律不改写。
- **manifest 数据键**:`dsh.profile`/`dsh.bundle`/`dsh.client` 及 `"dsh": { … }` manifest 节(含 apps/cli src、app-boot、scripts 校验器、测试 fixture、文档示例);属线上数据格式,S 计划数据格式阶段处置。
- **env 前缀**:`DSH_HOME`/`DSH_SNAPSHOT`/`DSH_TELEMETRY_DISABLED`/`DSH_WEB_URL`/`DSH_TOOLS_MODE`/`DSH_BUILD_FACE`/`__DSH_BOOT__` 等(S7);apps/cli `loadLayeredEnv('dsh')` 的 env 层参数与 env 诊断前缀 `dsh:` 随 S7 一并定案,当前过渡态下 web 消息前缀已为 `qilin`、env 诊断前缀仍为 `dsh`。
- **bundle 名域**:`dsh-base`/`dsh-web-app`/`dsh-headless`/`dsh-client-hmr` 链接文本与 mermaid 节点 ID(`plugin_dsh_base_*`、composition.md、module-graph)、示例插件名 `dsh-hello-plugin`、badge 资产(`dsh-badge`/`skill-badge`)与 `.dsh/` 用户目录名;**generator 旧短名扩围(S3 质量审查补登记)**:scripts/gen-doc-graphs.ts 文案 4 处——:156 `dsh-typert-loader`、:366 `dsh-agent`、:486 `subagent-dsh-sdk`、:1327 `dsh-compaction-basic`,及其对应生成文档(graph-atlas 等)。定案条件:与 bundle 名域一起在发布家族改名时批量处置。
- **web UI 前端品牌**:`DEFAULT_CLIENT_TITLE = 'DSH Local Build'`(apps/web/vite.config.ts)及前端 UI 品牌字符串;牵动 web 快照集,待 web 前端阶段处置。
- **杂项**:`dsh-llm-mock-server`(llm-mock-server usage 文本,无对应 bin 字段)、translation-prompt v4 快照内嵌的旧版 README(见 R1/R2 同文件)、`BRAND_GUIDELINES.md/.zh` 与 `CONTRIBUTING.md/.zh` 的 DeepSeek Harness 品牌句(上游品牌/社区文档)、THIRD_PARTY_NOTICES 之外的第三方声明、测试 fixture 内部标识(`dsh>` prompt、tmpdir 前缀 `dsh-*`)。

## P1-S4 构建与类型门禁(2026-08-28,零修复,引擎仓无新提交,HEAD 保持 6c7a8b1)

rescope(3deb573)后第一次真实类型级检验。门禁结果:

| 门禁 | exit | 耗时 | 错误数 | 备注 |
|---|---|---|---|---|
| pnpm install | 0 | 238ms | — | 幂等确认,Already up to date(246 workspace projects) |
| pnpm run build(scripts/build.ts) | 0 | 44.36s | 0 | 200 client artifacts;仅 vite chunk-size 提示,非错误 |
| pnpm run typecheck(host tsc -b + tsdown host + client tsc -b) | 0 | 7.22s | 0 | 首跑含构建,绿 |
| 附加:tsc -b tsconfig.host.json --force | 0 | 18.05s | 0 | 排除 tsbuildinfo 增量缓存掩盖的复核 |
| 附加:tsc -b tsconfig.client.json --force | 0 | 15.06s | 0 | 同上 |

### 四分类计数

| 分类 | 计数 | 说明 |
|---|---|---|
| a. import 名漏改 | 0 | 全树普查(排除 vendor/node_modules/dist/.git)旧 dsh 名仅命中 fixture 期望文件(见 c 类);package.json workspace 依赖、tsconfig paths 均无旧 dsh 名 |
| b. 脚本硬编码 | 0 | 根 scripts 的 `--filter @deepseek-ai/website` 与 website 包实际名一致(website 不在 rescope 映射范围,D6 边界),非残留;tsconfig.base.json `@deepseek-ai/*` vendor paths 与 pnpm-workspace.yaml vendor link 为有意保留;tsconfig.host.json:276 引用的是磁盘目录路径 `packages/subagent/subagent-dsh-sdk`(目录名按既定策略不改,包名已为 `@qilin/subagent-dsh-sdk`),路径有效 |
| c. fixture 期望串 | 1 文件 / 2 处 | 即既有 R1/R2(scripts/snapshots/translation-prompt-v4/request-response.expected.json:11、:15,内嵌旧版 README 的 `npx @deepseek-ai/dsh web`),状态不变(未处置,遗留);本步构建不跑测试,不影响门禁 |
| d. 真回归/语义问题 | 0 | build 与 typecheck 全绿,无类型不匹配/缺失导出/逻辑错误 |

### 已修复项(a/b)

无 —— a/b 类均为 0,按「零修复则不提交」规则引擎仓未产生修复提交,HEAD 保持 6c7a8b1。

### 顺延项(c/d)

- R1/R2(唯一顺延项,无新增):translation-prompt v4 期望快照内嵌旧 README 串,须随 P1 测试阶段快照再生成流程收敛,不手工改写。完整现场见归档日志 plans/assets/s4-logs/(qilin-s4-build.log、qilin-s4-typecheck.log、qilin-s4-typecheck-force.log,源自 /tmp/qilin-s4-*.log 同名文件)。

### 普查口径留痕

`grep -rn '@deepseek-ai/dsh'`(排除 vendor/node_modules/dist/.git)全树命中 1 文件 2 行 = R1/R2;带引号的 `"@deepseek-ai/dsh"` 依赖键在全部 package.json 命中 0;pnpm-workspace.yaml/tsconfig*.json 中 `@deepseek-ai/*` 引用全部为 vendor 上游保留名(D6 边界)。

## 分类为空声明(截至本档)

- import 名漏改:0 —— 全仓跟踪文件(除 vendor/)扫描,`@deepseek-ai/dsh` 仅剩 R1/R2 两处 fixture 串,无代码/配置漏改。
- 真回归:0 —— S4 已实测构建与类型门禁双绿(build/typecheck exit 0、0 错误,含 --force 全量复核),详见 P1-S4 段;运行时/测试套件回归风险(URL 行/错误前缀相关 e2e 与快照用例)仍留待 P1 测试阶段验证。

## 边界声明(非残差)

- 非 dsh 的 `@deepseek-ai/*` scope 按 D6 保留原名,机械规则未触碰:`@deepseek-ai/cordis`(2137 处)、`@deepseek-ai/schemastery`(400 处)、`@deepseek-ai/cordis-plugin-loader`(219 处)等 vendor 上游包名及其引用。
- CLAUDE.md 与 examples/CLAUDE.md 为符号链接(→ AGENTS.md / examples/AGENTS.md),BSD sed 不支持对符号链接就地编辑而跳过;两个目标文件均已完成机械改写,链接视图随目标更新,无残差(计数口径影响见上方复核注记)。
- S3 未触碰 vendor/ 一切(验证:改动文件清单 0 个 vendor 路径)。
