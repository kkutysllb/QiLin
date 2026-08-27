# 移植残差台账(P1 transplant residuals)

- 建档日期:2026-08-28
- 对象仓库:/Users/libing/kk_Projects/qilin-engine(基线 f4703c4,标签 pristine-dsh-0.1.1-rc.2;P1-S2 rescope 提交 3deb573)。
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

| # | 位置(引擎仓相对路径) | 分类 | 状态 | 说明 |
|---|---|---|---|---|
| R1 | scripts/snapshots/translation-prompt-v4/request-response.expected.json:11 | fixture 期望串 | 未处置(遗留) | 冻结的 translation-prompt v4 期望快照,内嵌 README 原文含裸名 `@deepseek-ai/dsh`(npx 运行命令);无定案新名对应,须随快照再生成流程收敛,不手工改写 |
| R2 | scripts/snapshots/translation-prompt-v4/request-response.expected.json:15 | fixture 期望串 | 未处置(遗留) | 同 R1(中文侧对应快照) |

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

apps/cli 的 `@module` 注释、根与 apps/cli 的 README(中英)、packages/bundle/base/README(中英)及 .agents/notes 历史笔记中的裸名引用(合计 42 处 / 29 文件)已随 CLI 特例一并改为 `@qilin/cli`,不属残差。

## 分类为空声明(截至本档)

- import 名漏改:0 —— 全仓跟踪文件(除 vendor/)扫描,`@deepseek-ai/dsh` 仅剩 R1/R2 两处 fixture 串,无代码/配置漏改。
- 真回归:0 已发现 —— 本次未运行构建/测试套件,由 P1 后续 install/build/test 验证阶段跟踪。

## 边界声明(非残差)

- 非 dsh 的 `@deepseek-ai/*` scope 按 D6 保留原名,机械规则未触碰:`@deepseek-ai/cordis`(2137 处)、`@deepseek-ai/schemastery`(400 处)、`@deepseek-ai/cordis-plugin-loader`(219 处)等 vendor 上游包名及其引用。
- CLAUDE.md 与 examples/CLAUDE.md 为符号链接(→ AGENTS.md),BSD sed 不支持对符号链接就地编辑而跳过;两个目标文件均已完成机械改写,链接视图随目标更新,无残差。
