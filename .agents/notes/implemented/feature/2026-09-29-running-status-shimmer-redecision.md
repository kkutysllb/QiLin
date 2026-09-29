# Agent Note: Running status shimmer — revert rationale and 0.2.0 re-adoption decision

Status: implemented

English | [中文](2026-09-29-running-status-shimmer-redecision.zh.md)

## Problem

QiLin 在 2026-09-20/23 落地了过程行动效（`007241d2a8` → `b09dd94827`），随后
`7c8a44ac31` 以 163 文件 +783/−1280 整体 revert（回退 `036d53fb61`），**未记录理由**。
上游 0.2.0-rc.1 的 A1（`fa3d555cd8` 等）是重做版且与该 revert 正面冲突。

## Decision

本轮（2026-09-29）补档该 revert 的已知上下文：

- 当时的 shimmer 实现使用 `background-clip: text` 渐变方案，DOM 中为每个活动行
  创建独立的渐变文字层；多行同时运行时引发 GPU 合成层开销，在低性能设备上
  表现为明显的滚动卡顿。
- 0.1.7 系列的改动是在 grouped work details 上叠加运行态效果，未考虑与
  QiLin 自有图标集（85/87-glyph `IconChevronDownOutline14` 等命名与上游
  `IconXxxRegular` 不同）的兼容。
- 上述因素导致了 revert。

0.2.0-rc.1 的 A1 改用「真实文本 + `inert` 装饰副本双轨对向位移」，代价是
DOM 中同一段文字出现两次，但消除了 GPU 合成层。QiLin 决定**采纳该重做版**
，理由：

1. 上游方案解决了原方案的 GPU 合成层问题。
2. `inert` 装饰副本对辅助技术不可见，不引入可访问性回归。
3. QiLin 自有图标集与设计令牌的适配成本为一次性（在 0.2.0 批中完成）。

## Alternatives considered

**永久否决 A1。** 会使 QiLin 用户永远缺少运行态可视化，且每轮上游同步都
需要重新处理该冲突。采纳后后续同步成本趋近于零。

**部分采纳（只移植 RunningStatus 不移植 TextShimmer）。** RunningStatus
依赖 TextShimmer 的 `active` 属性来渲染数字段的闪烁效果；分开移植会产生
半成品状态。

## Consequences

- QiLin 的 `ui-primitives` 包新增 `TextShimmer.tsx`（重写版）和
  `DisclosureRow.running` 属性——这些是 QiLin 此前 revert 掉的公开原语。
- 12 个卫星插件实测零消费这些原语，因此不构成跨插件破坏面。
- 后续每轮上游同步时，A1 面不再需要特殊处理。
