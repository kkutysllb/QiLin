# Agent Note: Kylin 框架改名

Status: implemented

[English](2026-09-14-kylin-framework-rescope.md) | 中文

## 问题

vendored 的 Cordis 框架在所有产品表面都顶着上游名。产品决策将框架定名为 **Kylin**：基于上游 Cordis 的独立框架身份，以我们自有的 `@qilin` scope 发布。

## 决策

vendored 的 cordis 包家族从 `@deepseek-ai/cordis*` 迁移到 `@qilin/kylin*`，由常设 codemod 完成：[`scripts/rescope-vendor.ts`](../../../../scripts/rescope-vendor.ts) 先以旧表执行 `--apply --reverse`，随后将其 RENAMES/EXACT_EDITS/POSTCONDITIONS 更新为新名，再执行 `--apply` 与 `--check` 完成往返。基础库（`@deepseek-ai/cosmokit`、`@deepseek-ai/schemastery`）保留原 scope；它们不承载 Cordis 品牌。vendor 目录名保持不变（`vendor/cordis/`），沿用 rescope 先例。

有意不改：`cordis.yml` 配置文件家族与 Loader 的 `cordis:` 内建前缀（磁盘持久格式）、`cordis/*` 事件域、`cordis/tree` 等 Inspector 主题、`cordis` agent-preset id（模型可见的产品数据）、`Symbol.for('schemastery')`，以及 `THIRD_PARTY_NOTICES.md` 与 `vendor/README.md` 清单中的上游归属（MIT 义务指名上游项目，而非我们的 scope）。

[`scripts/verify-npm-install-layout.ts`](../../../../scripts/verify-npm-install-layout.ts) 按名将框架豁免于合成双 release 方案：框架是唯一共享的 peer 层，按 release 合成版本会与它同时断言的单份共享安装不变量自相矛盾。

## 验证

`pnpm run rescope-vendor:check` 验证无残留、精确编辑全落、幂等；`verify-vendored-links` 解析全部 9 个 vendored 名；`verify-cordis-config` 通过 144 个配置文件；完整 `pnpm run typecheck` 通过；core 与 boot 套件 1159/1160 通过，唯一失败是 HMR 观察器时序抖动，隔离复跑通过；typert type-model 快照按新模块名重新生成。

## 曾考虑的替代方案

- **一次性盲扫改名** —— 纯 token 重写无法区分框架名、上游归属、协议前缀与产品键；codemod 的界定 token 规则加精确编辑计数才拥有这层区分。
- **把 cosmokit 与 schemastery 一并迁到 `@qilin`** —— 它们不承载 Cordis 品牌；扩大 diff 换不来命名清晰度。推迟到出现需要时。
- **连 `cordis.yml` 与 `cordis:` 前缀一起改名** —— 磁盘持久格式；改名会让所有现存 profile、preset 与录制快照失效，功能收益为零。

## 后果

引用 `@deepseek-ai/cordis*` 行的组合不再解析；产品处于预发布阶段，不提供迁移。后续阶段改名 harness 自有的 `@qilin/*cordis*` 包与文档散文；录制会话快照按新插件行名刷新。
