# Agent Note: 设置导航按槽位胜出单元格投影，被遮蔽的设置节不再留下死行

Status: implemented

[English](2026-09-15-settings-nav-winner-projection.md) | 中文

## Problem

设置外壳的导航行此前从 `ctx.slots.entries('settings.section')` ——原始台账视图——构建，而内容列经渲染机制的胜出投影（`entriesOfSlot`：每个 list id 一个单元格，存活条目中优先级最低者胜出）绘制。于是，一个遮蔽他方单元格的注册（同 id、更低优先级）会让原生行继续列在导航里，胜出者却渲染在它的位置；渲染为空的胜出者也会留下带标签的死行。coding-sidebar 集成正撞上这一点：其 QiLin 通道以 priority -1 注册同一个 id 来替换原生 `sidebar-right` 设置页，本修改之前导航仍列着那条已无法渲染的原生行。

## Decision

`ui-settings-general` 把它消费的两个 list 台账——设置节导航行与引导步骤——都改经 `ctx.slots.entriesOfSlot` 投影，导航列出的正是渲染器会绘制的单元格。外壳不引入任何插件感知：遮蔽是槽位系统文档化的组合机制（"register at a different priority to shadow it — lowest renders"），外壳现在以与内容列相同的口径承认它。

## Consequences

- 替换型设置页以更低优先级注册原生 id 后不会多出也不少行：一条导航行、一页，标签与顺序归胜出者；释放遮蔽即恢复原生行。
- 原始台账检查仍可通过 `ctx.slots.entries` 读取，供需要每条注册的工具使用。
- `settings.onboarding` 的步骤选择同样按胜出投影，被遮蔽的步骤不会再被选中后渲染为空。

## Alternatives considered

- 过滤掉胜出者渲染为空的行：组件对外壳不透明，不存在诚实的判定谓词。
- 给 `ui-sidebar-right` 加配置开关跳过其设置注册：把替换插件已拥有的组合决策搬进 QiLin，还要为唯一消费方引入第一个客户端插件 Config 面。
- 直接删除原生注册：patch 层只能禁用整个条目而非单条贡献，且 `ui-sidebar-right` 必须为它的 `sidebarRight` 服务保持挂载。

## What was given up

- 导航不再显示"注册存在但被遮蔽"的设置节——这是设计意图；调试组合的人经 `slots.entries` 或 `slots.snapshot()` 读原始台账。

## Required verification

`packages/client/ui-settings-general/tests/shell.client.spec.ts` 覆盖胜出投影的导航行与引导步骤（含遮蔽释放后恢复）；vendored 插件的实机行为已在浏览器验证（单条「侧边卡片」导航行替换原生「侧边栏」行）。
