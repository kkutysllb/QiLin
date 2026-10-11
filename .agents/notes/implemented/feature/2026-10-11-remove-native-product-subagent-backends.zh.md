# Agent Note: 原生产品 subagent 后端已从产品中移除

Status: implemented

[English](2026-10-11-remove-native-product-subagent-backends.md) | 中文

## Problem

本 harness 曾随包交付两个可选 Profile Bundle——`@qilin-agent/subagent-codex` 与 `@qilin-agent/subagent-claude-code`——它们把真实的 Codex 或 Claude Code 产品作为一次性 subagent 运行（见[后端 Agent Note](2026-08-04-claude-code-and-codex-subagent-backends.zh.md)）。它们是 Official 按需目录里仅有的两项，因此每个 Profile 的插件页都把两者列为已安装插件，而随附预设也带着两条命名其委派工具的 disabled 行。

一个需要另一个产品的 CLI、它的身份凭据存储以及它自己的设置界面的后端，是逐部署的选择，不是随包默认值：产品要求两者都离开。

## Decision

两个包、它们的 Profile Bundle 补丁、本地化资源、图标，以及命名其工具的 disabled 预设行，都已从本仓移除。`ON_DEMAND_BUNDLES` 为空，生成的 `OFFICIAL_ON_DEMAND_CATALOG` 是空列表，而目录生成器把空准入清单当作一种可交付状态接受，而不是拒绝它。

`ctx.subagents` seam、`tool-subagent`、`tool-subagent-control`，以及进程内、ACP 与 Harness SDK 提供方均未改动。需要 Codex 或 Claude Code 子级的部署，自己在 `ctx.subagents` 上挂一条 host 平面提供方行，并补上对应的预设工具行；这方面的组合规则没有变化。

## Alternatives considered

**保留包，只清空目录。** 这些组合包仍会作为可安装层随包交付，插件页仍会列出它们，预设行仍会命名没有任何发布提供的工具——而这正是这次移除要终结的状态。

**禁用行但保留包。** 一条只有在用户安装了发布不再提供的包时才能启用的随附行是死路；被移除的那段注释本来就写着要先安装对应的 Bundle。

**保留目录条目但不保留包。** 目录由包自己的本地化元数据生成，并对着工作区 manifest 校验，所以缺包的条目根本无法生成。

## Consequences

**换来的：** 产品不再随包交付一个依赖另一个产品 CLI、身份验证与设置的集成。插件页只列出该部署实际安装的内容，随附预设也不再带有发布无法提供的提供方行。

**seam 保留其余提供方。** 进程内 spawn/fork、ACP 与 Harness SDK 均未改动，因此委派、一次性与可延续模式及其面向模型的工具行为照旧。

**重新引入任一后端是新决策，不是恢复。** 本仓没有任何东西在 `ctx.subagents` 上注册 `codex` 或 `claude-code`；将来若要有第一方集成，它需要自己写明归属、证据层级与清理契约。

**由目录驱动的覆盖在下一次广告组合包出现前没有随包示例。** 发布顺序规则用注入清单覆盖，生成器对它收到的任何输入做校验，但在准入清单为空期间，没有随包包会走到插件页的按需路径。
