---
description: "rc.3 R4-用户指定批：插件管理页改卡片式布局；彻底删除 codex 与 claude 两个子智能体包（含全仓注册点）。含批次、红线、验证矩阵。"
kind: "plan"
---

# 插件管理页卡片化 + 删除 codex/claude 子智能体包

- 日期：2026-10-31 · 前置：R3 已提交。R4（D 余项）暂缓，按用户指定先做本批。
- 两项彼此独立：A = ui-plugin-manager 卡片式布局；B = 删除 `@qilin-agent/subagent-claude-code` 与 `@qilin-agent/subagent-codex` 及其全部注册点。

## 1. 现状与落点

- 截图页面为 `ui-plugin-manager` 的插件设置页（`PluginManagerPage.tsx` + `PluginManagerPage.module.css`，`basicTitle: 内置插件配置` 与「实验性插件」分组）；当前为整宽行列表。
- 两子智能体包在树：`packages/subagent/subagent-claude-code`、`packages/subagent/subagent-codex`；65 处引用已盘点（根 package.json、tsconfig.base/host、vitest 排除表、no-unknown-casts 基线、release 家族/发布校验、entrypoints 白名单、subagent README 双语、preset skill packages.md、app-boot ON_DEMAND 与生成目录、plugin-manager/app-boot/base/ui-plugin-manager 测试、生成文档、历史计划与升级指南）。

## 2. 批次

### A（队友 plugin-cards，独占 packages/client/ui-plugin-manager）
- [x] 「内置插件配置」由整宽行改响应式卡片网格（图标 + 标题 + 说明，整卡可点、hover/focus 反馈，保留配置页导航）
- [x] 「实验性插件」改卡片网格（图标 + 标题 + 实验性徽标 + 说明 + 开关），「更多」保留为网格尾部的轻量入口
- [x] 删除本包内对 subagent-claude-code / codex 的引用（预览/图标/测试）
- [ ] 既有 locale 键（zh/en）不动语义；新增键须双语
- [x] 更新本包 client spec（结构断言随卡片化调整，行为断言保留）
- 验证：`pnpm exec vitest run --config vitest.config.ts packages/client/ui-plugin-manager/tests`；client tsc；oxlint

### B（队友 drop-agents，独占其余全部注册点）
- [ ] `git rm -r` 两个包目录
- [x] 根 package.json 依赖两条；tsconfig.base 别名两条；tsconfig.host 引用两条；vitest 排除表两条
- [x] scripts/no-unknown-casts.baseline.json 四个键；scripts/release/families.spec.ts；scripts/release/verify-published.spec.ts（示例包名换成现存包）；scripts/verify-application-entrypoints.ts 两条白名单
- [x] packages/subagent/README 双语表格行；preset skill `cordis-composition-reference/references/packages.md` 两行
- [x] app-boot `official-bundle-packages.ts` 的 ON_DEMAND 两条 + 相关测试；plugin-manager 四个测试；bundle/base 测试
- [ ] 不跑 pnpm install、不跑生成器、不动 ui-plugin-manager（lead/A 归属）
- 验证：app-boot、plugin-manager、base 相关 spec；两个 gate 脚本按需；报告剩余引用

### Lead
- [x] pnpm install（lockfile）；目录再生（config/kylin/tool/doc-graphs/module-graph/client）；official-bundle-catalog 生成
- [ ] 文档门、双 face tsc、组合门、快照影响评估（preset skill 文本变化会影响 skill-load 快照，按既有基线口径处理）
- [x] 合并复核、回填本计划、提交

## 3. 红线

1. 删除范围只限两个 subagent 包；`hooks-claude-code`、`hooks-codex`、`claude-code-mods`、`client-ui-claude-code-mods` 保留。
2. 卡片化不改页面信息架构与交互语义（开关、更多、配置页导航、a11y role/focus 保留）。
3. 共享文件（tsconfig/vitest/scripts/根 package.json/子目录 README/preset skill）仅 B 修改；ui-plugin-manager 仅 A 修改。
4. 历史 plans/ 与升级指南按历史记录保留，不改写。

## 4. 执行状态

- 2026-10-31：开工；两批派队友并行。
## 5. 执行状态（2026-10-31）

- **A 完成（model-order 承接）**：PluginManagerPage 三组统一卡片网格（2 列，≤900px 单列）；实验性组组属徽标；More 移入网格尾部；卡面 hover/focus/reduced-motion；开关点击不导航；332 例绿 + client tsc 0 + oxlint 0。
- **B 完成（contract-plugins 承接）**：git rm 43 文件；18 处注册点更新（根 package.json/tsconfig×2/vitest 排除/unknown-casts 基线 5 键/families+verify-published/entrypoints 白名单/subagent README 双语/preset skill packages.md/ON_DEMAND=[] 与测试/plugin-manager 四测试/base 测试）；38 文件 1081 例绿（含生成物再生后 catalog 断言）；release 72 例绿。
- **lead 收口**：pnpm install（383 工程）；七个生成器全 OK（含 official-bundle-catalog）；test:docs **21/21 全绿**；双 face tsc exit 0；verify-md-links/entrypoints 绿；oxlint 0。历史升级指南因删除后出现断链，按事实最小改写为纯文本（唯一例外，已记录）。
- **预存在红（非本批）**：`pnpm run verify-no-unknown-casts` 报 packages/experimental/client-ui-stats/tests/stats-fold.client.spec.ts:104 的 `as unknown as`（HEAD 基线即无登记，rc.2 C2 遗留）；未在本批处理。
